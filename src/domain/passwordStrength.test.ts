import { describe, expect, it } from "vitest";
import { PASSWORD_MIN_LENGTH, passwordLongEnough, passwordStrength } from "./passwordStrength.js";

describe("passwordStrength", () => {
  it("scores nothing below the length the server will accept", () => {
    // The meter must never suggest a password is fine when submitting it would fail.
    expect(passwordStrength("short")).toBe(0);
    expect(passwordStrength("a".repeat(PASSWORD_MIN_LENGTH - 1))).toBe(0);
  });

  it("rewards length above all else", () => {
    expect(passwordStrength("a".repeat(10))).toBe(1);
    expect(passwordStrength("a".repeat(16))).toBe(2);
    expect(passwordStrength("a".repeat(24))).toBe(3);
  });

  it("rates a long passphrase at least as highly as a short mangled password", () => {
    // The whole point of the copy: length beats punctuation theatre.
    expect(passwordStrength("correct horse battery staple")).toBeGreaterThanOrEqual(
      passwordStrength("P@ssw0rd!1"),
    );
  });

  it("gives some credit for variety, but only past a decent length", () => {
    expect(passwordStrength("Abcdefgh1!2345")).toBe(2);
    expect(passwordStrength("Abcdefgh1!")).toBe(1);
  });

  it("never exceeds the three bars the meter can draw", () => {
    expect(passwordStrength(`${"A1!a".repeat(40)}`)).toBe(3);
  });
});

describe("passwordLongEnough", () => {
  it("matches the server's minimum exactly", () => {
    expect(passwordLongEnough("a".repeat(PASSWORD_MIN_LENGTH))).toBe(true);
    expect(passwordLongEnough("a".repeat(PASSWORD_MIN_LENGTH - 1))).toBe(false);
  });
});
