import { describe, expect, it } from "vitest";
import { formatBarcode, isBarcode } from "./barcode.js";

describe("isBarcode", () => {
  it("accepts the lengths a record sleeve actually carries", () => {
    expect(isBarcode("00602537")).toBe(true);
    expect(isBarcode("074646510124")).toBe(true);
    expect(isBarcode("4015698012347")).toBe(true);
  });

  it("rejects a search term that happens to contain digits", () => {
    expect(isBarcode("1999")).toBe(false);
    expect(isBarcode("miles davis 1970")).toBe(false);
    expect(isBarcode("")).toBe(false);
  });
});

describe("formatBarcode", () => {
  it("groups EAN-13 the way it is printed", () => {
    expect(formatBarcode("4015698012347")).toBe("4 015698 012347");
  });

  it("groups UPC-A the way it is printed", () => {
    expect(formatBarcode("074646510124")).toBe("0 74646 51012 4");
  });

  it("leaves a length nobody's sleeve groups alone", () => {
    expect(formatBarcode("00602537")).toBe("00602537");
  });
});
