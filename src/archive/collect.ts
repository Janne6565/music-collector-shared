import { catalogueKeysOf } from "../domain/types.js";
import type { LocalStore } from "../local/LocalStore.js";
import { type AlbumCovers, albumsNeedingCovers, pressingsNeedingCovers } from "./albumCovers.js";
import { type McPhotoBytes, buildMcArchive } from "./mcArchive.js";

/**
 * Building an archive out of a local store.
 *
 * Reads the device, never the network — the same promise the CSV export makes. A person
 * with no account has a collection that exists only here, and that is exactly the person
 * an export matters most to.
 */

/**
 * Reading a photo's bytes is the one thing the two apps cannot share.
 *
 * The store's own `getPhotoBytes` hands back a `Blob`, and React Native's `Blob` is a
 * handle into a native registry with no way to get at the bytes in JavaScript. Each app
 * therefore passes its own reader: the browser goes through `Blob.arrayBuffer`, the phone
 * reads the file it already keeps on disk.
 */
export type PhotoByteReader = (photoId: string) => Promise<Uint8Array | undefined>;

/**
 * Resolving the wishlist's album covers, which only the app can do.
 *
 * The one part of an export that *is* a request. A wish's cover lives in the server's
 * mirror rather than in the collection, so an archive that did not ask would be complete
 * about everything except the pictures on the wishlist — which is precisely what goes
 * missing when the file is imported somewhere else. Best-effort: offline, or a deployment
 * that cannot answer, simply produces an archive with no covers, exactly as before.
 */
export type AlbumCoverResolver = (
  albumIds: readonly string[],
) => Promise<ReadonlyMap<string, string | null>>;

/**
 * The same thing for the pressings entries were made from, which the covers endpoint
 * cannot answer for: it is asked about albums, and an album has no way of saying which of
 * its pressings somebody picked. Optional for the same reason the album resolver is —
 * an export that cannot ask still writes a complete collection.
 */
export type PressingCoverResolver = (
  releaseIds: readonly string[],
) => Promise<ReadonlyMap<string, string | null>>;

export interface McExportCsv {
  readonly collection: string;
  readonly wishlist: string;
}

export interface McExport {
  readonly bytes: Uint8Array;
  readonly copies: number;
  readonly wishes: number;
  readonly photos: number;
  /**
   * Photos whose record is on this device but whose bytes are not.
   *
   * Normally zero: a sync downloads the bytes of every photo it pulls. It is not zero when
   * that download failed — offline, or storage was down — and the archive then genuinely
   * does not contain those pictures. Counted and surfaced rather than swallowed, because
   * "your backup is missing four photographs" is not something to find out later.
   */
  readonly photosWithoutBytes: number;
  /** Wishlist albums the archive carries a cover for. */
  readonly albumCovers: number;
}

export async function exportMcArchive(
  store: LocalStore,
  csv: McExportCsv,
  readPhotoBytes: PhotoByteReader,
  exportedAt: Date,
  resolveAlbumCovers?: AlbumCoverResolver,
  resolvePressingCovers?: PressingCoverResolver,
): Promise<McExport> {
  const copies = await store.listCopies();
  const wishes = await store.listWishlist();
  const photos = await store.listAllPhotos();
  // Manual copies derive their release rather than storing one, so the mirror has no entry
  // for a `local:` id and `getReleases` simply returns fewer than it was asked for.
  const releases = await store.getReleases(catalogueKeysOf(copies));

  const photoBytes: McPhotoBytes[] = [];
  let photosWithoutBytes = 0;
  for (const photo of photos) {
    const bytes = await readPhotoBytes(photo.id);
    if (bytes === undefined) {
      photosWithoutBytes += 1;
      continue;
    }
    photoBytes.push({ photoId: photo.id, contentType: photo.contentType, bytes });
  }

  const albumCovers = await resolveCovers(wishes, resolveAlbumCovers, resolvePressingCovers);

  return {
    bytes: buildMcArchive({
      exportedAt,
      copies,
      releases: [...releases.values()],
      wishes,
      photos,
      albumCovers,
      photoBytes,
      collectionCsv: csv.collection,
      wishlistCsv: csv.wishlist,
    }),
    copies: copies.length,
    wishes: wishes.length,
    photos: photoBytes.length,
    photosWithoutBytes,
    albumCovers: Object.keys(albumCovers).length,
  };
}

/**
 * The cover the archive carries for each wished-for album.
 *
 * Keyed by album because that is what the importing device looks the answer up by, but
 * the *value* prefers the pressing the entry was made from: that sleeve is the one the
 * list has been showing, and an archive that carried the album's instead would quietly
 * change the picture on the way through the file. One entry per album is enforced when
 * an entry is made, so there is never a second wish competing for the same key.
 */
async function resolveCovers(
  wishes: readonly { readonly albumId: string; readonly releaseId: string | null }[],
  resolveAlbums: AlbumCoverResolver | undefined,
  resolvePressings: PressingCoverResolver | undefined,
): Promise<AlbumCovers> {
  const albumIds = albumsNeedingCovers(wishes);
  if (albumIds.length === 0) return {};

  const releaseIds = pressingsNeedingCovers(wishes);
  // Swallowed on purpose: a cover is decoration, and an export that refused to write the
  // collection because a picture could not be looked up would be the wrong trade entirely.
  const empty = new Map<string, string | null>();
  const [byAlbum, byPressing] = await Promise.all([
    resolveAlbums === undefined ? empty : resolveAlbums(albumIds).catch(() => empty),
    resolvePressings === undefined || releaseIds.length === 0
      ? empty
      : resolvePressings(releaseIds).catch(() => empty),
  ]);

  const pinned = new Map<string, string | null>();
  for (const wish of wishes) {
    if (wish.releaseId === null) continue;
    const url = byPressing.get(wish.releaseId);
    if (url !== undefined && url !== null) pinned.set(wish.albumId, url);
  }

  const covers: Record<string, string> = {};
  for (const albumId of albumIds) {
    const url = pinned.get(albumId) ?? byAlbum.get(albumId) ?? null;
    if (url !== null && url !== "") covers[albumId] = url;
  }
  return covers;
}
