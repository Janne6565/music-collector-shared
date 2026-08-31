import { beforeEach, describe, expect, it, vi } from "vitest";
import { hlcInitial, hlcTick } from "../domain/hlc.js";
import type { Copy, Release, WishlistItem } from "../domain/types.js";
import {
  type ClockSource,
  applyCopyPatch,
  createCopy,
  tombstoneCopy,
} from "../local/copyWrites.js";
import { createWishlistItem } from "../local/wishWrites.js";
import { MemoryStore } from "../testing/MemoryStore.js";
import {
  type ShelfComparison,
  compareShelves,
  decidedCount,
  differenceCount,
  differenceKey,
  dropCount,
  mergedCopies,
  reviewedCopies,
} from "./conflict.js";
import { SyncEngine } from "./syncEngine.js";
import type { SyncTransport } from "./transport.js";

const release: Release = {
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

/** A clock whose stamps advance one millisecond at a time, from `from`. */
function clockSource(node: string, from = 1000): ClockSource {
  let current = hlcInitial(node);
  let wall = from;
  return {
    next() {
      wall += 1;
      current = hlcTick(current, wall);
      return current;
    },
  };
}

const DRAFT = {
  condition: null,
  sleeveCondition: null,
  catalogArt: "AUTO",
  pricePaidCents: null,
  currency: "EUR",
  purchasedOn: null,
  purchasedAt: null,
  notes: null,
  rating: null,
} as const;

function copy(id: string, clock: ClockSource): Copy {
  return createCopy(release, DRAFT, clock, 1000, id);
}

function wish(id: string, clock: ClockSource): WishlistItem {
  return createWishlistItem(
    {
      albumId: "group-1",
      releaseId: null,
      title: "Kid A",
      artistName: "Radiohead",
      year: 2000,
      desiredFormat: "VINYL",
      note: null,
    },
    clock,
    1000,
    id,
  );
}

/** Titles come from the release cache in the real engine; here they are constants. */
const labels = {
  labelForCopy: () => ({
    title: release.title,
    artistName: release.artistName,
    year: release.year,
    format: "VINYL" as const,
  }),
  labelForWish: (item: WishlistItem) => ({
    title: item.title,
    artistName: item.artistName,
    year: item.year,
    format: item.desiredFormat ?? ("OTHER" as const),
  }),
};

function compare(
  local: { copies?: Copy[]; wishes?: WishlistItem[] },
  account: { copies?: Copy[]; wishes?: WishlistItem[] },
  photos = 0,
): ShelfComparison {
  return compareShelves(
    { copies: local.copies ?? [], wishes: local.wishes ?? [] },
    { copies: account.copies ?? [], wishes: account.wishes ?? [] },
    labels,
    photos,
  );
}

describe("compareShelves", () => {
  it("asks nothing when the account is empty", () => {
    const clock = clockSource("a");
    const result = compare({ copies: [copy("c-1", clock)] }, {});

    expect(result.outcome).toBe("EMPTY_ACCOUNT");
  });

  it("is a confirmation when one side simply contains the other", () => {
    const clock = clockSource("a");
    const shared = copy("c-1", clock);
    const result = compare({ copies: [shared] }, { copies: [shared, copy("c-2", clock)] });

    expect(result.outcome).toBe("NO_LOSS");
    expect(result.onlyLocal).toHaveLength(0);
    expect(result.onlyAccount).toHaveLength(1);
    // The merge still adds something; there is just nothing to weigh against it.
    expect(mergedCopies(result)).toBe(2);
  });

  it("is a conflict once each side holds something the other does not", () => {
    const clock = clockSource("a");
    const result = compare({ copies: [copy("c-1", clock)] }, { copies: [copy("c-2", clock)] });

    expect(result.outcome).toBe("CONFLICT");
    expect(dropCount(result, "LOCAL")).toBe(1);
    expect(dropCount(result, "ACCOUNT")).toBe(1);
  });

  it("is a conflict when the two sides disagree about a value they both hold", () => {
    const clock = clockSource("a");
    const local = applyCopyPatch(copy("c-1", clock), { rating: 5 }, clock);
    const account = applyCopyPatch(copy("c-1", clockSource("b")), { rating: 3 }, clockSource("b"));

    const result = compare({ copies: [local] }, { copies: [account] });

    expect(result.outcome).toBe("CONFLICT");
    expect(result.values).toHaveLength(1);
    expect(result.values[0]).toMatchObject({ field: "rating", local: 5, account: 3 });
    // Held by both sides, so it is neither one-sided nor identical.
    expect(result.identicalCopies).toBe(0);
  });

  it("names the side an ordinary merge would take", () => {
    const early = clockSource("a", 1000);
    const late = clockSource("b", 9000);
    const local = applyCopyPatch(copy("c-1", early), { rating: 5 }, early);
    const account = applyCopyPatch(copy("c-1", late), { rating: 3 }, late);

    expect(compare({ copies: [local] }, { copies: [account] }).values[0]?.winner).toBe("ACCOUNT");
  });

  it("counts a record deleted on one side as absent there, not as an addition", () => {
    const clock = clockSource("a");
    const live = copy("c-1", clock);
    const result = compare({ copies: [live] }, { copies: [tombstoneCopy(live, clock, 5000)] });

    expect(result.accountCopies).toBe(0);
    expect(result.onlyLocal).toHaveLength(1);
    expect(result.values).toHaveLength(0);
  });

  it("does not treat cleared text and text nobody wrote as a disagreement", () => {
    const clock = clockSource("a");
    const local = applyCopyPatch(copy("c-1", clock), { notes: "  " }, clock);
    const account = copy("c-1", clockSource("b"));

    expect(compare({ copies: [local] }, { copies: [account] }).values).toHaveLength(0);
  });

  it("counts copies and wishlist entries together for the cost of keeping one side", () => {
    const clock = clockSource("a");
    const result = compare(
      { copies: [copy("c-1", clock)], wishes: [wish("w-1", clock)] },
      { copies: [copy("c-2", clock)] },
    );

    // Keeping the account drops one copy and one wish, and the sentence is about loss.
    expect(dropCount(result, "ACCOUNT")).toBe(2);
    expect(differenceCount(result)).toBe(3);
  });

  it("reports the last change on each side from the field clocks", () => {
    const early = clockSource("a", 1000);
    const late = clockSource("b", 9000);
    const result = compare({ copies: [copy("c-1", early)] }, { copies: [copy("c-2", late)] });

    expect(result.localChangedAt).toBeLessThan(result.accountChangedAt as number);
  });
});

describe("the running total of a review", () => {
  const clock = clockSource("a");
  const comparison = compare(
    { copies: [copy("c-1", clock), copy("c-2", clock)] },
    { copies: [copy("c-3", clock)] },
  );

  it("keeps everything nobody decided", () => {
    expect(reviewedCopies(comparison, { picks: {}, dropped: [] })).toBe(3);
    expect(decidedCount(comparison, { picks: {}, dropped: [] })).toBe(0);
  });

  it("moves as entries are dropped", () => {
    const plan = { picks: {}, dropped: ["c-3"] };
    expect(reviewedCopies(comparison, plan)).toBe(2);
    expect(decidedCount(comparison, plan)).toBe(1);
  });
});

describe("SyncEngine.compare", () => {
  const pull = vi.fn();
  const push = vi.fn();
  const fetchReleases = vi.fn();
  const transport: SyncTransport = {
    pull: (cursor) => pull(cursor),
    push: (...args) => push(...args),
    uploadPhoto: async () => null,
    downloadPhoto: async () => undefined,
    fetchReleases: (ids) => fetchReleases(ids),
  };

  let store: MemoryStore;
  let clock: ClockSource;

  beforeEach(async () => {
    vi.clearAllMocks();
    store = new MemoryStore();
    await store.open();
    clock = clockSource("device");
    fetchReleases.mockResolvedValue([release]);
    push.mockResolvedValue({ copies: [], wishes: [], photos: [], cursor: 0 });
  });

  function engine() {
    return new SyncEngine(store, clock, transport);
  }

  it("reads the whole account without adopting any of it", async () => {
    await store.putCopy(copy("c-1", clock));
    const remote = copy("c-2", clockSource("other"));
    pull.mockResolvedValueOnce({
      copies: [remote],
      wishes: [],
      photos: [],
      cursor: 7,
      hasMore: false,
    });

    const result = await engine().compare();

    expect(result.outcome).toBe("CONFLICT");
    // Nothing about this device moved: the account's copy is not in the store, and the
    // cursor still says this device has read nothing.
    expect(await store.getCopy("c-2")).toBeUndefined();
    expect(await store.readSyncCursor()).toBe(0);
  });

  it("fills in the catalogue for copies only the account has", async () => {
    pull.mockResolvedValueOnce({
      copies: [copy("c-2", clockSource("other"))],
      wishes: [],
      photos: [],
      cursor: 7,
      hasMore: false,
    });

    const result = await engine().compare();

    expect(fetchReleases).toHaveBeenCalledWith(["rel-1"]);
    expect(result.onlyAccount[0]?.title).toBe("Bitches Brew");
  });
});

describe("SyncEngine.firstSyncReviewed", () => {
  const pull = vi.fn();
  const push = vi.fn();
  const transport: SyncTransport = {
    pull: (cursor) => pull(cursor),
    push: (...args) => push(...args),
    uploadPhoto: async () => null,
    downloadPhoto: async () => undefined,
    fetchReleases: async () => [release],
  };

  let store: MemoryStore;
  let clock: ClockSource;

  beforeEach(async () => {
    vi.clearAllMocks();
    store = new MemoryStore();
    await store.open();
    clock = clockSource("device", 20_000);
    push.mockResolvedValue({ copies: [], wishes: [], photos: [], cursor: 0 });
  });

  /** The account answers once with `copies`, then has nothing further to say. */
  function accountHolds(copies: readonly Copy[]) {
    pull.mockResolvedValueOnce({
      copies,
      wishes: [],
      photos: [],
      cursor: 7,
      hasMore: false,
    });
    pull.mockResolvedValue({ copies: [], wishes: [], photos: [], cursor: 7, hasMore: false });
  }

  it("keeps everything the plan is silent about", async () => {
    await store.putCopy(copy("c-1", clock));
    const remote = copy("c-2", clockSource("other"));
    accountHolds([remote]);

    const comparison = await engine().compare();
    accountHolds([remote]);
    await engine().firstSyncReviewed(comparison, { picks: {}, dropped: [] });

    expect(await store.getCopy("c-1")).toBeDefined();
    expect(await store.getCopy("c-2")).toBeDefined();
  });

  it("drops an entry the review dropped, as a tombstone that will replicate", async () => {
    await store.putCopy(copy("c-1", clock));
    const remote = copy("c-2", clockSource("other"));
    accountHolds([remote]);

    const comparison = await engine().compare();
    accountHolds([remote]);
    await engine().firstSyncReviewed(comparison, { picks: {}, dropped: ["c-2"] });

    expect(await store.getCopy("c-2")).toBeUndefined();
    const tombstoned = await store.getCopyIncludingDeleted("c-2");
    expect(tombstoned?.deletedAt).not.toBeNull();
  });

  it("puts back the value the merge did not choose", async () => {
    const local = applyCopyPatch(copy("c-1", clock), { rating: 5 }, clock);
    await store.putCopy(local);
    // Stamped later, so the ordinary merge takes the account's 3.
    const later = clockSource("other", 90_000);
    const remote = applyCopyPatch(copy("c-1", later), { rating: 3 }, later);
    accountHolds([remote]);

    const comparison = await engine().compare();
    expect(comparison.values[0]?.winner).toBe("ACCOUNT");

    accountHolds([remote]);
    await engine().firstSyncReviewed(comparison, {
      picks: { [differenceKey(comparison.values[0] as never)]: "LOCAL" },
      dropped: [],
    });

    expect((await store.getCopy("c-1"))?.rating).toBe(5);
    // And it goes up, or the correction would live on this device alone.
    expect(await store.readPendingIds()).toEqual([]);
    expect(push).toHaveBeenCalledTimes(2);
  });

  it("does not restamp a value that was already the merge's answer", async () => {
    const local = applyCopyPatch(copy("c-1", clock), { rating: 5 }, clock);
    await store.putCopy(local);
    const later = clockSource("other", 90_000);
    const remote = applyCopyPatch(copy("c-1", later), { rating: 3 }, later);
    accountHolds([remote]);

    const comparison = await engine().compare();
    accountHolds([remote]);
    await engine().firstSyncReviewed(comparison, {
      picks: { [differenceKey(comparison.values[0] as never)]: "ACCOUNT" },
      dropped: [],
    });

    // One sync, not two: agreeing with the merge is not an edit.
    expect(push).toHaveBeenCalledTimes(1);
  });

  function engine() {
    return new SyncEngine(store, clock, transport);
  }
});
