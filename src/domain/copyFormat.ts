import type { Copy, Format, Release } from "./types.js";

/**
 * The format of the item you actually own.
 *
 * A `Release` is a specific edition, so the catalogue's answer is usually the copy's too —
 * but not always. Reissues get retagged, a pressing is listed as the LP it mostly was and
 * the tape you have is nowhere in the archive, and a collection is allowed to hold a
 * cassette of a record MusicBrainz only knows as vinyl. `manualFormat` is that answer: on
 * a hand-entered copy it is the only format there is, and on a matched one it overrides
 * the catalogue's.
 *
 * Everything that shows, filters or counts a copy's format reads it through here, so the
 * shelf chip, the badge and the silhouette can never disagree about the same copy.
 *
 * `OTHER` rather than a null return when neither is known: this is drawn, filtered and
 * counted on every screen, and a nullable format would put the same guard in a dozen
 * places to arrive at the same fallback.
 */
export function copyFormat(
  copy: Pick<Copy, "manualFormat">,
  release: Pick<Release, "format"> | undefined,
): Format {
  return copy.manualFormat ?? release?.format ?? "OTHER";
}
