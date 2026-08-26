import { beforeEach, describe, expect, it } from "vitest";
import type { Copy, Release } from "../domain/types.js";
import { applyCopyPatch, createCopy } from "../local/copyWrites.js";
import { createPhoto } from "../local/photoWrites.js";
import { createWishlistItem } from "../local/wishWrites.js";
import { MemoryStore } from "../testing/MemoryStore.js";
import {
  readArchivedAlbumCovers,
  rememberArchivedAlbumCovers,
  withArchivedCovers,
} from "./albumCovers.js";
import { exportMcArchive } from "./collect.js";
import { MC_MANIFEST_PATH, McArchiveError, mcFileName, readMcArchive } from "./mcArchive.js";
import { importMcArchive } from "./restore.js";
import { decodeUtf8, encodeUtf8, readZip, writeZip } from "./zip.js";

const AT = new Date("2026-08-26T10:30:00Z");

function clockSource(node: string) {
  let wall = 1_000;
  return {
    next() {
      wall += 1;
      return { wall, counter: 0, node };
    },
  };
}

const RELEASE: Release = {
  id: "musicbrainz:r-1",
  albumId: "musicbrainz:a-1",
  title: "Homogenic",
  artistName: "Björk",
  year: 1997,
  format: "VINYL",
  label: "One Little Indian",
  catalogNumber: "TPLP71",
  country: "GB",
  barcode: null,
  releaseDate: "1997-09-22",
  trackCount: 10,
  discCount: 1,
  coverArtUrl: null,
  coverTheme: null,
  cachedAt: 1_000,
};

const DRAFT = {
  condition: "VG_PLUS",
  sleeveCondition: null,
  catalogArt: "AUTO",
  pricePaidCents: 2_499,
  currency: "EUR",
  purchasedOn: "2026-01-04",
  purchasedAt: "Oye Records",
  notes: "Gatefold, faint ring wear.",
  rating: 5,
} as const;

/** A device with one photographed copy, one wish, and the catalogue entry behind them. */
async function seeded() {
  const store = new MemoryStore();
  const clock = clockSource("device-a");
  await store.cacheReleases([RELEASE]);

  const copy = createCopy(RELEASE, DRAFT, clock, 1_700, "copy-1");
  await store.putCopy(copy);

  const photo = createPhoto(
    { copyId: copy.id, contentType: "image/jpeg", byteSize: 5, sortIndex: 0 },
    clock,
    1_701,
    "photo-1",
  );
  await store.putPhoto(photo);
  await store.putPhotoBytes(
    photo.id,
    new Uint8Array([0xff, 0xd8, 1, 2, 3]).buffer,
    photo.contentType,
  );

  const wish = createWishlistItem(
    {
      albumId: "musicbrainz:a-2",
      title: "Vespertine",
      artistName: "Björk",
      year: 2001,
      desiredFormat: "VINYL",
      note: null,
    },
    clock,
    1_702,
    "wish-1",
  );
  await store.putWishlistItem(wish);

  return { store, clock, copy, photo, wish };
}

/** The byte reader the browser and the phone each supply for real. */
function readerFor(store: MemoryStore) {
  return async (photoId: string) => {
    const buffer = store.photoBuffer(photoId);
    return buffer === undefined ? undefined : new Uint8Array(buffer);
  };
}

async function archiveOf(store: MemoryStore, covers?: Record<string, string | null>) {
  return await exportMcArchive(
    store,
    { collection: "releaseId\r\n", wishlist: "albumId\r\n" },
    readerFor(store),
    AT,
    covers === undefined
      ? undefined
      : async (ids) => new Map(ids.map((id) => [id, covers[id] ?? null])),
  );
}

describe("the .mc archive", () => {
  it("is a zip anybody can open, laid out for a human", async () => {
    const { store } = await seeded();

    const paths = readZip((await archiveOf(store)).bytes).map((entry) => entry.path);

    expect(paths).toEqual([
      "collection.json",
      "collection.csv",
      "wishlist.csv",
      "photos/photo-1.jpg",
    ]);
  });

  it("names the photo file by content type, so it opens on a double-click", async () => {
    const { store, clock } = await seeded();
    const png = createPhoto(
      { copyId: "copy-1", contentType: "image/png", byteSize: 1, sortIndex: 1 },
      clock,
      1_800,
      "photo-2",
    );
    await store.putPhoto(png);
    await store.putPhotoBytes(png.id, new Uint8Array([0x89, 0x50]).buffer, png.contentType);

    const paths = readZip((await archiveOf(store)).bytes).map((entry) => entry.path);

    expect(paths).toContain("photos/photo-2.png");
  });

  it("carries the CSV exports verbatim, so the file is readable without this app", async () => {
    const { store } = await seeded();

    const entries = readZip((await archiveOf(store)).bytes);
    const collection = entries.find((entry) => entry.path === "collection.csv");

    expect(decodeUtf8(collection?.bytes ?? new Uint8Array())).toBe("releaseId\r\n");
  });

  it("counts what it wrote", async () => {
    const { store } = await seeded();

    const result = await archiveOf(store);

    expect(result).toMatchObject({ copies: 1, wishes: 1, photos: 1, photosWithoutBytes: 0 });
  });

  it("reports a photo whose bytes this device never received", async () => {
    const { store, clock } = await seeded();
    // A photo pulled by sync whose download failed: the record is here, the picture is not.
    await store.putPhoto(
      createPhoto(
        { copyId: "copy-1", contentType: "image/jpeg", byteSize: 9, sortIndex: 2 },
        clock,
        1_900,
        "photo-orphan",
      ),
    );

    const result = await archiveOf(store);

    expect(result.photos).toBe(1);
    expect(result.photosWithoutBytes).toBe(1);
  });

  it("names the file by the day it was exported", () => {
    expect(mcFileName(AT)).toBe("music-collector-2026-08-26.mc");
  });
});

describe("importing a .mc", () => {
  let source: Awaited<ReturnType<typeof seeded>>;

  beforeEach(async () => {
    source = await seeded();
  });

  it("restores a fresh device exactly, ids and all", async () => {
    const archive = (await archiveOf(source.store)).bytes;
    const restored = new MemoryStore();

    const result = await importMcArchive(restored, archive, clockSource("device-b"));

    expect(result).toMatchObject({ copies: 1, wishes: 1, photos: 1, releases: 1 });
    expect(await restored.listCopies()).toEqual([source.copy]);
    expect(await restored.getRelease(RELEASE.id)).toEqual(RELEASE);
    expect((await restored.listWishlist())[0].title).toBe("Vespertine");
    expect([...new Uint8Array(restored.photoBuffer("photo-1") as ArrayBuffer)]).toEqual([
      0xff, 0xd8, 1, 2, 3,
    ]);
  });

  it("is idempotent: importing your own archive twice changes nothing", async () => {
    const archive = (await archiveOf(source.store)).bytes;
    const restored = new MemoryStore();

    await importMcArchive(restored, archive, clockSource("device-b"));
    const after = await restored.listCopies();
    await importMcArchive(restored, archive, clockSource("device-b"));

    expect(await restored.listCopies()).toEqual(after);
    expect(await restored.listAllPhotos()).toHaveLength(1);
  });

  it("keeps a newer local edit rather than winding it back", async () => {
    const archive = (await archiveOf(source.store)).bytes;
    const restored = new MemoryStore();
    await importMcArchive(restored, archive, clockSource("device-b"));
    const later = clockSource("device-b");
    const edited = applyCopyPatch(
      (await restored.listCopies())[0] as Copy,
      { notes: "Cleaned it since." },
      later,
    );
    await restored.putCopy(edited);

    await importMcArchive(restored, archive, later);

    expect((await restored.listCopies())[0].notes).toBe("Cleaned it since.");
  });

  it("marks an imported photo as never uploaded, so it lands under this account", async () => {
    // The archive's photo has been uploaded by whoever exported it: its key names *their*
    // folder in the bucket, which this account can neither read nor write.
    const uploaded = { ...source.photo, storageKey: "someone-else/photo-1" };
    await source.store.putPhoto(uploaded);
    const archive = (await archiveOf(source.store)).bytes;
    const restored = new MemoryStore();

    await importMcArchive(restored, archive, clockSource("device-b"));

    expect((await restored.listAllPhotos())[0].storageKey).toBeNull();
    expect(await restored.listPhotosAwaitingUpload()).toHaveLength(1);
  });

  it("leaves the key alone on a photo this device already uploaded", async () => {
    const uploaded = { ...source.photo, storageKey: "me/photo-1" };
    await source.store.putPhoto(uploaded);
    const archive = (await archiveOf(source.store)).bytes;

    await importMcArchive(source.store, archive, source.clock);

    expect((await source.store.listAllPhotos())[0].storageKey).toBe("me/photo-1");
  });

  it("skips a photo record that has no picture anywhere", async () => {
    await source.store.putPhoto(
      createPhoto(
        { copyId: "copy-1", contentType: "image/jpeg", byteSize: 9, sortIndex: 2 },
        source.clock,
        1_900,
        "photo-orphan",
      ),
    );
    const archive = (await archiveOf(source.store)).bytes;
    const restored = new MemoryStore();

    const result = await importMcArchive(restored, archive, clockSource("device-b"));

    expect(result.photos).toBe(1);
    expect(result.photosWithoutBytes).toBe(1);
    expect(await restored.listAllPhotos()).toHaveLength(1);
  });

  it("queues everything it restored for the next push", async () => {
    const archive = (await archiveOf(source.store)).bytes;
    const restored = new MemoryStore();

    await importMcArchive(restored, archive, clockSource("device-b"));

    expect(await restored.readPendingIds()).toEqual(["copy-1", "wish-1", "photo-1"]);
  });

  it("refuses a zip that is not one of ours", async () => {
    const foreign = writeZip([{ path: "notes.txt", bytes: encodeUtf8("hello") }], AT);

    expect(() => readMcArchive(foreign)).toThrow(McArchiveError);
  });

  it("refuses an archive from a newer version rather than importing it lossily", async () => {
    const future = writeZip(
      [
        {
          path: MC_MANIFEST_PATH,
          bytes: encodeUtf8(JSON.stringify({ app: "music-collector", formatVersion: 99 })),
        },
      ],
      AT,
    );

    expect(() => readMcArchive(future)).toThrow(/newer version/);
  });

  it("imports an archive that carries no photos at all", async () => {
    const empty = new MemoryStore();
    await empty.cacheReleases([RELEASE]);
    await empty.putCopy(createCopy(RELEASE, DRAFT, clockSource("device-c"), 1_700, "copy-9"));
    const archive = (await archiveOf(empty)).bytes;
    const restored = new MemoryStore();

    const result = await importMcArchive(restored, archive, clockSource("device-b"));

    expect(result).toMatchObject({ copies: 1, photos: 0, photosWithoutBytes: 0 });
  });
});

/**
 * A wish's cover is the one thing in the archive that is not in the collection.
 *
 * It lives in the server's release mirror, which is per-deployment — so an archive
 * exported where the albums are known and imported where they are not showed a wishlist
 * of blank silhouettes, and never recovered.
 */
describe("wishlist album covers", () => {
  const COVER = "https://coverartarchive.org/release-group/a-2/front-500";

  it("carries the cover the exporting device could resolve", async () => {
    const { store } = await seeded();

    const built = await archiveOf(store, { "musicbrainz:a-2": COVER });

    expect(built.albumCovers).toBe(1);
    const manifest = JSON.parse(
      decodeUtf8(
        readZip(built.bytes).find((e) => e.path === MC_MANIFEST_PATH)?.bytes ?? new Uint8Array(),
      ),
    );
    expect(manifest.albumCovers).toEqual({ "musicbrainz:a-2": COVER });
  });

  it("asks only about wishes, and never about a hand-entered album", async () => {
    const { store, clock } = await seeded();
    await store.putWishlistItem(
      createWishlistItem(
        {
          albumId: "local:made-up",
          title: "A bootleg",
          artistName: "Nobody",
          year: null,
          desiredFormat: null,
          note: null,
        },
        clock,
        1_900,
        "wish-local",
      ),
    );
    const asked: string[][] = [];

    await exportMcArchive(
      store,
      { collection: "", wishlist: "" },
      readerFor(store),
      AT,
      async (ids) => {
        asked.push([...ids]);
        return new Map();
      },
    );

    expect(asked).toEqual([["musicbrainz:a-2"]]);
  });

  it("still writes the archive when the lookup fails", async () => {
    const { store } = await seeded();

    const built = await exportMcArchive(
      store,
      { collection: "", wishlist: "" },
      readerFor(store),
      AT,
      async () => {
        throw new Error("offline");
      },
    );

    expect(built.albumCovers).toBe(0);
    expect(built.copies).toBe(1);
  });

  it("keeps them on import, where the importing deployment cannot resolve one", async () => {
    const { store } = await seeded();
    const built = await archiveOf(store, { "musicbrainz:a-2": COVER });
    const restored = new MemoryStore();

    const result = await importMcArchive(restored, built.bytes, clockSource("device-b"));

    expect(result.albumCovers).toBe(1);
    expect(await readArchivedAlbumCovers(restored)).toEqual({ "musicbrainz:a-2": COVER });
  });

  it("fills a null the server could not answer, which is the whole point", () => {
    // What prod returns for an album its mirror has never seen: present, but null.
    const live = new Map([["musicbrainz:a-2", null]]);

    expect(withArchivedCovers(live, { "musicbrainz:a-2": COVER }).get("musicbrainz:a-2")).toBe(
      COVER,
    );
  });

  it("never overrides a cover this deployment resolved itself", () => {
    const live = new Map([["musicbrainz:a-2", "https://live/one.jpg"]]);

    expect(withArchivedCovers(live, { "musicbrainz:a-2": COVER }).get("musicbrainz:a-2")).toBe(
      "https://live/one.jpg",
    );
  });

  it("merges archives rather than replacing what an earlier one left", async () => {
    const store = new MemoryStore();

    await rememberArchivedAlbumCovers(store, { "album-1": "one.jpg" });
    await rememberArchivedAlbumCovers(store, { "album-2": "two.jpg" });

    expect(await readArchivedAlbumCovers(store)).toEqual({
      "album-1": "one.jpg",
      "album-2": "two.jpg",
    });
  });

  it("treats an unreadable cache as an empty one", async () => {
    const store = new MemoryStore();
    await store.writeSetting("archivedAlbumCovers", "{not json");

    expect(await readArchivedAlbumCovers(store)).toEqual({});
  });

  it("reads an archive written before covers existed", async () => {
    const older = writeZip(
      [
        {
          path: MC_MANIFEST_PATH,
          bytes: encodeUtf8(
            JSON.stringify({ app: "music-collector", formatVersion: 1, copies: [], wishes: [] }),
          ),
        },
      ],
      AT,
    );
    const restored = new MemoryStore();

    const result = await importMcArchive(restored, older, clockSource("device-b"));

    expect(result.albumCovers).toBe(0);
  });
});
