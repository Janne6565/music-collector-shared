import { formatBarcode } from "./barcode.js";
import type { Copy, ManualRelease, Release } from "./types.js";
import { isManualReleaseId, manualReleaseId } from "./types.js";

/**
 * The `Release` a manually entered copy stands for.
 *
 * Every screen in both apps reads a copy's title, artist, year and format off a `Release`,
 * and none of them should have to ask first whether the record came from an archive or
 * from somebody typing. So a manual copy resolves to a release too — one derived from its
 * own fields, on demand.
 *
 * Derived rather than cached: the manual fields are mergeable, so the title can change on
 * another device, and a release row written once at creation would go stale the moment it
 * did. The cost of deriving is a string copy; the cost of caching is a second device
 * showing the old title forever.
 *
 * `cachedAt` is the copy's creation time, which is the only honest answer — nothing was
 * ever fetched, so there is nothing to refresh and no age to compare against.
 */
export function manualRelease(copy: Copy): Release {
  return {
    id: manualReleaseId(copy.id),
    // Its own album: a hand-entered pressing is not known to be an edition of anything
    // else, and grouping two of them because they happen to share a title would be a
    // guess the person never made.
    albumId: manualReleaseId(copy.id),
    // A scan kept before it could be looked up has no title because nobody has one yet.
    // Its digits stand in until it does: the shelf, the search and the archive all read a
    // title off this, and a blank row would be a record you cannot pick out from the two
    // beside it. It is replaced by the real title the moment the resolver names it.
    title:
      copy.manualTitle ?? (copy.pendingBarcode === null ? "" : formatBarcode(copy.pendingBarcode)),
    artistName: copy.manualArtist ?? "",
    year: copy.manualYear,
    format: copy.manualFormat ?? "OTHER",
    label: copy.manualLabel,
    catalogNumber: copy.manualCatalogNumber,
    country: null,
    barcode: null,
    releaseDate: copy.manualYear === null ? null : String(copy.manualYear),
    trackCount: null,
    discCount: null,
    // No archive art, ever. A manual copy's picture is a photo of it, which the preview
    // rules already handle — see `copyPreviewSrc`.
    coverArtUrl: null,
    coverTheme: null,
    cachedAt: copy.createdAt,
  };
}

/** Whether this copy describes its own pressing rather than pointing at a catalogued one. */
export function isManualCopy(copy: Pick<Copy, "releaseId">): boolean {
  return copy.releaseId !== null && isManualReleaseId(copy.releaseId);
}

/**
 * Fills a map of cached releases in with the ones these copies describe themselves.
 *
 * The single seam every store's release lookup goes through, so the two implementations
 * cannot disagree about what a manual copy looks like.
 */
export function withManualReleases(
  releases: Map<string, Release>,
  copies: readonly Copy[],
): Map<string, Release> {
  for (const copy of copies) {
    if (isManualCopy(copy) && copy.releaseId !== null) {
      releases.set(copy.releaseId, manualRelease(copy));
    }
  }
  return releases;
}

/** The manual half of a copy, as the editor and the create path hand it over. */
export const EMPTY_MANUAL_RELEASE: ManualRelease = {
  manualTitle: null,
  manualArtist: null,
  manualYear: null,
  manualLabel: null,
  manualCatalogNumber: null,
  manualFormat: null,
};
