import { describe, expect, it } from "vitest";
import { copyFormat } from "./copyFormat.js";
import type { Release } from "./types.js";

const VINYL = { format: "VINYL" } as Pick<Release, "format">;

describe("copyFormat", () => {
  it("is the catalogue's answer when the copy has none of its own", () => {
    expect(copyFormat({ manualFormat: null }, VINYL)).toBe("VINYL");
  });

  it("is the copy's own answer when it has one", () => {
    // A cassette of a record the archive only lists as vinyl is a normal thing to own.
    expect(copyFormat({ manualFormat: "CASSETTE" }, VINYL)).toBe("CASSETTE");
  });

  it("falls back to OTHER when neither the copy nor a cached release says", () => {
    expect(copyFormat({ manualFormat: null }, undefined)).toBe("OTHER");
  });
});
