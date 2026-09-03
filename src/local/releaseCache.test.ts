import { describe, expect, it } from "vitest";
import type { Release } from "../domain/types.js";
import { mergeCachedRelease } from "./releaseCache.js";

const RELEASE: Release = {
  id: "rel-1",
  albumId: "group-1",
  title: "Bitches Brew",
  artistName: "Miles Davis",
  year: 1970,
  format: "VINYL",
  label: null,
  catalogNumber: null,
  country: null,
  barcode: null,
  releaseDate: null,
  trackCount: null,
  discCount: null,
  coverArtUrl: null,
  coverTheme: null,
  cachedAt: 0,
};

describe("mergeCachedRelease", () => {
  it("keeps a cover the device already knows when the refresh has none", () => {
    const held = { ...RELEASE, coverArtUrl: "https://art/rel-1" };

    expect(mergeCachedRelease({ ...RELEASE, title: "Renamed" }, held)).toMatchObject({
      title: "Renamed",
      coverArtUrl: "https://art/rel-1",
    });
  });

  it("takes a cover the refresh has", () => {
    const next = { ...RELEASE, coverArtUrl: "https://art/new" };
    const held = { ...RELEASE, coverArtUrl: "https://art/old" };

    expect(mergeCachedRelease(next, held).coverArtUrl).toBe("https://art/new");
  });

  it("writes the row as it is when nothing was held", () => {
    expect(mergeCachedRelease(RELEASE, undefined)).toBe(RELEASE);
  });
});
