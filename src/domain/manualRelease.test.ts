import { describe, expect, it } from "vitest";
import { applyCopyPatch, createManualCopy } from "../local/copyWrites.js";
import { hlcEncode, hlcInitial, hlcTick } from "./hlc.js";
import { isManualCopy, manualRelease } from "./manualRelease.js";
import type { ManualRelease } from "./types.js";
import { isManualReleaseId, manualReleaseCopyId } from "./types.js";

const TAPE: ManualRelease = {
  manualTitle: "Untitled live tape",
  manualArtist: "Sun Ra Arkestra",
  manualYear: 1978,
  manualLabel: "Saturn",
  manualCatalogNumber: "ES 9956",
  manualFormat: "CASSETTE",
};

const DRAFT = {
  condition: null,
  sleeveCondition: null,
  catalogArt: "AUTO",
  pricePaidCents: 1800,
  currency: "EUR",
  purchasedOn: null,
  purchasedAt: null,
  notes: null,
  rating: null,
} as const;

function clock() {
  let hlc = hlcInitial("device-a");
  return {
    next: () => {
      hlc = hlcTick(hlc, Date.now());
      return hlc;
    },
  };
}

describe("a copy nobody has a record of", () => {
  it("points its release id at itself, so any device holding the copy can resolve it", () => {
    const copy = createManualCopy(TAPE, DRAFT, clock(), 1000, "copy-1");

    expect(copy.releaseId).toBe("local:copy-1");
    expect(isManualCopy(copy)).toBe(true);
    expect(manualReleaseCopyId(copy.releaseId)).toBe(copy.id);
    expect(isManualReleaseId("musicbrainz:r1")).toBe(false);
  });

  it("stamps the pressing's fields like every other mergeable one", () => {
    const copy = createManualCopy(TAPE, DRAFT, clock(), 1000, "copy-1");

    // Unstamped fields lose every merge, so a manual title would silently revert to the
    // other device's null the first time the copy synced.
    expect(copy.fieldClocks.manualTitle).toBeDefined();
    expect(copy.fieldClocks.manualFormat).toBe(copy.fieldClocks.manualTitle);
  });

  it("reads back as a release, so the screens need no branch of their own", () => {
    const copy = createManualCopy(TAPE, DRAFT, clock(), 1000, "copy-1");

    expect(manualRelease(copy)).toMatchObject({
      id: "local:copy-1",
      albumId: "local:copy-1",
      title: "Untitled live tape",
      artistName: "Sun Ra Arkestra",
      year: 1978,
      format: "CASSETTE",
      label: "Saturn",
      catalogNumber: "ES 9956",
      coverArtUrl: null,
    });
  });

  it("falls back to OTHER rather than crashing when the format was never chosen", () => {
    const copy = createManualCopy({ ...TAPE, manualFormat: null }, DRAFT, clock(), 1000, "c");

    expect(manualRelease(copy).format).toBe("OTHER");
  });

  it("restamps only the pressing field that was corrected", () => {
    const source = clock();
    const copy = createManualCopy(TAPE, DRAFT, source, 1000, "copy-1");
    const before = copy.fieldClocks.manualArtist;

    const fixed = applyCopyPatch(copy, { manualYear: 1979 }, source);

    expect(fixed.manualYear).toBe(1979);
    expect(fixed.fieldClocks.manualArtist).toBe(before);
    expect(fixed.fieldClocks.manualYear > before).toBe(true);
  });

  it("is not manual when it points at a catalogue", () => {
    expect(isManualCopy({ releaseId: "musicbrainz:r1" })).toBe(false);
    expect(hlcEncode(hlcInitial("a"))).toMatch(/:a$/);
  });
});
