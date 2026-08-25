import { mergeCopies, mergePhotos, mergeWishlistItems } from "../domain/merge.js";
import { type Copy, type Photo, type WishlistItem, isManualReleaseId } from "../domain/types.js";
import type { LocalStore } from "../local/LocalStore.js";
import { type ClockSource, tombstoneCopy } from "../local/copyWrites.js";
import { markUploaded } from "../local/photoWrites.js";
import { tombstoneWishlistItem } from "../local/wishWrites.js";
import type { SyncTransport } from "./transport.js";

/**
 * Reconciles the local store with the server.
 *
 * Sync is deliberately not in the read path: screens always read local, and this runs
 * alongside them. That is what lets the app work identically with and without an account —
 * and it is why turning sync off, or losing the network, changes nothing about what the
 * user can do.
 */

/** How the very first sync after signing in should treat the two collections. */
export type FirstSyncStrategy = "MERGE" | "KEEP_LOCAL" | "KEEP_ACCOUNT";

/** The server takes a hundred release ids at a time, so a large collection pages. */
const RELEASE_BATCH = 100;

export interface SyncResult {
  readonly pulled: number;
  readonly pushed: number;
  readonly cursor: number;
}

export class SyncEngine {
  constructor(
    private readonly store: LocalStore,
    private readonly clock: ClockSource,
    private readonly transport: SyncTransport,
  ) {}

  /**
   * Deletes go through the same stamped write path as any other edit. An unstamped
   * tombstone would lose every merge, and the copy would reappear on the next sync.
   */
  private async discard(copy: Copy, now: number): Promise<void> {
    await this.store.putCopy(tombstoneCopy(copy, this.clock, now));
  }

  /**
   * Signing in for the first time on a device that already has a collection.
   *
   * Nothing happens until the person chooses, because every option here is destructive in
   * one direction or another and none of them should be picked on their behalf.
   */
  async firstSync(strategy: FirstSyncStrategy): Promise<SyncResult> {
    if (strategy === "KEEP_ACCOUNT") {
      // Drop the local collection by tombstoning it, so the discard itself replicates
      // rather than leaving the records to come back from another device later.
      const now = Date.now();
      for (const copy of await this.store.listCopies()) {
        await this.discard(copy, now);
      }
      for (const wish of await this.store.listWishlist()) {
        await this.store.putWishlistItem(tombstoneWishlistItem(wish, this.clock, now));
      }
      await this.store.writePendingIds([]);
      return this.sync();
    }

    if (strategy === "KEEP_LOCAL") {
      // Snapshot what is local *before* pulling. Reading it afterwards would count the
      // account's records as local and keep exactly what this option is meant to discard.
      const localIds = new Set(await this.allCopyIds());

      const pulled = await this.pullAll();
      const now = Date.now();
      for (const copy of pulled.copies) {
        if (!localIds.has(copy.id) && copy.deletedAt === null) {
          await this.discard(copy, now);
        }
      }
      for (const wish of pulled.wishes) {
        if (!localIds.has(wish.id) && wish.deletedAt === null) {
          await this.store.putWishlistItem(tombstoneWishlistItem(wish, this.clock, now));
        }
      }
      await this.store.writePendingIds(await this.allCopyIds());
      return this.sync();
    }

    await this.store.writePendingIds(await this.allCopyIds());
    return this.sync();
  }

  /** A normal incremental sync: pull what is new, push what changed locally. */
  async sync(): Promise<SyncResult> {
    const pulled = await this.pullAll();
    await this.downloadMissingPhotoBytes(pulled.photos);
    await this.cacheMissingReleases();
    const pushed = await this.pushPending();
    return {
      pulled: pulled.copies.length + pulled.wishes.length + pulled.photos.length,
      pushed,
      cursor: await this.store.readSyncCursor(),
    };
  }

  private async pullAll(): Promise<{ copies: Copy[]; wishes: WishlistItem[]; photos: Photo[] }> {
    const applied: Copy[] = [];
    const appliedWishes: WishlistItem[] = [];
    const appliedPhotos: Photo[] = [];
    let cursor = await this.store.readSyncCursor();
    let hasMore = true;

    while (hasMore) {
      const page = await this.transport.pull(cursor);
      for (const remote of page.photos) {
        const local = await this.store.getPhotoIncludingDeleted(remote.id);
        const merged = mergePhotos(local, remote);
        await this.store.adoptPhoto(merged);
        appliedPhotos.push(merged);
        // A photo deleted anywhere is not worth the space here either.
        if (merged.deletedAt !== null) await this.store.deletePhotoBytes(merged.id);
      }
      for (const remote of page.wishes) {
        const local = await this.store.getWishlistItemIncludingDeleted(remote.id);
        const merged = mergeWishlistItems(local, remote);
        await this.store.adoptWishlistItem(merged);
        appliedWishes.push(merged);
      }
      for (const remote of page.copies) {
        // Tombstones included. Looking this up with getCopy would hide a locally deleted
        // copy, make the server's live version look like a record we had never seen, and
        // adopt it wholesale — resurrecting every delete on the next sync.
        const local = await this.store.getCopyIncludingDeleted(remote.id);
        const merged = mergeCopies(local, remote);
        await this.store.adoptCopy(merged);
        applied.push(merged);
      }
      cursor = page.cursor;
      hasMore = page.hasMore;
      await this.store.writeSyncCursor(cursor);
    }
    return { copies: applied, wishes: appliedWishes, photos: appliedPhotos };
  }

  /**
   * Uploads the bytes of any photo that only exists on this device.
   *
   * Runs before the metadata push on purpose: a photo record with no storageKey is one
   * other devices can see but never fetch, so the bytes have to land first.
   */
  private async uploadPendingPhotos(): Promise<void> {
    for (const photo of await this.store.listPhotosAwaitingUpload()) {
      try {
        const uploaded = await this.transport.uploadPhoto(photo);
        if (uploaded === null) continue;
        await this.store.putPhoto(markUploaded(photo, uploaded.storageKey, this.clock));
      } catch {
        // Offline, too large, or storage is down. The photo stays local and the next sync
        // tries again; nothing is lost and the picture still shows on this device.
      }
    }
  }

  /**
   * Fetches the catalogue entries for copies this device holds but cannot describe.
   *
   * A pulled copy names a release; it does not carry it. The catalogue is a shared cache
   * that sync deliberately does not move, so on a device that has just signed in every
   * copy arrives pointing at metadata it has never seen — a shelf of records with no
   * title, no artist and no sleeve. This is what fills that in.
   *
   * Asked over the whole local collection rather than only the page just pulled: a device
   * that synced before this existed already has the copies and is still missing the
   * releases, and it should heal on its next sync rather than only on the next new record.
   * The store is asked first, so the steady state is one local read and no request at all.
   */
  private async cacheMissingReleases(): Promise<void> {
    const copies = await this.store.listCopies();
    const wanted = [
      ...new Set(
        copies
          .map((copy) => copy.releaseId)
          // A hand-entered release is derived from the copy itself and is in no catalogue.
          .filter((releaseId) => !isManualReleaseId(releaseId)),
      ),
    ];
    if (wanted.length === 0) return;

    const held = await this.store.getReleases(wanted);
    const missing = wanted.filter((releaseId) => !held.has(releaseId));

    for (let from = 0; from < missing.length; from += RELEASE_BATCH) {
      const batch = missing.slice(from, from + RELEASE_BATCH);
      try {
        const releases = await this.transport.fetchReleases(batch);
        if (releases.length > 0) await this.store.cacheReleases(releases);
      } catch {
        // Offline, or the mirror is down. The shelf shows placeholders until the next
        // sync rather than failing the whole reconciliation over metadata.
        return;
      }
    }
  }

  /** Fetches the bytes for photos this device knows about but has never held. */
  private async downloadMissingPhotoBytes(photos: readonly Photo[]): Promise<void> {
    for (const photo of photos) {
      if (photo.storageKey === null || photo.deletedAt !== null) continue;
      if ((await this.store.getPhotoBytes(photo.id)) !== undefined) continue;
      try {
        await this.transport.downloadPhoto(photo);
      } catch {
        // Try again next sync. The strip shows a placeholder until then rather than
        // failing the whole reconciliation over one image.
      }
    }
  }

  private async pushPending(): Promise<number> {
    await this.uploadPendingPhotos();
    const pendingIds = await this.store.readPendingIds();
    if (pendingIds.length === 0) return 0;

    // One pending set covers both kinds, so a session that added a record and wished for
    // another sends a single request rather than racing two.
    const copies: Copy[] = [];
    const wishes: WishlistItem[] = [];
    const photos: Photo[] = [];
    for (const id of pendingIds) {
      const copy = await this.store.getCopyIncludingDeleted(id);
      if (copy !== undefined) {
        copies.push(copy);
        continue;
      }
      const wish = await this.store.getWishlistItemIncludingDeleted(id);
      if (wish !== undefined) {
        wishes.push(wish);
        continue;
      }
      const photo = await this.store.getPhotoIncludingDeleted(id);
      // A photo whose bytes never uploaded is not pushed: other devices would see a
      // record they can never fetch. It stays pending until the upload succeeds.
      if (photo !== undefined && (photo.storageKey !== null || photo.deletedAt !== null)) {
        photos.push(photo);
      }
    }
    if (copies.length === 0 && wishes.length === 0 && photos.length === 0) {
      await this.store.writePendingIds([]);
      return 0;
    }

    const response = await this.transport.push(copies, wishes, photos);
    // Adopt whatever the server decided, so the two sides are byte-identical afterwards
    // and the next push does not resend the same records.
    for (const merged of response.copies) {
      await this.store.adoptCopy(merged);
    }
    for (const merged of response.wishes) {
      await this.store.adoptWishlistItem(merged);
    }
    for (const merged of response.photos) {
      await this.store.adoptPhoto(merged);
    }
    if (response.cursor > 0) {
      await this.store.writeSyncCursor(response.cursor);
    }
    await this.store.writePendingIds([]);
    return copies.length + wishes.length + photos.length;
  }

  /** Everything the device holds, of both kinds — they share one pending set. */
  private async allCopyIds(): Promise<string[]> {
    const copies = await this.store.listCopies();
    const wishes = await this.store.listWishlist();
    return [...copies.map((copy) => copy.id), ...wishes.map((wish) => wish.id)];
  }
}
