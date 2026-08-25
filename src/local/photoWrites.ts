import { hlcEncode } from "../domain/hlc.js";
import type { Photo } from "../domain/types.js";
import { PHOTO_MERGEABLE_FIELDS } from "../domain/types.js";
import type { ClockSource } from "./copyWrites.js";

/**
 * What a new photo needs, minus the owner, which is one of two things.
 *
 * Modelled as a union rather than two optional fields so a draft that names neither — or
 * both — cannot be written down in the first place.
 */
export type PhotoDraft = PhotoOwner & {
  readonly contentType: string;
  readonly byteSize: number;
  readonly sortIndex: number;
};

export type PhotoOwner =
  | { readonly copyId: string; readonly wishId?: never }
  | { readonly wishId: string; readonly copyId?: never };

/**
 * A photo starts life with no `storageKey`: it exists on this device and nowhere else.
 * The sync engine fills that in once the bytes are uploaded, which is what turns it into
 * something other devices can fetch.
 */
export function createPhoto(draft: PhotoDraft, clock: ClockSource, now: number, id: string): Photo {
  const stamp = hlcEncode(clock.next());
  const fieldClocks = Object.fromEntries(
    PHOTO_MERGEABLE_FIELDS.map((field) => [field, stamp]),
  ) as Photo["fieldClocks"];

  return {
    id,
    copyId: null,
    wishId: null,
    ...draft,
    storageKey: null,
    createdAt: now,
    deletedAt: null,
    fieldClocks,
  };
}

/** Records that the bytes are now in object storage. */
export function markUploaded(photo: Photo, storageKey: string, clock: ClockSource): Photo {
  return {
    ...photo,
    storageKey,
    fieldClocks: { ...photo.fieldClocks, storageKey: hlcEncode(clock.next()) },
  };
}

export function reorderPhoto(photo: Photo, sortIndex: number, clock: ClockSource): Photo {
  if (photo.sortIndex === sortIndex) return photo;
  return {
    ...photo,
    sortIndex,
    fieldClocks: { ...photo.fieldClocks, sortIndex: hlcEncode(clock.next()) },
  };
}

/** A delete is a stamped write of a tombstone, exactly as it is for a copy. */
export function tombstonePhoto(photo: Photo, clock: ClockSource, now: number): Photo {
  return {
    ...photo,
    deletedAt: now,
    fieldClocks: { ...photo.fieldClocks, deletedAt: hlcEncode(clock.next()) },
  };
}
