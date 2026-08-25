import { describe, expect, it } from "vitest";
import type { CoverTheme } from "../domain/types.js";
import { chromeFor, lightnessOfHex } from "./theme.js";

function theme(overrides: Partial<CoverTheme> = {}): CoverTheme {
  return {
    dominantColor: "#141311",
    accentColor: "#d08a5f",
    lightness: 0.05,
    dark: true,
    ...overrides,
  };
}

describe("lightnessOfHex", () => {
  it("matches the server's CIE L* at the ends and the middle", () => {
    // If these drift from the backend, the two would disagree about what "light" means.
    expect(lightnessOfHex("#ffffff")).toBeCloseTo(1, 4);
    expect(lightnessOfHex("#000000")).toBeCloseTo(0, 4);
    expect(lightnessOfHex("#808080")).toBeCloseTo(0.534, 2);
  });

  it("returns null for anything that is not a six-digit hex", () => {
    expect(lightnessOfHex("#fff")).toBeNull();
    expect(lightnessOfHex("rgb(0,0,0)")).toBeNull();
  });
});

describe("chromeFor", () => {
  it("falls back to the design palette when there is no cover to sample", () => {
    const chrome = chromeFor(null);

    expect(chrome.dark).toBe(false);
    expect(chrome.accent).toBe("#a2573a");
  });

  it("follows the sleeve into dark chrome", () => {
    const chrome = chromeFor(theme());

    expect(chrome.dark).toBe(true);
    expect(chrome.background).toBe("#141311");
    expect(chrome.ink).toBe("#ffffff");
  });

  it("follows a pale sleeve into light chrome", () => {
    const chrome = chromeFor(theme({ dark: false, lightness: 0.74, accentColor: "#a2573a" }));

    expect(chrome.dark).toBe(false);
    expect(chrome.background).toBe("#faf8f5");
  });

  it("takes the accent from the artwork when it is legible", () => {
    const chrome = chromeFor(theme({ accentColor: "#b93326" }));

    expect(chrome.accent).toBe("#b93326");
  });

  it("rejects an accent that would vanish into dark chrome", () => {
    // A near-black accent on a near-black background makes the stars invisible.
    const chrome = chromeFor(theme({ accentColor: "#0a0a0a" }));

    expect(chrome.accent).toBe("#d08a5f");
  });

  it("rejects an accent that would vanish into light chrome", () => {
    const chrome = chromeFor(theme({ dark: false, accentColor: "#fdfdfd" }));

    expect(chrome.accent).toBe("#a2573a");
  });

  it("keeps the design accent when the artwork gives an unparseable colour", () => {
    const chrome = chromeFor(theme({ accentColor: "not-a-colour" }));

    expect(chrome.accent).toBe("#d08a5f");
  });
});
