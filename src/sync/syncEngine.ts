import { mergeCopies, mergePhotos, mergeWishlistItems } from "../domain/merge.js";
import {
  type Copy,
  type Photo,
  type Release,
  type WishlistItem,
  isManualReleaseId,
} from "../domain/types.js";
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

/** Set once this device has offered the server the catalogue it holds. */
const CATALOGUE_OFFERED = "catalogueOffered";

export interface SyncResult {
  readonly pulled: number;
  readonly pushed: number;
  /**
   * How many catalogue entries this sync filled in.
   *
   * Counted separately from `pulled` because it moves on its own: a device that pulled its
   * copies before the client fetched releases at all has nothing new to pull and still has
   * a whole shelf to redraw. A caller that refreshes its screens on `pulled` alone would
   * leave that device showing placeholders until the next reload.
   */
  readonly releases: number;
  /**
   * How many copies still have no catalogue entry after this sync.
   *
   * The shelf draws one of these as an untitled placeholder in the generic silhouette, so
   * a number above zero is the difference between "your collection is empty" and "your
   * collection is here but this device cannot describe it yet" — the two look identical
   * on screen and want opposite reactions from the user.
   */
  readonly releasesMissing: number;
  /**
   * Whether asking the mirror for catalogue entries failed outright.
   *
   * Separate from `releasesMissing` because the two are different problems wearing the
   * same placeholder: a request that never landed is worth retrying and worth saying out
   * loud, while an id the mirror simply does not hold will read the same on every attempt
   * and is not the user's to fix.
   */
  readonly releasesUnreachable: boolean;
  readonly cursor: number;
}

/** What one pass of {@link SyncEngine.cacheMissingReleases} managed to do. */
interface ReleaseRefill {
  readonly cached: number;
  readonly missing: number;
  readonly unreachable: boolean;
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
    await this.downloadMissingPhotoBytes();
    const releases = await this.cacheMissingReleases();
    try {
      await this.uploadUnmirroredCatalogue();
    } catch {
      // Offline, or the server is down. Unmarked, so the next sync offers it again.
    }
    const pushed = await this.pushPending();
    return {
      pulled: pulled.copies.length + pulled.wishes.length + pulled.photos.length,
      pushed,
      releases: releases.cached,
      releasesMissing: releases.missing,
      releasesUnreachable: releases.unreachable,
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
  private async cacheMissingReleases(): Promise<ReleaseRefill> {
    const copies = await this.store.listCopies();
    const wanted = [
      ...new Set(
        copies
          .map((copy) => copy.releaseId)
          // A hand-entered release is derived from the copy itself and is in no catalogue.
          .filter((releaseId) => !isManualReleaseId(releaseId)),
      ),
    ];
    if (wanted.length === 0) return { cached: 0, missing: 0, unreachable: false };

    const held = await this.store.getReleases(wanted);
    const missing = wanted.filter((releaseId) => !held.has(releaseId));

    let cached = 0;
    let unreachable = false;
    for (let from = 0; from < missing.length; from += RELEASE_BATCH) {
      const batch = missing.slice(from, from + RELEASE_BATCH);
      try {
        const releases = await this.transport.fetchReleases(batch);
        if (releases.length > 0) await this.store.cacheReleases(releases);
        cached += releases.length;
      } catch {
        // Offline, the mirror is down, or this one page was rejected. Carry on with the
        // rest rather than abandoning them: the batches are independent, and giving up on
        // the first failure left a large collection with only the pages before it — the
        // shelf then healed a hundred records per sync at best, and never at all if the
        // very first page was the one that failed.
        unreachable = true;
      }
    }
    // Recounted from what is actually held rather than subtracted from `cached`: the
    // mirror answers with the releases it has and stays silent about the rest, so a page
    // that returned fewer rows than it was asked for is a success and a shortfall at once.
    return { cached, missing: missing.length - cached, unreachable };
  }

  /**
   * The catalogue rows behind a batch of copies, as far as this device holds them.
   *
   * Hand-entered releases are left out -- they are derived from the copy itself and belong
   * in no shared cache -- and so is anything this device cannot describe either, which is
   * simply nothing to send.
   */
  private async catalogueFor(copies: readonly Copy[]): Promise<Release[]> {
    const wanted = [
      ...new Set(copies.map((copy) => copy.releaseId).filter((id) => !isManualReleaseId(id))),
    ];
    if (wanted.length === 0) return [];
    return [...(await this.store.getReleases(wanted)).values()];
  }

  /** Which of these releases the mirror can answer for, by id. */
  private async mirrored(releases: readonly Release[]): Promise<Set<string>> {
    const answered = await this.transport.fetchReleases(releases.map((release) => release.id));
    return new Set(answered.map((release) => release.id));
  }

  /**
   * Hands the server the catalogue behind copies it already has, once per device.
   *
   * Pushing a copy carries its release from now on, but a collection pushed before that
   * existed left the mirror with nothing -- and those copies are not pending any more, so
   * no ordinary push will ever mention them again. Every *other* device is then looking at
   * a shelf it cannot fill and never will, because ids the mirror has never seen are
   * absent from its answer rather than fetched.
   *
   * So a device that holds the catalogue offers it up once: ask which ids the mirror can
   * answer for, send the ones it cannot. Marked done afterwards, because in the steady
   * state this would be a whole-collection round trip on every single sync.
   */
  private async uploadUnmirroredCatalogue(): Promise<number> {
    if ((await this.store.readSetting(CATALOGUE_OFFERED)) === "true") return 0;

    const held = await this.catalogueFor(await this.store.listCopies());
    if (held.length === 0) {
      // Nothing to offer, and nothing to keep re-checking for either.
      await this.store.writeSetting(CATALOGUE_OFFERED, "true");
      return 0;
    }

    let offered = 0;
    let landed = true;
    for (let from = 0; from < held.length; from += RELEASE_BATCH) {
      const batch = held.slice(from, from + RELEASE_BATCH);
      const alreadyMirrored = await this.mirrored(batch);
      const unmirrored = batch.filter((release) => !alreadyMirrored.has(release.id));
      if (unmirrored.length === 0) continue;
      await this.transport.push([], [], [], unmirrored);
      // Asked again rather than assumed: a server too old to know the field answers 200 and
      // stores nothing, and this device gets exactly one go at offering. Taking that as
      // success is how the one repair a collection needs gets spent on nothing at all.
      const after = await this.mirrored(unmirrored);
      const accepted = unmirrored.filter((release) => after.has(release.id)).length;
      offered += accepted;
      if (accepted < unmirrored.length) landed = false;
    }
    // Only once the mirror can actually answer for them. A pass that threw, or one the
    // server quietly ignored, has to be able to say the same thing again next sync.
    if (landed) await this.store.writeSetting(CATALOGUE_OFFERED, "true");
    return offered;
  }

  /**
   * Fetches the bytes for every photo this device knows about but has never held.
   *
   * Over the whole collection, not over the photos this pass happened to pull. Scoped to
   * the pull it could only ever try once: a row that arrived before its bytes existed, or
   * whose download failed, cannot appear in a later pull, so "try again next sync" had no
   * next attempt and the picture was gone for good.
   *
   * And a missing file does not look like a missing photo. The art component is handed an
   * address for bytes that are not there, the image fails, and the copy falls back to the
   * catalogue's cover — so a photo starred on another device silently shows the pressing's
   * sleeve instead, and a hand-entered record, which has no catalogue to fall back to,
   * shows its format silhouette for ever.
   */
  private async downloadMissingPhotoBytes(): Promise<void> {
    for (const photo of await this.store.listAllPhotos()) {
      if (photo.storageKey === null || photo.deletedAt !== null) continue;
      if (await this.store.hasPhotoBytes(photo.id)) continue;
      try {
        await this.transport.downloadPhoto(photo);
      } catch {
        // Try again next sync — and now there really is one. The strip shows a placeholder
        // until then rather than failing the whole reconciliation over one image.
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

    const response = await this.transport.push(
      copies,
      wishes,
      photos,
      await this.catalogueFor(copies),
    );
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
