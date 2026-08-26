import type { LocalStore } from "../local/LocalStore.js";
import { type AlbumCovers, albumsNeedingCovers } from "./albumCovers.js";
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
): Promise<McExport> {
  const copies = await store.listCopies();
  const wishes = await store.listWishlist();
  const photos = await store.listAllPhotos();
  // Manual copies derive their release rather than storing one, so the mirror has no entry
  // for a `local:` id and `getReleases` simply returns fewer than it was asked for.
  const releases = await store.getReleases(copies.map((copy) => copy.releaseId));

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

  const albumCovers = await resolveCovers(wishes, resolveAlbumCovers);

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

async function resolveCovers(
  wishes: readonly { readonly albumId: string }[],
  resolve: AlbumCoverResolver | undefined,
): Promise<AlbumCovers> {
  const albumIds = albumsNeedingCovers(wishes);
  if (resolve === undefined || albumIds.length === 0) return {};

  // Swallowed on purpose: a cover is decoration, and an export that refused to write the
  // collection because a picture could not be looked up would be the wrong trade entirely.
  const resolved = await resolve(albumIds).catch(() => new Map<string, string | null>());
  const covers: Record<string, string> = {};
  for (const [albumId, url] of resolved) {
    if (url !== null && url !== "") covers[albumId] = url;
  }
  return covers;
}
