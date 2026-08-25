import { describe, expect, it } from "vitest";
import { formatCentsForInput, parseIsoDate, parseMoneyToCents } from "./money.js";

describe("parseMoneyToCents", () => {
  it("accepts the ways people actually type a price", () => {
    expect(parseMoneyToCents("28")).toBe(2800);
    expect(parseMoneyToCents("28.50")).toBe(2850);
    expect(parseMoneyToCents("28,50")).toBe(2850);
    expect(parseMoneyToCents(" €28.50 ")).toBe(2850);
    expect(parseMoneyToCents("0")).toBe(0);
  });

  it("does not lose a cent to floating point", () => {
    // 0.29 * 100 is 28.999999999999996 in IEEE 754; truncating would charge 28 cents.
    expect(parseMoneyToCents("0.29")).toBe(29);
    expect(parseMoneyToCents("1.15")).toBe(115);
    expect(parseMoneyToCents("9.99")).toBe(999);
  });

  it("rounds rather than truncates extra precision", () => {
    expect(parseMoneyToCents("28.999")).toBe(2900);
    expect(parseMoneyToCents("28.001")).toBe(2800);
  });

  it("returns null for anything that is not a price", () => {
    expect(parseMoneyToCents("")).toBeNull();
    expect(parseMoneyToCents("   ")).toBeNull();
    expect(parseMoneyToCents("free")).toBeNull();
    expect(parseMoneyToCents("€")).toBeNull();
    expect(parseMoneyToCents("-5")).toBeNull();
  });

  it("round-trips through the input format", () => {
    for (const cents of [0, 5, 999, 2850, 123456]) {
      expect(parseMoneyToCents(formatCentsForInput(cents))).toBe(cents);
    }
  });
});

describe("formatCentsForInput", () => {
  it("is blank for a price that was never recorded", () => {
    // Distinct from "0", which means the record was free.
    expect(formatCentsForInput(null)).toBe("");
    expect(formatCentsForInput(0)).toBe("0.00");
  });
});

describe("parseIsoDate", () => {
  it("accepts an ISO date", () => {
    expect(parseIsoDate("2026-08-14")).toBe("2026-08-14");
  });

  it("rejects a day that does not exist", () => {
    // Matches the pattern but is not a date; Date would silently roll it into March.
    expect(parseIsoDate("2026-02-30")).toBeNull();
    expect(parseIsoDate("2026-13-01")).toBeNull();
  });

  it("rejects anything that is not an ISO date", () => {
    expect(parseIsoDate("")).toBeNull();
    expect(parseIsoDate("14 Aug 2026")).toBeNull();
    expect(parseIsoDate("2026-8-14")).toBeNull();
  });
});
