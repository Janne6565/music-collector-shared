import { DURATION } from "../motion.js";
import type { RollRow } from "./rollPool.js";

/**
 * The wheel's geometry and the four states it moves through — turn 26a's motion spec, in
 * the one place both clients read it from.
 *
 * The web spends these as CSS keyframes and transitions, the device as `Animated.timing`
 * configs. Neither may invent its own number: the throw is the same object on both, and a
 * lap that runs at a different speed in one of them is a different feature.
 */

/**
 * One wheel's measurements — the deck draws two, and they are not a scale of each other.
 *
 * The phone's band is the width of a sheet; the dialog's is the width of a desk, three
 * covers at a time, and it drifts more slowly because a wider band travelling at the same
 * speed reads as faster. Everything after the first frame — spin, settle, curves — is the
 * same on both, because it is the same throw.
 */
export interface RollGeometry {
  readonly cover: number;
  readonly gap: number;
  /** The pitch of one slot: a cover and the gap after it. */
  readonly slot: number;
  /** How tall the band is. */
  readonly band: number;
  /** How wide the paper fade over each end of the band is. */
  readonly fade: number;
  /** Idle drift: one lap in this long, linear, forever. */
  readonly idleLapMs: number;
}

/** 26a and 27c — the phone sheet, and the narrow web that is the same sheet. */
export const ROLL_PHONE_WHEEL: RollGeometry = {
  cover: 168,
  gap: 10,
  slot: 178,
  band: 140,
  fade: 97,
  idleLapMs: 22000,
};

/** 27a — the dialog on a desk. */
export const ROLL_WIDE_WHEEL: RollGeometry = {
  cover: 223,
  gap: 12,
  slot: 235,
  band: 186,
  fade: 200,
  idleLapMs: 26000,
};

/**
 * How many slots one lap of the wheel is.
 *
 * The spec asks for a lap to be the whole pool so it never visibly restarts, which is fine
 * at the deck's nine records and is a 480-element strip at a real shelf of 240. So a lap
 * is a *sample* of the pool instead, long enough that no repeat is on screen at once.
 *
 * Twelve is the deck's own number on the web, where a lap is quoted as 2820px at 235 a
 * slot. The wheel is decoration either way: the pick is drawn from the whole pool and then
 * placed into the lap, so what spins past is never what decides.
 */
export const ROLL_LAP_SLOTS = 12;

/**
 * How many laps are actually rendered, and which of them the pick is planted in.
 *
 * The throw needs runway. It accelerates for a lap and a half before the settle takes
 * over, so there has to be that much wheel to the right of the resting place and a little
 * more to its left, or the band shows bare paper at one end or the other.
 */
export const ROLL_STRIP_LAPS = 5;
export const ROLL_PICK_LAP = 3;

/** Throwing: the lap drops to 0.9s, which is the speed of the spin. */
export const ROLL_SPIN_LAP_MS = 900;
/**
 * How long the wheel takes to get up to speed before the settle takes over.
 *
 * The deck says 0.9s at a constant speed, which the whole throw in 2.4s. Both are faster
 * than this: at that pace the acceleration and the long tail are over before the eye has
 * followed them, and the throw reads as a flicker rather than as a wheel. 1.8s up and 2.4s
 * down puts it at 4.2s, which is long for a control and right for this one — it is the
 * only place in the app where waiting is the point.
 */
export const ROLL_MIN_SPIN_MS = 1800;
/** Settling: fast out, long tail, no bounce. */
export const ROLL_SETTLE_MS = 2400;
export const ROLL_SETTLE_EASING = [0.1, 0.85, 0.08, 1] as const;

/**
 * Throwing: up to speed rather than at it.
 *
 * The deck ran the spin at a constant 0.9s per lap and then cut to the settle, which reads
 * as a wheel being switched on and switched off. This accelerates instead — from the drift
 * it was already doing, to a peak, and the settle's long tail carries it down again. The
 * curve ends at twice its own average speed, which is the number the two distances below
 * are chosen against.
 */
export const ROLL_SPIN_EASING = [0.5, 0, 0.85, 0.7] as const;

/**
 * How far each half of the throw travels, in laps.
 *
 * These are not free. The spin curve ends at twice its own average speed and the settle
 * curve leaves the mark at 8.5x its own, so the two have to be chosen together or the
 * handover is a visible jolt:
 *
 *   spin peak    = 2   x (1.6 laps / 1.8s) = 1.78 laps/s
 *   settle start = 8.5 x (0.5 laps / 2.4s) = 1.77 laps/s
 *
 * Change one and the other has to move with it, and both against the two durations above.
 */
export const ROLL_SPIN_LAPS = 1.6;
export const ROLL_SETTLE_LAPS = 0.5;

export const ROLL_BLUR_PX = 1.6;
export const ROLL_BAND_SCALE = 1.06;

/**
 * The picked cover leaning forward as the wheel stops on it.
 *
 * Timed to finish exactly when the settle does, so the growing is the last thing that
 * happens on the wheel and the result crosses in on the far side of it. It is the only
 * moment in the throw where one cover is treated differently from the others, and it is
 * the moment that is about one cover.
 */
export const ROLL_PICK_SCALE = 1.12;
export const ROLL_PICK_GROW_MS = 600;
export const ROLL_PICK_GROW_DELAY_MS = ROLL_SETTLE_MS - ROLL_PICK_GROW_MS;

/**
 * How tall the band that clips the wheel is.
 *
 * Taller than the covers in it, by exactly the room the picked one needs to grow into.
 * The box has to clip — it is what makes the strip run off both ends of the frame — so a
 * cover that filled it edge to edge had its top and bottom sliced off the moment it leant
 * forward. The covers keep the deck's size; the box gains the headroom.
 */
export function rollBandHeight(wheel: RollGeometry): number {
  return Math.ceil(wheel.band * ROLL_PICK_SCALE);
}
/** The pool block folding away: opacity leaves first, the height follows it. */
export const ROLL_POOL_FADE_MS = 220;
export const ROLL_POOL_COLLAPSE_MS = 420;
/** With motion turned down the pick cross-fades in and nothing travels at all. */
export const ROLL_REDUCED_MS = 200;

/**
 * The Cross between the button that throws and the copy it threw.
 *
 * The app's rule for one block replacing another: the old leaves at `quick`, and only then
 * does the new arrive at `base`. Shared because three things have to agree on it — the two
 * opacities and the height of the box they take turns in — and because the wheel retracts
 * out of its hero on the same clock.
 *
 * `ROLL_SWAP_GAP` is the point in that span where the first ends and the second begins.
 */
export const ROLL_SWAP_MS = DURATION.quick + DURATION.base;
export const ROLL_SWAP_GAP = DURATION.quick / ROLL_SWAP_MS;

/**
 * The four states of the sheet. Nothing navigates between them; it is one sheet throughout.
 *
 * `SETTLING` is the 1.5s the transform is running, and it is a state of its own because the
 * result may not be written under a wheel that is still moving — the copy's name arrives
 * when it has stopped, not while it is passing.
 */
export type RollPhase = "IDLE" | "THROWING" | "SETTLING" | "SETTLED";

/**
 * A lap of the wheel, with the picked copy planted in it.
 *
 * The strip on screen is this lap twice over: the settle transform aims at the copy in the
 * *second* one, so there is always a lap of covers to the left of the resting place and
 * the strip never has to travel backwards to reach it.
 */
export interface RollStrip {
  readonly lap: readonly RollRow[];
  /** Where in the lap the picked copy sits. -1 while nothing is picked. */
  readonly pickSlot: number;
}

/** A source of randomness, so tests can hand this a sequence instead of a die. */
export type Random = () => number;

function sample(pool: readonly RollRow[], count: number, random: Random): RollRow[] {
  const lap: RollRow[] = [];
  if (pool.length === 0) return lap;
  // Drawn with replacement once the pool is smaller than a lap — the alternative is a
  // strip that is three covers wide, which does not read as a wheel.
  for (let slot = 0; slot < count; slot += 1) {
    lap.push(pool[Math.floor(random() * pool.length)] as RollRow);
  }
  return lap;
}

/** The wheel at rest, before anything has been thrown: a lap of the pool, nothing picked. */
export function idleStrip(pool: readonly RollRow[], random: Random): RollStrip {
  return { lap: sample(pool, ROLL_LAP_SLOTS, random), pickSlot: -1 };
}

export interface ThrowOptions {
  /** The copy already on screen, which a repeat throw should not hand back. */
  readonly avoid?: string;
  /**
   * The lap the wheel is already turning, kept rather than resampled.
   *
   * Without this a throw redrew every cover on the strip, and the click read as the wheel
   * being swapped for a different one at the very moment it was supposed to be picking up
   * speed. The pick still has to go somewhere in the lap, so the only slot that changes is
   * one nobody can see.
   */
  readonly lap?: readonly RollRow[];
  /** Which slots of that lap are on screen right now, and so may not be written into. */
  readonly visible?: readonly number[];
}

/**
 * Throw: pick a copy out of the whole pool, then plant it in the lap the wheel will stop on.
 *
 * The pick happens first and from the pool itself, not from what is on screen. Choosing a
 * slot and reading off whatever cover landed there would make the sample the draw, and a
 * copy the sampler happened not to include could never come up at all.
 */
export function throwStrip(
  pool: readonly RollRow[],
  random: Random,
  options: ThrowOptions = {},
): { readonly strip: RollStrip; readonly picked: RollRow } | null {
  if (pool.length === 0) return null;
  const { avoid, lap: turning, visible = [] } = options;
  // Rolling again should not land on the record you are looking at. With one copy in the
  // pool it has to, and saying so by re-picking it is better than refusing the throw.
  const candidates = avoid === undefined ? pool : pool.filter((row) => row.copy.id !== avoid);
  const from = candidates.length === 0 ? pool : candidates;
  const picked = from[Math.floor(random() * from.length)] as RollRow;

  const lap =
    turning !== undefined && turning.length === ROLL_LAP_SLOTS
      ? [...turning]
      : sample(pool, ROLL_LAP_SLOTS, random);

  // Never the first or last slot -- the resting place is the centre of the band, and a
  // pick at the seam would have half a lap of empty paper beside it -- and never one the
  // reader is looking at as they click.
  const taken = new Set(visible.map((slot) => wrapSlot(slot)));
  const free: number[] = [];
  for (let slot = 1; slot < ROLL_LAP_SLOTS - 1; slot += 1) if (!taken.has(slot)) free.push(slot);
  // If the band somehow shows the whole lap there is no hidden slot to use, and a visible
  // swap is better than no throw at all.
  const choices = free.length === 0 ? [1 + Math.floor(random() * (ROLL_LAP_SLOTS - 2))] : free;
  const pickSlot = choices[Math.floor(random() * choices.length)] as number;
  lap[pickSlot] = picked;
  return { strip: { lap, pickSlot }, picked };
}

function wrapSlot(slot: number): number {
  return ((slot % ROLL_LAP_SLOTS) + ROLL_LAP_SLOTS) % ROLL_LAP_SLOTS;
}

/**
 * Which slots of the lap the band is showing at a given offset.
 *
 * Slot indices within one lap, because the strip is that lap repeated: a slot that is on
 * screen is on screen in every copy of it, and writing into any of them would be seen.
 *
 * A slot of margin either side, deliberately. The two ends of the band are under a paper
 * fade rather than a hard edge, and a cover changing while it is half faded out is still a
 * cover changing. There is plenty of lap left over to choose from.
 */
export function visibleSlots(offset: number, bandWidth: number, wheel: RollGeometry): number[] {
  if (bandWidth <= 0) return [];
  const first = Math.floor(-offset / wheel.slot) - 1;
  const last = Math.ceil((-offset + bandWidth) / wheel.slot);
  const slots = new Set<number>();
  for (let index = first; index <= last; index += 1) slots.add(wrapSlot(index));
  return [...slots];
}

/**
 * Where the strip comes to rest, in pixels of translateX.
 *
 * The picked slot parks on the band's centreline, so the copy you were given is the one
 * under the middle of the frame rather than merely somewhere on screen. The target is in
 * the second lap, which is why the lap length is added to the slot.
 *
 * At the deck's 402px band and 168px cover this is 117 - index x 178, which is the number
 * the motion spec quotes.
 */
export function rollRestOffset(
  bandWidth: number,
  strip: RollStrip,
  wheel: RollGeometry = ROLL_PHONE_WHEEL,
): number {
  const centre = (bandWidth - wheel.cover) / 2;
  return centre - (strip.pickSlot + ROLL_PICK_LAP * strip.lap.length) * wheel.slot;
}

/** The two legs of one throw, in pixels of translateX. */
export interface RollThrowPlan {
  /** Where the strip starts. Whole laps from where it already is, so the jump is invisible. */
  readonly from: number;
  /** Where the spin ends and the settle picks it up, at the same speed. */
  readonly handover: number;
  /** Where it stops, with the picked copy on the centreline. */
  readonly rest: number;
}

/**
 * Plan a throw from wherever the wheel happens to be.
 *
 * The strip repeats every lap, so any two positions a whole lap apart are the same picture.
 * That is what makes this possible at all: the start is moved to whichever equivalent
 * position leaves the right amount of runway, and nothing on screen changes when it is.
 *
 * The handover is fixed at `ROLL_SETTLE_LAPS` from the resting place rather than left to
 * fall where it may, because it is the settle's *distance* that sets the settle's starting
 * speed. Letting it vary — anywhere from a twitch to a full lap — would make the same throw
 * hand over gently one time and slam the other.
 */
export function rollThrowPlan(current: number, rest: number, lapWidth: number): RollThrowPlan {
  const handover = rest + ROLL_SETTLE_LAPS * lapWidth;
  const wanted = handover + ROLL_SPIN_LAPS * lapWidth;
  // Rounded rather than floored, so the spin is as often a little shorter than the
  // nominal lap and a half as it is a little longer.
  const from = current + Math.round((wanted - current) / lapWidth) * lapWidth;
  return { from, handover, rest };
}

/** How far one lap travels — the distance the idle and spinning loops repeat over. */
export function rollLapWidth(strip: RollStrip, wheel: RollGeometry = ROLL_PHONE_WHEEL): number {
  return strip.lap.length * wheel.slot;
}
