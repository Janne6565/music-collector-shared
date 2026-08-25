import { describe, expect, it } from "vitest";
import { hlcInitial, hlcTick } from "../domain/hlc.js";
import type { Release } from "../domain/types.js";
import {
  type ClockSource,
  type CopyDraft,
  applyCopyPatch,
  createCopy,
  tombstoneCopy,
} from "./copyWrites.js";

/** A clock that advances one millisecond per call, so stamps are ordered and readable. */
function testClock(node = "device-a"): ClockSource {
  let current = hlcInitial(node);
  let wall = 1000;
  return {
    next() {
      wall += 1;
      current = hlcTick(current, wall);
      return current;
    },
  };
}

const release: Release = {
  id: "release-1",
  albumId: "group-1",
  title: "Remain in Light",
  artistName: "Talking Heads",
  year: 1980,
  format: "CASSETTE",
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

const draft: CopyDraft = {
  condition: "VG_PLUS",
  sleeveCondition: "NM",
  preferCatalogArt: false,
  pricePaidCents: 400,
  currency: "EUR",
  purchasedOn: "2026-03-14",
  purchasedAt: "Ghent market",
  notes: "Case is cracked, tape itself is clean.",
  rating: 5,
};

describe("createCopy", () => {
  it("stamps every mergeable field", () => {
    // An unstamped field would be indistinguishable from an infinitely old one at merge time.
    const copy = createCopy(release, draft, testClock(), 5000, "copy-1");

    expect(Object.keys(copy.fieldClocks).sort()).toEqual(
      [
        "condition",
        "currency",
        "deletedAt",
        "notes",
        "preferCatalogArt",
        "pricePaidCents",
        "purchasedAt",
        "purchasedOn",
        "rating",
        "releaseId",
        "sleeveCondition",
      ].sort(),
    );
    expect(new Set(Object.values(copy.fieldClocks)).size).toBe(1);
  });

  it("starts alive, with the draft's values", () => {
    const copy = createCopy(release, draft, testClock(), 5000, "copy-1");

    expect(copy).toMatchObject({
      id: "copy-1",
      releaseId: "release-1",
      condition: "VG_PLUS",
      sleeveCondition: "NM",
      pricePaidCents: 400,
      createdAt: 5000,
      deletedAt: null,
    });
  });
});

describe("applyCopyPatch", () => {
  it("restamps only the field that changed", () => {
    const clock = testClock();
    const copy = createCopy(release, draft, clock, 5000, "copy-1");
    const before = copy.fieldClocks;

    const patched = applyCopyPatch(copy, { condition: "NM" }, clock);

    expect(patched.condition).toBe("NM");
    expect(patched.fieldClocks.condition).not.toBe(before.condition);
    // Everything else keeps its original stamp, which is what lets a concurrent edit
    // to a different field survive the merge.
    expect(patched.fieldClocks.pricePaidCents).toBe(before.pricePaidCents);
    expect(patched.fieldClocks.notes).toBe(before.notes);
  });

  it("is a no-op when the patch sets the same values", () => {
    const clock = testClock();
    const copy = createCopy(release, draft, clock, 5000, "copy-1");

    const patched = applyCopyPatch(copy, { condition: "VG_PLUS", rating: 5 }, clock);

    // A save that changed nothing must not start winning conflicts against real edits
    // made on another device.
    expect(patched).toBe(copy);
  });

  it("ignores undefined patch entries rather than nulling the field", () => {
    const clock = testClock();
    const copy = createCopy(release, draft, clock, 5000, "copy-1");

    const patched = applyCopyPatch(copy, { notes: undefined, rating: 4 }, clock);

    expect(patched.notes).toBe(draft.notes);
    expect(patched.rating).toBe(4);
  });

  it("can clear a field by patching it to null", () => {
    const clock = testClock();
    const copy = createCopy(release, draft, clock, 5000, "copy-1");

    const patched = applyCopyPatch(copy, { pricePaidCents: null }, clock);

    expect(patched.pricePaidCents).toBeNull();
    expect(patched.fieldClocks.pricePaidCents).not.toBe(copy.fieldClocks.pricePaidCents);
  });

  it("advances the stamp on each successive edit", () => {
    const clock = testClock();
    let copy = createCopy(release, draft, clock, 5000, "copy-1");

    copy = applyCopyPatch(copy, { rating: 4 }, clock);
    const first = copy.fieldClocks.rating;
    copy = applyCopyPatch(copy, { rating: 3 }, clock);

    expect(copy.fieldClocks.rating > first).toBe(true);
  });
});

describe("tombstoneCopy", () => {
  it("stamps the delete so it can be beaten by a later edit elsewhere", () => {
    const clock = testClock();
    const copy = createCopy(release, draft, clock, 5000, "copy-1");

    const deleted = tombstoneCopy(copy, clock, 9000);

    expect(deleted.deletedAt).toBe(9000);
    expect(deleted.fieldClocks.deletedAt).not.toBe(copy.fieldClocks.deletedAt);
    // The row survives — removing it outright would let the server hand it straight back.
    expect(deleted.id).toBe(copy.id);
  });
});

describe("notes conflicts", () => {
  it("clears a pending conflict when the person writes the notes themselves", () => {
    // Editing the notes means they have read both versions and decided.
    const clock = testClock();
    const copy = createCopy(release, draft, clock, 5000, "copy-1");
    const conflicted: typeof copy = { ...copy, notesConflict: "The other device's version." };

    const patched = applyCopyPatch(conflicted, { notes: "Mine, resolved." }, clock);

    expect(patched.notes).toBe("Mine, resolved.");
    expect(patched.notesConflict).toBeNull();
  });

  it("leaves a pending conflict alone when some other field is edited", () => {
    const clock = testClock();
    const copy = createCopy(release, draft, clock, 5000, "copy-1");
    const conflicted: typeof copy = { ...copy, notesConflict: "The other device's version." };

    const patched = applyCopyPatch(conflicted, { rating: 3 }, clock);

    expect(patched.notesConflict).toBe("The other device's version.");
  });
});
