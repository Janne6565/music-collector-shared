import { describe, expect, it } from "vitest";
import { PHOTO_MERGEABLE_FIELDS } from "../domain/types.js";
import { MemoryStore } from "../testing/MemoryStore.js";
import { createPhoto, tombstonePhoto } from "./photoWrites.js";

const clock = (() => {
  let wall = 0;
  return {
    next() {
      wall += 1;
      return { wall, counter: 0, node: "test-device" };
    },
  };
})();

describe("a photo's owner", () => {
  it("belongs to a copy, and says so by leaving the wish null", () => {
    const photo = createPhoto(
      { copyId: "copy-1", contentType: "image/jpeg", byteSize: 10, sortIndex: 0 },
      clock,
      1000,
      "photo-1",
    );

    expect(photo.copyId).toBe("copy-1");
    expect(photo.wishId).toBeNull();
  });

  it("belongs to a wish the same way round", () => {
    const photo = createPhoto(
      { wishId: "wish-1", contentType: "image/png", byteSize: 10, sortIndex: 0 },
      clock,
      1000,
      "photo-2",
    );

    expect(photo.wishId).toBe("wish-1");
    expect(photo.copyId).toBeNull();
  });

  it("stamps the owner fields, so a photo can be re-parented by a merge", () => {
    const photo = createPhoto(
      { wishId: "wish-1", contentType: "image/png", byteSize: 10, sortIndex: 0 },
      clock,
      1000,
      "photo-3",
    );

    expect(PHOTO_MERGEABLE_FIELDS).toContain("wishId");
    for (const field of PHOTO_MERGEABLE_FIELDS) {
      expect(photo.fieldClocks[field]).toBeDefined();
    }
  });
});

describe("MemoryStore.listWishPhotos", () => {
  it("gives each wish its own picture and skips copies' photos entirely", async () => {
    const store = new MemoryStore();
    await store.putPhoto(
      createPhoto(
        { wishId: "w1", contentType: "image/png", byteSize: 1, sortIndex: 0 },
        clock,
        1,
        "p1",
      ),
    );
    await store.putPhoto(
      createPhoto(
        { wishId: "w2", contentType: "image/png", byteSize: 1, sortIndex: 0 },
        clock,
        2,
        "p2",
      ),
    );
    await store.putPhoto(
      createPhoto(
        { copyId: "c1", contentType: "image/png", byteSize: 1, sortIndex: 0 },
        clock,
        3,
        "p3",
      ),
    );

    const covers = await store.listWishPhotos(["w1", "w2", "c1"]);

    expect(covers.get("w1")?.id).toBe("p1");
    expect(covers.get("w2")?.id).toBe("p2");
    expect(covers.has("c1")).toBe(false);
  });

  it("prefers the newest picture, so a replacement wins before the old tombstone syncs", async () => {
    const store = new MemoryStore();
    await store.putPhoto(
      createPhoto(
        { wishId: "w1", contentType: "image/png", byteSize: 1, sortIndex: 0 },
        clock,
        1,
        "old",
      ),
    );
    await store.putPhoto(
      createPhoto(
        { wishId: "w1", contentType: "image/png", byteSize: 1, sortIndex: 0 },
        clock,
        2,
        "new",
      ),
    );

    expect((await store.listWishPhotos(["w1"])).get("w1")?.id).toBe("new");
  });

  it("forgets a picture that was taken back", async () => {
    const store = new MemoryStore();
    const photo = createPhoto(
      { wishId: "w1", contentType: "image/png", byteSize: 1, sortIndex: 0 },
      clock,
      1,
      "p1",
    );
    await store.putPhoto(photo);
    await store.putPhoto(tombstonePhoto(photo, clock, 5));

    expect((await store.listWishPhotos(["w1"])).size).toBe(0);
  });
});
