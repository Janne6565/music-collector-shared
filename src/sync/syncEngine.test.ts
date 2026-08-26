import { beforeEach, describe, expect, it, vi } from "vitest";
import { hlcInitial, hlcTick } from "../domain/hlc.js";
import type { Copy, Release } from "../domain/types.js";
import { type ClockSource, createCopy, tombstoneCopy } from "../local/copyWrites.js";
import { MemoryStore } from "../testing/MemoryStore.js";
import { SyncEngine } from "./syncEngine.js";
import type { SyncTransport } from "./transport.js";

const pull = vi.fn();
const push = vi.fn();
const fetchReleases = vi.fn();

/**
 * The engine's whole view of the network. Photo bytes are not exercised here — moving them
 * is each platform's own code, and what this file is about is what the engine does with
 * records it is given.
 */
const transport: SyncTransport = {
  pull: (cursor) => pull(cursor),
  push: (copies, wishes, photos) => push(copies, wishes, photos),
  uploadPhoto: async () => null,
  downloadPhoto: async () => {},
  fetchReleases: (releaseIds) => fetchReleases(releaseIds),
};

const EMPTY_PAGE = { copies: [], wishes: [], photos: [], cursor: 0, hasMore: false };

function clockSource(node: string): ClockSource {
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

/** One of many distinct releases, for the paths that only show up past a single page. */
function releaseNumbered(index: number): Release {
  return { ...release, id: `rel-${index}`, albumId: `group-${index}`, title: `Release ${index}` };
}

/** `count` copies, each naming a release of its own that this device does not hold. */
async function adoptCopiesNaming(
  store: MemoryStore,
  clock: ClockSource,
  count: number,
): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await store.adoptCopy(createCopy(releaseNumbered(index), draft, clock, 1000, `copy-${index}`));
  }
}

const draft = {
  condition: "VG_PLUS" as const,
  sleeveCondition: "NM" as const,
  catalogArt: "AUTO" as const,
  pricePaidCents: 2800,
  currency: "EUR",
  purchasedOn: null,
  purchasedAt: null,
  notes: null,
  rating: null,
};

describe("SyncEngine", () => {
  let store: MemoryStore;
  let engine: SyncEngine;
  let clock: ClockSource;

  beforeEach(async () => {
    store = new MemoryStore();
    await store.open();
    clock = clockSource("device-a");
    engine = new SyncEngine(store, clock, transport);
    pull.mockReset();
    push.mockReset();
    fetchReleases.mockReset();
    fetchReleases.mockResolvedValue([]);
    pull.mockResolvedValue(EMPTY_PAGE);
    push.mockResolvedValue({ ...EMPTY_PAGE });
  });

  it("pushes a locally created copy exactly once", async () => {
    await store.cacheReleases([release]);
    await store.putCopy(createCopy(release, draft, clock, 1000, "copy-1"));

    const first = await engine.sync();
    const second = await engine.sync();

    expect(first.pushed).toBe(1);
    // Without clearing pending after a successful push, the client resends forever.
    expect(second.pushed).toBe(0);
  });

  it("does not push back what it just pulled", async () => {
    const remote = createCopy(release, draft, clock, 1000, "copy-remote");
    pull.mockResolvedValueOnce({ ...EMPTY_PAGE, copies: [remote], cursor: 5, hasMore: false });

    const first = await engine.sync();

    expect(first.pulled).toBe(1);
    expect(await store.readPendingIds()).toEqual([]);
    expect(push).not.toHaveBeenCalled();
  });

  it("merges a pulled record against local edits rather than overwriting them", async () => {
    await store.cacheReleases([release]);
    const local = createCopy(release, draft, clock, 1000, "copy-1");
    await store.putCopy(local);

    // The server has a newer rating; everything else on it is older.
    const remote: Copy = {
      ...local,
      rating: 5,
      condition: "G",
      fieldClocks: {
        ...local.fieldClocks,
        rating: "000000000900000:0000:b",
        condition: "000000000000001:0000:b",
      },
    };
    pull.mockResolvedValueOnce({ ...EMPTY_PAGE, copies: [remote], cursor: 9, hasMore: false });

    await engine.sync();

    const merged = await store.getCopy("copy-1");
    expect(merged?.rating).toBe(5);
    // The local condition is newer, so the server's older one must not win.
    expect(merged?.condition).toBe("VG_PLUS");
  });

  it("follows the cursor across pages", async () => {
    const one = createCopy(release, draft, clock, 1000, "copy-1");
    const two = createCopy(release, draft, clock, 1000, "copy-2");
    pull
      .mockResolvedValueOnce({ ...EMPTY_PAGE, copies: [one], cursor: 1, hasMore: true })
      .mockResolvedValueOnce({ ...EMPTY_PAGE, copies: [two], cursor: 2, hasMore: false });

    const result = await engine.sync();

    expect(result.pulled).toBe(2);
    expect(await store.readSyncCursor()).toBe(2);
    expect(pull).toHaveBeenNthCalledWith(2, 1);
  });

  it("pushes a tombstone so deletes propagate", async () => {
    await store.cacheReleases([release]);
    await store.putCopy(createCopy(release, draft, clock, 1000, "copy-1"));
    await engine.sync();
    push.mockClear();

    const alive = await store.getCopy("copy-1");
    await store.putCopy(tombstoneCopy(alive as Copy, clock, 5000));
    await engine.sync();

    const pushed = push.mock.calls[0]?.[0] as Copy[];
    expect(pushed).toHaveLength(1);
    expect(pushed[0]?.deletedAt).toBe(5000);
  });

  describe("the catalogue behind pulled copies", () => {
    it("fetches the releases a pulled copy names but this device has never seen", async () => {
      const remote = createCopy(release, draft, clock, 1000, "copy-remote");
      pull.mockResolvedValueOnce({ ...EMPTY_PAGE, copies: [remote], cursor: 5, hasMore: false });
      fetchReleases.mockResolvedValueOnce([release]);

      await engine.sync();

      expect(fetchReleases).toHaveBeenCalledWith(["rel-1"]);
      expect(await store.getRelease("rel-1")).toMatchObject({ title: "Bitches Brew" });
    });

    it("does not ask again for a release it already holds", async () => {
      await store.cacheReleases([release]);
      await store.putCopy(createCopy(release, draft, clock, 1000, "copy-1"));

      await engine.sync();

      expect(fetchReleases).not.toHaveBeenCalled();
    });

    it("never asks a catalogue about a hand-entered release", async () => {
      const manual: Copy = {
        ...createCopy(release, draft, clock, 1000, "copy-manual"),
        releaseId: "local:copy-manual",
      };
      pull.mockResolvedValueOnce({ ...EMPTY_PAGE, copies: [manual], cursor: 5, hasMore: false });

      await engine.sync();

      expect(fetchReleases).not.toHaveBeenCalled();
    });

    it("reports what it filled in, so a caller can redraw a shelf nothing was pulled onto", async () => {
      await store.adoptCopy(createCopy(release, draft, clock, 1000, "copy-1"));
      fetchReleases.mockResolvedValueOnce([release]);

      const result = await engine.sync();

      expect(result.pulled).toBe(0);
      expect(result.releases).toBe(1);
    });

    it("heals a device that pulled its copies before this existed", async () => {
      // The copies are already here, the pull brings nothing new, and the shelf is still
      // blank -- which is exactly the state a client left in by an older build is in.
      await store.adoptCopy(createCopy(release, draft, clock, 1000, "copy-1"));
      fetchReleases.mockResolvedValueOnce([release]);

      await engine.sync();

      expect(fetchReleases).toHaveBeenCalledWith(["rel-1"]);
      expect(await store.getRelease("rel-1")).toMatchObject({ title: "Bitches Brew" });
    });

    it("survives a mirror that is unreachable", async () => {
      const remote = createCopy(release, draft, clock, 1000, "copy-remote");
      pull.mockResolvedValueOnce({ ...EMPTY_PAGE, copies: [remote], cursor: 5, hasMore: false });
      fetchReleases.mockRejectedValueOnce(new Error("offline"));

      const result = await engine.sync();

      expect(result.pulled).toBe(1);
      expect(await store.getCopy("copy-remote")).toBeDefined();
    });

    it("carries on to the later pages when one of them fails", async () => {
      // Two pages' worth, so the first rejection used to end the whole refill and strand
      // every record after it -- permanently, if the failing page was the first one.
      await adoptCopiesNaming(store, clock, 150);
      fetchReleases.mockRejectedValueOnce(new Error("offline"));
      fetchReleases.mockResolvedValueOnce([releaseNumbered(120)]);

      const result = await engine.sync();

      expect(fetchReleases).toHaveBeenCalledTimes(2);
      expect(await store.getRelease("rel-120")).toMatchObject({ title: "Release 120" });
      expect(result.releases).toBe(1);
    });

    it("says the catalogue could not be reached, rather than reporting nothing missing", async () => {
      await store.adoptCopy(createCopy(release, draft, clock, 1000, "copy-1"));
      fetchReleases.mockRejectedValueOnce(new Error("offline"));

      const result = await engine.sync();

      expect(result.releasesUnreachable).toBe(true);
      expect(result.releasesMissing).toBe(1);
    });

    it("counts the copies the mirror answered about but had no entry for", async () => {
      // The mirror stays silent about ids it has never seen rather than failing, so this
      // is a reachable server and a shelf that still cannot be described.
      await store.adoptCopy(createCopy(release, draft, clock, 1000, "copy-1"));
      fetchReleases.mockResolvedValueOnce([]);

      const result = await engine.sync();

      expect(result.releasesUnreachable).toBe(false);
      expect(result.releasesMissing).toBe(1);
      expect(result.releases).toBe(0);
    });

    it("reports nothing missing once the shelf can describe itself", async () => {
      await store.adoptCopy(createCopy(release, draft, clock, 1000, "copy-1"));
      fetchReleases.mockResolvedValueOnce([release]);

      const result = await engine.sync();

      expect(result.releasesMissing).toBe(0);
      expect(result.releasesUnreachable).toBe(false);
    });
  });
});

describe("first sign-in", () => {
  let store: MemoryStore;
  let engine: SyncEngine;
  let clock: ClockSource;

  beforeEach(async () => {
    store = new MemoryStore();
    await store.open();
    clock = clockSource("device-a");
    engine = new SyncEngine(store, clock, transport);
    pull.mockReset();
    push.mockReset();
    push.mockResolvedValue({ ...EMPTY_PAGE });

    await store.cacheReleases([release]);
    await store.putCopy(createCopy(release, draft, clock, 1000, "local-1"));
  });

  it("MERGE keeps both sides", async () => {
    const accountCopy = createCopy(release, draft, clockSource("device-b"), 2000, "account-1");
    pull.mockResolvedValueOnce({ ...EMPTY_PAGE, copies: [accountCopy], cursor: 4, hasMore: false });

    await engine.firstSync("MERGE");

    expect((await store.listCopies()).map((c) => c.id).sort()).toEqual(["account-1", "local-1"]);
  });

  it("KEEP_ACCOUNT discards the local collection", async () => {
    const accountCopy = createCopy(release, draft, clockSource("device-b"), 2000, "account-1");
    pull.mockResolvedValue({ ...EMPTY_PAGE, copies: [accountCopy], cursor: 4, hasMore: false });

    await engine.firstSync("KEEP_ACCOUNT");

    expect((await store.listCopies()).map((c) => c.id)).toEqual(["account-1"]);
    // The discard is a tombstone, so it replicates rather than letting another device
    // hand the records straight back.
    expect((await store.getCopyIncludingDeleted("local-1"))?.deletedAt).not.toBeNull();
  });

  it("KEEP_LOCAL discards what was only in the account", async () => {
    const accountCopy = createCopy(release, draft, clockSource("device-b"), 2000, "account-1");
    pull.mockResolvedValue({ ...EMPTY_PAGE, copies: [accountCopy], cursor: 4, hasMore: false });

    await engine.firstSync("KEEP_LOCAL");

    expect((await store.listCopies()).map((c) => c.id)).toEqual(["local-1"]);
    expect((await store.getCopyIncludingDeleted("account-1"))?.deletedAt).not.toBeNull();
  });
});

describe("deletes stay deleted", () => {
  let store: MemoryStore;
  let engine: SyncEngine;
  let clock: ClockSource;

  beforeEach(async () => {
    store = new MemoryStore();
    await store.open();
    clock = clockSource("device-a");
    engine = new SyncEngine(store, clock, transport);
    pull.mockReset();
    push.mockReset();
    push.mockResolvedValue({ ...EMPTY_PAGE });
  });

  it("does not resurrect a locally deleted copy that the server still has alive", async () => {
    // The regression that motivated getCopyIncludingDeleted: a tombstoned copy looked
    // absent, so the server's live version was adopted as if it were new.
    await store.cacheReleases([release]);
    const alive = createCopy(release, draft, clock, 1000, "copy-1");
    await store.putCopy(alive);
    await store.putCopy(tombstoneCopy(alive, clock, 5000));

    pull.mockResolvedValue({ ...EMPTY_PAGE, copies: [alive], cursor: 7, hasMore: false });
    await engine.sync();

    expect(await store.getCopy("copy-1")).toBeUndefined();
    expect((await store.getCopyIncludingDeleted("copy-1"))?.deletedAt).toBe(5000);
  });

  it("accepts a delete made on another device", async () => {
    await store.cacheReleases([release]);
    const alive = createCopy(release, draft, clock, 1000, "copy-1");
    await store.putCopy(alive);

    const deletedElsewhere = tombstoneCopy(alive, clockSource("device-z"), 9000);
    pull.mockResolvedValue({
      ...EMPTY_PAGE,
      copies: [deletedElsewhere],
      cursor: 7,
      hasMore: false,
    });
    await engine.sync();

    expect(await store.getCopy("copy-1")).toBeUndefined();
  });
});
