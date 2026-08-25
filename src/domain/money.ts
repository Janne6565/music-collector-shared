/**
 * Money is stored in whole cents. Parsing it back from what someone types is the fiddly
 * part: prices get entered as "28", "28.50", "28,50" or "€28.50" depending on keyboard and
 * habit, and a wrong answer here silently corrupts what you paid for a record.
 */

/** Returns null when the input is not a price at all; zero and blank are distinguished. */
export function parseMoneyToCents(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;

  // Strip currency symbols and spaces, then normalise the decimal separator. A comma is a
  // decimal point across most of Europe, which is where this app's currency default lives.
  const cleaned = trimmed.replace(/[^\d.,-]/g, "").replace(",", ".");
  if (cleaned === "" || cleaned === "." || cleaned === "-") return null;

  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;

  // Rounded rather than truncated: 28.999 is someone typing, not an instruction to lose a
  // cent. Guarded against float error, so 0.29 * 100 does not become 28.999999999999996.
  return Math.round(value * 100);
}

/** The value an editable price field should start with. Blank for "not recorded". */
export function formatCentsForInput(cents: number | null): string {
  if (cents === null) return "";
  return (cents / 100).toFixed(2);
}

/** A date the app is willing to store: ISO, no time, or nothing at all. */
export function parseIsoDate(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  // Rejects 2026-02-30, which passes the pattern but is not a day.
  return parsed.toISOString().slice(0, 10) === trimmed ? trimmed : null;
}
