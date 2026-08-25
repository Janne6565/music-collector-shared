/**
 * The motion set from turn 13 of the deck — four named transitions, three durations, three
 * easings, and one outlier.
 *
 * Plain values, because both clients have to say the same thing in two languages: the web
 * spends them as CSS custom properties, the device as `Animated.timing` configs. Neither
 * needs a motion library, and the deck's set is deliberately small enough that this file is
 * the whole of it.
 */

export const DURATION = {
  /** Leaving, dismissing, and any change that is only a colour. */
  quick: 120,
  /** Arriving. The default — if you are unsure, it is this. */
  base: 220,
  /** Once-per-screen entrances only: empty states, first run, the undo toast leaving. */
  slow: 400,
  /**
   * The outlier, with exactly one use: the cover-theme recolour on the mobile detail
   * screen. Nothing else may borrow it.
   */
  wash: 560,
} as const;

/** A very dark target needs longer, or the recolour reads as a light switch. */
export const WASH_DARK = {
  /** Lightness gap past which the wash stretches. */
  gapThreshold: 0.45,
  duration: 720,
  /** The text cross-fade moves back with it. */
  textAt: 400,
} as const;

/** Where the wash's four lanes start, measured from the palette resolving. */
export const WASH_LANES = {
  /** The 100ms text cross-fade is centred here, so it starts 50ms earlier. */
  textAt: 320,
  textDuration: 100,
  /** The accent lands last, 120ms after the text has swapped. */
  accentAt: 440,
  accentDuration: 240,
} as const;

/**
 * A wash inside a screen the reader has not settled into yet reads as a glitch, so a
 * palette that arrives this soon after mount is applied outright.
 */
export const WASH_INSTANT_BEFORE = 250;

export const EASING = {
  /** Fast off the mark, long settle. Everything that appears. */
  enter: [0.2, 0.8, 0.25, 1],
  /** Accelerates out and never decelerates. Everything that leaves, always at quick. */
  exit: [0.4, 0, 1, 1],
  /** Symmetric. Only for things already on screen that change position or colour. */
  move: [0.4, 0, 0.2, 1],
} as const;

export type EasingName = keyof typeof EASING;

/** `cubic-bezier(…)`, for a stylesheet or an inline style. */
export function cssEasing(name: EasingName): string {
  return `cubic-bezier(${EASING[name].join(",")})`;
}

/** How long the Mark ring holds before it fades. */
export const MARK_HOLD = 1400;

/** How long the undo toast stays up after a delete. */
export const UNDO_HOLD = 6000;

/**
 * Past this many tiles moving at once, Settle is skipped and the grid Crosses instead —
 * a hundred tiles flying to new places is noise, not continuity.
 */
export const SETTLE_MAX_MOVES = 60;

/**
 * Reduced motion drops displacement without dropping the fade.
 *
 * The deck is explicit that this is not a separate mode: every transition keeps its
 * opacity and loses its translate and scale, exits stay quick, and the wash collapses to a
 * single 200ms cross-fade of the themed layer.
 */
export const REDUCED = {
  washDuration: 200,
} as const;
