import { describe, expect, it, vi } from "vitest";
import type { Hlc } from "../domain/hlc.js";
import type { Format, Release } from "../domain/types.js";
import { createScannedCopy } from "../local/copyWrites.js";
import { createWishlistItem } from "../local/wishWrites.js";
import { MemoryStore } from "../testing/MemoryStore.js";
import { pickPressing, resolvePendingScans } from "./pendingScans.js";

function clockSource(node = "a") {
  let counter = 0;
  return {
    next: (): Hlc => ({ wall: 1000 + counter, counter: counter++, node }),
  };
}

const EMPTY_DRAFT = {
  condition: null,
  sleeveCondition: null,
  catalogArt: "AUTO" as const,
  pricePaidCents: null,
  currency: "EUR",
  purchasedOn: null,
  purchasedAt: null,
  notes: null,
  rating: null,
};

function release(id: string, format: Format, over: Partial<Release> = {}): Release {
  return {
    id,
    albumId: "album-1",
    title: "Bitches Brew",
    artistName: "Miles Davis",
    year: 1970,
    format,
    label: "Columbia",
    catalogNumber: "GP 26",
    country: "US",
    barcode: "0074646510124",
    releaseDate: "1970",
    trackCount: null,
    discCount: null,
    coverArtUrl: null,
    coverTheme: null,
    cachedAt: 0,
    ...over,
  };
}

describe("pickPressing", () => {
  it("prefers the format the person picked on the confirm card", () => {
    const candidates = [release("r-vinyl", "VINYL"), release("r-cd", "CD")];

    expect(pickPressing(candidates, "CD")?.id).toBe("r-cd");
  });

  it("falls back to the catalogue's own order when nothing matches", () => {
    const candidates = [release("r-vinyl", "VINYL"), release("r-cd", "CD")];

    expect(pickPressing(candidates, "CASSETTE")?.id).toBe("r-vinyl");
  });

  it("takes the first when no format was ever picked", () => {
    expect(pickPressing([release("r-vinyl", "VINYL")], null)?.id).toBe("r-vinyl");
  });
});

describe("resolvePendingScans", () => {
  it("names a copy and stops it waiting", async () => {
    const store = new MemoryStore();
    const clock = clockSource();
    const scanned = createScannedCopy("0074646510124", "VINYL", EMPTY_DRAFT, clock, 1, "copy-1");
    await store.putCopy(scanned);

    const result = await resolvePendingScans({
      store,
      clock,
      lookup: async () => [release("musicbrainz:r1", "VINYL")],
    });

    const stored = await store.getCopy("copy-1");
    expect(result).toEqual({ copies: 1, wishes: 0, stillPending: 0 });
    expect(stored?.releaseId).toBe("musicbrainz:r1");
    expect(stored?.pendingBarcode).toBeNull();
    // The person's answer about the object in hand outlives the lookup: `copyFormat` lets
    // a copy disagree with the catalogue, and re-deciding it here would overrule them.
    expect(stored?.manualFormat).toBe("VINYL");
  });

  it("caches the releases it resolved, so the row can draw itself offline again", async () => {
    const store = new MemoryStore();
    const clock = clockSource();
    await store.putCopy(createScannedCopy("0074646510124", null, EMPTY_DRAFT, clock, 1, "copy-1"));

    await resolvePendingScans({
      store,
      clock,
      lookup: async () => [release("musicbrainz:r1", "VINYL")],
    });

    expect(await store.getRelease("musicbrainz:r1")).toBeDefined();
  });

  it("names a wish from the same lookup", async () => {
    const store = new MemoryStore();
    const clock = clockSource();
    await store.putWishlistItem(
      createWishlistItem(
        {
          albumId: "",
          releaseId: null,
          pendingBarcode: "0074646510124",
          title: "",
          artistName: "",
          year: null,
          desiredFormat: "VINYL",
          note: null,
        },
        clock,
        1,
        "wish-1",
      ),
    );

    const result = await resolvePendingScans({
      store,
      clock,
      lookup: async () => [release("musicbrainz:r1", "VINYL")],
    });

    const [stored] = await store.listWishlist();
    expect(result.wishes).toBe(1);
    expect(stored?.title).toBe("Bitches Brew");
    expect(stored?.albumId).toBe("album-1");
    expect(stored?.pendingBarcode).toBeNull();
  });

  it("asks once for a barcode scanned onto both the shelf and the wishlist", async () => {
    // The ordinary shop case: you own one and want another pressing, and both were the
    // same read. Two lookups would spend two requests to learn the same thing.
    const store = new MemoryStore();
    const clock = clockSource();
    await store.putCopy(createScannedCopy("0074646510124", null, EMPTY_DRAFT, clock, 1, "copy-1"));
    await store.putWishlistItem(
      createWishlistItem(
        {
          albumId: "",
          releaseId: null,
          pendingBarcode: "0074646510124",
          title: "",
          artistName: "",
          year: null,
          desiredFormat: null,
          note: null,
        },
        clock,
        1,
        "wish-1",
      ),
    );
    const lookup = vi.fn(async () => [release("musicbrainz:r1", "VINYL")]);

    await resolvePendingScans({ store, clock, lookup });

    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("leaves a scan waiting when the lookup fails", async () => {
    // Still offline. The record has to survive to the next sweep exactly as it was.
    const store = new MemoryStore();
    const clock = clockSource();
    await store.putCopy(createScannedCopy("0074646510124", null, EMPTY_DRAFT, clock, 1, "copy-1"));

    const result = await resolvePendingScans({
      store,
      clock,
      lookup: async () => {
        throw new Error("offline");
      },
    });

    expect(result).toEqual({ copies: 0, wishes: 0, stillPending: 1 });
    expect((await store.getCopy("copy-1"))?.pendingBarcode).toBe("0074646510124");
  });

  it("asks again after a failure, and not after an empty answer", async () => {
    // The two look identical on the row and are entirely different questions: a failure
    // means nobody has been asked yet, an empty answer means the catalogues have nothing.
    const store = new MemoryStore();
    const clock = clockSource();
    await store.putCopy(createScannedCopy("0074646510124", null, EMPTY_DRAFT, clock, 1, "copy-1"));
    const asked = new Set<string>();

    const failing = vi.fn(async () => {
      throw new Error("offline");
    });
    await resolvePendingScans({ store, clock, lookup: failing, asked });
    await resolvePendingScans({ store, clock, lookup: failing, asked });
    expect(failing).toHaveBeenCalledTimes(2);

    const empty = vi.fn(async () => []);
    await resolvePendingScans({ store, clock, lookup: empty, asked });
    await resolvePendingScans({ store, clock, lookup: empty, asked });
    expect(empty).toHaveBeenCalledTimes(1);
  });

  it("does nothing at all when nothing is waiting", async () => {
    const store = new MemoryStore();
    const lookup = vi.fn(async () => []);

    const result = await resolvePendingScans({ store, clock: clockSource(), lookup });

    expect(lookup).not.toHaveBeenCalled();
    expect(result).toEqual({ copies: 0, wishes: 0, stillPending: 0 });
  });
});
