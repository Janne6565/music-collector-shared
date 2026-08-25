import type { CoverTheme } from "../domain/types.js";

export interface DetailChrome {
  readonly background: string;
  readonly surface: string;
  readonly ink: string;
  readonly muted: string;
  readonly line: string;
  readonly accent: string;
  readonly dark: boolean;
}

/** The design deck's own palette, used when a release has no cover art to sample. */
const LIGHT: DetailChrome = {
  background: "#faf8f5",
  surface: "#ffffff",
  ink: "#191713",
  muted: "rgba(25,23,19,0.55)",
  line: "rgba(25,23,19,0.09)",
  accent: "#a2573a",
  dark: false,
};

const DARK: DetailChrome = {
  background: "#141311",
  surface: "#191713",
  ink: "#ffffff",
  muted: "rgba(255,255,255,0.55)",
  line: "rgba(255,255,255,0.09)",
  accent: "#d08a5f",
  dark: true,
};

/**
 * Turn 3 of the design deck: the item detail follows the sleeve.
 *
 * The server has already decided `dark` from the cover's perceptual lightness, so this is
 * a lookup rather than a computation — which is what makes the theme correct on first
 * paint instead of flashing the wrong one until the image loads.
 *
 * The accent comes from the artwork, but only when it is legible against the chrome it
 * lands on; a dark accent on dark chrome would render the stars invisible.
 */
export function chromeFor(theme: CoverTheme | null): DetailChrome {
  if (theme === null) return LIGHT;
  const base = theme.dark ? DARK : LIGHT;
  return { ...base, accent: legibleAccent(theme, base) };
}

function legibleAccent(theme: CoverTheme, base: DetailChrome): string {
  const accentLightness = lightnessOfHex(theme.accentColor);
  if (accentLightness === null) return base.accent;
  // Require a real gap from the background, or fall back to the design accent.
  const backgroundLightness = base.dark ? 0.08 : 0.97;
  return Math.abs(accentLightness - backgroundLightness) < 0.25 ? base.accent : theme.accentColor;
}

/** Mirrors the server's CIE L* so both ends agree on what "light" means. */
export function lightnessOfHex(hex: string): number | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (match === null) return null;
  const value = Number.parseInt(match[1] as string, 16);
  const channel = (raw: number) => {
    const n = raw / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  const y =
    0.2126 * channel((value >> 16) & 0xff) +
    0.7152 * channel((value >> 8) & 0xff) +
    0.0722 * channel(value & 0xff);
  const f = y > 0.008856 ? Math.cbrt(y) : (903.3 * y + 16) / 116;
  return Math.min(1, Math.max(0, (116 * f - 16) / 100));
}
