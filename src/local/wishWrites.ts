import { hlcEncode } from "../domain/hlc.js";
import type { Format, WishlistItem } from "../domain/types.js";
import { WISH_MERGEABLE_FIELDS } from "../domain/types.js";
import type { ClockSource } from "./copyWrites.js";

export interface WishDraft {
  readonly albumId: string;
  /** The pressing that was picked, so the entry keeps that sleeve. Null when typed. */
  readonly releaseId: string | null;
  /** Set only by a scan the catalogue could not be asked about yet; null everywhere else. */
  readonly pendingBarcode?: string | null;
  readonly title: string;
  readonly artistName: string;
  readonly year: number | null;
  readonly desiredFormat: Format | null;
  readonly note: string | null;
}

/**
 * What an edit to an entry may touch.
 *
 * `sortIndex` is not part of `WishDraft` because nothing ever *drafts* a position — a new
 * entry lands at the top of the newest-first list and has no manual place until somebody
 * drags one. It only ever arrives later, as a patch.
 */
export type WishPatch = Partial<WishDraft> & { readonly sortIndex?: number | null };

/** Stamps every mergeable field, for the same reason a copy does: an unstamped field is
 * indistinguishable from an infinitely old one at merge time. */
export function createWishlistItem(
  draft: WishDraft,
  clock: ClockSource,
  now: number,
  id: string,
): WishlistItem {
  const stamp = hlcEncode(clock.next());
  const fieldClocks = Object.fromEntries(
    WISH_MERGEABLE_FIELDS.map((field) => [field, stamp]),
  ) as WishlistItem["fieldClocks"];

  return {
    id,
    ...draft,
    pendingBarcode: draft.pendingBarcode ?? null,
    sortIndex: null,
    createdAt: now,
    deletedAt: null,
    fieldClocks,
  };
}

/** Restamps only what changed, so concurrent edits to different fields both survive. */
export function applyWishPatch(
  item: WishlistItem,
  patch: WishPatch,
  clock: ClockSource,
): WishlistItem {
  const changed = (Object.keys(patch) as (keyof WishPatch)[]).filter(
    (key) => patch[key] !== undefined && patch[key] !== item[key],
  );
  if (changed.length === 0) return item;

  const stamp = hlcEncode(clock.next());
  const fieldClocks = { ...item.fieldClocks };
  const updated: Record<string, unknown> = { ...item };
  for (const key of changed) {
    fieldClocks[key] = stamp;
    updated[key] = patch[key];
  }
  return { ...updated, fieldClocks } as WishlistItem;
}

/** A delete is a stamped write of a tombstone, exactly as it is for a copy. */
export function tombstoneWishlistItem(
  item: WishlistItem,
  clock: ClockSource,
  now: number,
): WishlistItem {
  return {
    ...item,
    deletedAt: now,
    fieldClocks: { ...item.fieldClocks, deletedAt: hlcEncode(clock.next()) },
  };
}

/**
 * Puts a tombstoned entry back — "Keep it" on screen 16e's line.
 *
 * The mirror of {@link tombstoneWishlistItem}, stamped for the same reason `restoreCopy`
 * is: the restore has to be newer than the delete, or the merge keeps choosing the delete
 * and the entry leaves again on the next sync.
 */
export function restoreWishlistItem(item: WishlistItem, clock: ClockSource): WishlistItem {
  return {
    ...item,
    deletedAt: null,
    fieldClocks: { ...item.fieldClocks, deletedAt: hlcEncode(clock.next()) },
  };
}

/**
 * The wish equivalent of {@link resolveScannedCopy}: one stamped write that names the
 * record and stops the entry waiting for a name.
 *
 * The album, the pressing, the title and the artist all arrive from the same lookup, so
 * they are restamped together — an entry that had half of them would show a title with no
 * album to check "already wished for" against.
 */
export function resolveScannedWish(
  item: WishlistItem,
  resolved: Pick<WishDraft, "albumId" | "releaseId" | "title" | "artistName" | "year">,
  clock: ClockSource,
): WishlistItem {
  return applyWishPatch(item, { ...resolved, pendingBarcode: null }, clock);
}
