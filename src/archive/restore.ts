import { hlcEncode } from "../domain/hlc.js";
import { mergeCopies, mergePhotos, mergeWishlistItems } from "../domain/merge.js";
import type { Photo } from "../domain/types.js";
import type { LocalStore } from "../local/LocalStore.js";
import type { ClockSource } from "../local/copyWrites.js";
import { type McArchiveContents, McArchiveError, readMcArchive } from "./mcArchive.js";

/**
 * Reading a `.mc` back into a device.
 *
 * The import is a sync pull that happens to come from a file. Every record keeps its own
 * id and its own field clocks, and lands through the same merge the sync engine uses — so
 * importing your own archive onto the device it came from changes nothing, importing it
 * onto a fresh device restores the collection exactly, and importing it onto a device that
 * has since edited a record keeps whichever edit is newer. A CSV import cannot do any of
 * that: with nothing in the file to recognise a copy by, it can only ever add.
 *
 * Records go in through `putCopy` / `putWishlistItem` / `putPhoto` rather than the
 * `adopt*` pair, because a file is not the server: what it brought has to be pushed, or a
 * restore would live on one device and nowhere else.
 */

export interface McImportResult {
  readonly copies: number;
  readonly wishes: number;
  readonly photos: number;
  readonly releases: number;
  /**
   * Photo records the archive described but carried no picture for, and that this device
   * has never held either. Restoring the record alone would put a permanently blank tile
   * in the strip, so it is skipped and counted.
   */
  readonly photosWithoutBytes: number;
}

export async function importMcArchive(
  store: LocalStore,
  archive: Uint8Array,
  clock: ClockSource,
): Promise<McImportResult> {
  return applyMcArchive(store, readMcArchive(archive), clock);
}

export async function applyMcArchive(
  store: LocalStore,
  contents: McArchiveContents,
  clock: ClockSource,
): Promise<McImportResult> {
  const { manifest, photoBytes } = contents;

  // First, so that a copy is never visible for even a moment without the pressing it names.
  if (manifest.releases.length > 0) await store.cacheReleases(manifest.releases);

  for (const copy of manifest.copies) {
    const local = await store.getCopyIncludingDeleted(copy.id);
    await store.putCopy(mergeCopies(local, copy));
  }

  for (const wish of manifest.wishes) {
    const local = await store.getWishlistItemIncludingDeleted(wish.id);
    await store.putWishlistItem(mergeWishlistItems(local, wish));
  }

  let photos = 0;
  let photosWithoutBytes = 0;
  for (const photo of manifest.photos) {
    const local = await store.getPhotoIncludingDeleted(photo.id);
    const bytes = photoBytes.get(photo.id);

    if (bytes !== undefined) {
      await store.putPhotoBytes(photo.id, toArrayBuffer(bytes), photo.contentType);
    } else if (local === undefined && photo.deletedAt === null) {
      photosWithoutBytes += 1;
      continue;
    }

    await store.putPhoto(
      local === undefined ? asLocalOnly(photo, clock) : mergePhotos(local, photo),
    );
    photos += 1;
  }

  return {
    copies: manifest.copies.length,
    wishes: manifest.wishes.length,
    releases: manifest.releases.length,
    photos,
    photosWithoutBytes,
  };
}

/**
 * A photo arriving from a file has never been uploaded *by this account*.
 *
 * `storageKey` is a path inside the shared bucket, scoped to the user who owns it, so
 * carrying one across from somebody else's archive would leave a photo that this account
 * can neither fetch nor replace — and, because a key means "already uploaded", the sync
 * engine would never upload the bytes it does have. Clearing it with a fresh stamp puts
 * the photo back into the awaiting-upload state it was in the moment it was taken.
 *
 * Only for photos this device has never seen. One it already holds keeps its own key: it
 * is already in storage under this account, and re-uploading it would be pure churn.
 */
function asLocalOnly(photo: Photo, clock: ClockSource): Photo {
  if (photo.storageKey === null) return photo;
  return {
    ...photo,
    storageKey: null,
    fieldClocks: { ...photo.fieldClocks, storageKey: hlcEncode(clock.next()) },
  };
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? (bytes.buffer as ArrayBuffer)
    : (bytes.slice().buffer as ArrayBuffer);
}

export { McArchiveError };
