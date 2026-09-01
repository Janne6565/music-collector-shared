import { copyFormat } from "../domain/copyFormat.js";
import type { Copy, Format, Release } from "../domain/types.js";

/**
 * Turn 26a — the pool a roll draws from.
 *
 * The roll carries its own filter rather than borrowing the library's, which is the whole
 * reason it can be opened from anywhere: whatever you had the shelf narrowed to is still
 * narrowed to that when the sheet closes, and a pool of "vinyl I rated four and up" does
 * not become the view you have to browse afterwards.
 *
 * Two axes and no more. Every other facet the shelf has is a way of *finding* a record,
 * and the point here is not finding one.
 */
export interface RollPool {
  readonly format: Format | "ALL";
  /** The floor, inclusive. Null is every copy, unrated ones included. */
  readonly minRating: number | null;
}

export const ANY_POOL: RollPool = { format: "ALL", minRating: null };

/** One entry on the shelf, as much of it as the roll needs to draw a cover. */
export interface RollRow {
  readonly copy: Copy;
  readonly release: Release | undefined;
}

export function inRollPool(row: RollRow, pool: RollPool): boolean {
  if (pool.format !== "ALL" && copyFormat(row.copy, row.release) !== pool.format) return false;
  // An unrated copy is not a zero-star one, so a floor of any height excludes it. The
  // alternative — treating null as 0 — would quietly put everything you have never had an
  // opinion about into a pool asked for by rating.
  if (pool.minRating !== null && (row.copy.rating ?? 0) < pool.minRating) return false;
  return true;
}

export function rollPoolOf(rows: readonly RollRow[], pool: RollPool): RollRow[] {
  return rows.filter((row) => inRollPool(row, pool));
}

/** Whether the pool is the whole shelf — which is what lets the sheet say so in one word. */
export function isAnyPool(pool: RollPool): boolean {
  return pool.format === "ALL" && pool.minRating === null;
}
