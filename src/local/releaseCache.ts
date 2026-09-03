import type { Release } from "../domain/types.js";

/**
 * The catalogue row to actually write, given the one this device already holds.
 *
 * The cache is a copy of somebody else's answer, and a refresh should improve it rather
 * than take things out of it. One field breaks that rule badly enough to be worth a
 * function: the cover.
 *
 * A release's `coverArtUrl` is null both for "this pressing has no artwork" and for "the
 * server could not find out" — and the server, until it was taught the difference, wrote
 * a cover probe that timed out down as the first. Every client then cached the null over
 * the URL it already had, and a record lost its sleeve everywhere at once with no way
 * back. Reported from the field: a shelf lost a record's cover during an evening of
 * scanning CDs and never got it back.
 *
 * So a cover is kept once it is known. The worst this can do is hold on to an address
 * that has stopped resolving, which every caller already survives — the art falls back to
 * the format silhouette when it will not load.
 */
export function mergeCachedRelease(next: Release, held: Release | undefined): Release {
  if (next.coverArtUrl !== null || held?.coverArtUrl == null) return next;
  return { ...next, coverArtUrl: held.coverArtUrl };
}
