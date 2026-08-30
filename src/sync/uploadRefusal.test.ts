import { describe, expect, it } from "vitest";
import { MemoryStore } from "../testing/MemoryStore.js";
import {
  PHOTO_UPLOAD_REFUSAL,
  clearUploadRefusal,
  httpStatusOf,
  readUploadRefusal,
  refusalReasonFor,
  writeUploadRefusal,
} from "./uploadRefusal.js";

describe("httpStatusOf", () => {
  it("reads the phone's HttpError, which carries the status directly", () => {
    expect(httpStatusOf(Object.assign(new Error("507 from /api/v1/photos"), { status: 507 }))).toBe(
      507,
    );
  });

  it("reads axios, which hangs the response off the error", () => {
    expect(httpStatusOf({ response: { status: 413 } })).toBe(413);
  });

  it("has no status for a network failure, which is the answer that matters", () => {
    // No status means it was not the server refusing, so nothing is remembered and the
    // next sync simply tries again.
    expect(httpStatusOf(new TypeError("Failed to fetch"))).toBeNull();
    expect(httpStatusOf(undefined)).toBeNull();
    expect(httpStatusOf("boom")).toBeNull();
  });
});

describe("refusalReasonFor", () => {
  it("separates the two refusals, because their fixes rule each other out", () => {
    expect(refusalReasonFor(507)).toBe("full");
    expect(refusalReasonFor(413)).toBe("tooLarge");
  });

  it("keeps a lapsed session out of it", () => {
    // Telling somebody their storage is full because their token expired would be both
    // wrong and unfixable by the thing the sentence asks them to do.
    expect(refusalReasonFor(401)).toBeNull();
    expect(refusalReasonFor(500)).toBeNull();
    expect(refusalReasonFor(null)).toBeNull();
  });
});

describe("the remembered refusal", () => {
  it("survives a round trip through the settings table", async () => {
    const store = new MemoryStore();
    await writeUploadRefusal(store, { reason: "full", photoId: "photo-1", at: 1000 });
    expect(await readUploadRefusal(store)).toEqual({
      reason: "full",
      photoId: "photo-1",
      at: 1000,
    });
  });

  it("reads as nothing refused when the row is missing or cleared", async () => {
    const store = new MemoryStore();
    expect(await readUploadRefusal(store)).toBeNull();
    await writeUploadRefusal(store, { reason: "full", photoId: "photo-1", at: 1000 });
    await clearUploadRefusal(store);
    expect(await readUploadRefusal(store)).toBeNull();
  });

  it("reads as nothing refused rather than throwing on a row it cannot parse", async () => {
    // The banner going missing is the safe way to be wrong here. A banner that lies is not.
    const store = new MemoryStore();
    await store.writeSetting(PHOTO_UPLOAD_REFUSAL, "{ half a wr");
    expect(await readUploadRefusal(store)).toBeNull();
    await store.writeSetting(PHOTO_UPLOAD_REFUSAL, JSON.stringify({ reason: "whatever" }));
    expect(await readUploadRefusal(store)).toBeNull();
  });
});
