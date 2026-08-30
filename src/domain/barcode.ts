/**
 * Barcodes, as they are read off a sleeve and as they are shown back.
 *
 * A scan is checked against the object in your hand — the whole reason the confirm card
 * shows the number at all is so you can glance from the screen to the sleeve and see the
 * same digits. Printed barcodes are grouped, so an ungrouped run of thirteen digits makes
 * that comparison a counting exercise. These group them the way the symbol itself does.
 */

/** What the scanner is allowed to hand back: UPC-E through EAN-13, digits only. */
const BARCODE = /^\d{8,14}$/;

export function isBarcode(value: string): boolean {
  return BARCODE.test(value.trim());
}

/**
 * The digits, spaced as they are printed under the bars.
 *
 * EAN-13 prints as 1-6-6 and UPC-A as 1-5-5-1, which is what the two lengths that matter
 * in a record shop are. Anything else is returned untouched rather than grouped by a rule
 * nobody's sleeve follows.
 */
export function formatBarcode(barcode: string): string {
  const digits = barcode.trim();
  if (digits.length === 13) {
    return `${digits.slice(0, 1)} ${digits.slice(1, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 12) {
    return `${digits.slice(0, 1)} ${digits.slice(1, 6)} ${digits.slice(6, 11)} ${digits.slice(11)}`;
  }
  return digits;
}
