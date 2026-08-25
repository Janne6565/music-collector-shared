import { describe, expect, it } from "vitest";
import { catalogArtShown, copyPreviewSrc } from "./preview.js";

describe("copyPreviewSrc", () => {
  it("is the copy's own photo, which outranks the catalogue's artwork", () => {
    // Both clients have to answer this the same way, or the same collection looks
    // different on two devices — which is exactly what mobile did before it was fixed.
    expect(copyPreviewSrc({ catalogArt: "AUTO" }, "file:///photo.jpg")).toBe("file:///photo.jpg");
  });

  it("falls through to the catalogue when the copy has no photo here yet", () => {
    expect(copyPreviewSrc({ catalogArt: "AUTO" }, null)).toBeNull();
  });

  it("gives way to the catalogue art once that has been starred", () => {
    expect(copyPreviewSrc({ catalogArt: "PREFERRED" }, "file:///photo.jpg")).toBeNull();
  });

  it("still prefers the photo on a copy that has hidden the catalogue art", () => {
    // HIDDEN is a question about the list, not about which of its entries is the preview.
    expect(copyPreviewSrc({ catalogArt: "HIDDEN" }, "file:///photo.jpg")).toBe("file:///photo.jpg");
  });
});

describe("catalogArtShown", () => {
  it("shows the release's art unless this copy dropped it", () => {
    expect(catalogArtShown({ catalogArt: "AUTO" }, true)).toBe(true);
    expect(catalogArtShown({ catalogArt: "PREFERRED" }, true)).toBe(true);
    expect(catalogArtShown({ catalogArt: "HIDDEN" }, true)).toBe(false);
  });

  it("shows nothing when there is no artwork behind it", () => {
    expect(catalogArtShown({ catalogArt: "AUTO" }, false)).toBe(false);
  });
});
