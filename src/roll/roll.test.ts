import { describe, expect, it } from "vitest";
import type { Copy, Release } from "../domain/types.js";
import { ANY_POOL, type RollRow, inRollPool, rollPoolOf } from "./rollPool.js";
import {
  ROLL_LAP_SLOTS,
  ROLL_PHONE_WHEEL,
  ROLL_PICK_LAP,
  ROLL_SETTLE_LAPS,
  ROLL_SPIN_LAPS,
  ROLL_STRIP_LAPS,
  ROLL_WIDE_WHEEL,
  idleStrip,
  rollLapWidth,
  rollRestOffset,
  rollThrowPlan,
  throwStrip,
  visibleSlots,
} from "./rollWheel.js";

function row(id: string, format: Copy["manualFormat"], rating: number | null): RollRow {
  return {
    copy: { id, manualFormat: format, rating } as Copy,
    release: undefined as Release | undefined,
  };
}

const SHELF: readonly RollRow[] = [
  row("a", "VINYL", 5),
  row("b", "VINYL", 3),
  row("c", "CD", 5),
  row("d", "CASSETTE", null),
  row("e", "VINYL", null),
];

/** A die that hands back a fixed sequence, so a throw can be asserted rather than sampled. */
function dice(values: readonly number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length] as number;
}

describe("rollPool", () => {
  it("takes the whole shelf when nothing is asked of it", () => {
    expect(rollPoolOf(SHELF, ANY_POOL)).toHaveLength(5);
  });

  it("filters by the copy's own format, not the catalogue's", () => {
    const pool = rollPoolOf(SHELF, { format: "VINYL", minRating: null });
    expect(pool.map((entry) => entry.copy.id)).toEqual(["a", "b", "e"]);
  });

  it("leaves unrated copies out of a pool asked for by rating", () => {
    // The one that matters: null is "no opinion", and treating it as nought would put
    // every record you have never rated into "four and up".
    expect(inRollPool(row("x", "VINYL", null), { format: "ALL", minRating: 4 })).toBe(false);
    expect(inRollPool(row("x", "VINYL", 4), { format: "ALL", minRating: 4 })).toBe(true);
    expect(inRollPool(row("x", "VINYL", 3), { format: "ALL", minRating: 4 })).toBe(false);
  });

  it("combines both axes", () => {
    const pool = rollPoolOf(SHELF, { format: "VINYL", minRating: 4 });
    expect(pool.map((entry) => entry.copy.id)).toEqual(["a"]);
  });
});

describe("rollWheel", () => {
  it("draws a full lap even from a pool smaller than one", () => {
    const strip = idleStrip(SHELF.slice(0, 2), dice([0]));
    expect(strip.lap).toHaveLength(ROLL_LAP_SLOTS);
    expect(strip.pickSlot).toBe(-1);
  });

  it("has nothing to spin when the pool is empty", () => {
    expect(idleStrip([], Math.random).lap).toEqual([]);
    expect(throwStrip([], Math.random)).toBeNull();
  });

  it("keeps the lap that is already turning, and writes only into a hidden slot", () => {
    const turning = idleStrip(SHELF, dice([0.1, 0.9, 0.3, 0.7])).lap;
    // The band is showing slots 4, 5 and 6 as the reader clicks.
    const thrown = throwStrip(SHELF, Math.random, { lap: turning, visible: [4, 5, 6] });
    const { strip, picked } = thrown as NonNullable<typeof thrown>;
    expect([4, 5, 6]).not.toContain(strip.pickSlot);
    expect(strip.lap[strip.pickSlot]).toBe(picked);
    // Every other slot is exactly what it was, so nothing on screen changes at the click.
    strip.lap.forEach((row, slot) => {
      if (slot !== strip.pickSlot) expect(row).toBe(turning[slot]);
    });
  });

  it("says which slots the band is showing, within one lap", () => {
    const at = (offset: number) =>
      visibleSlots(offset, 402, ROLL_PHONE_WHEEL).sort((a, b) => a - b);
    // A band two and a bit covers wide, parked at the top of the lap — plus a slot of
    // margin at each end, which wraps round to the far end of the lap.
    expect(at(0)).toEqual([0, 1, 2, 3, 11]);
    // One lap further along is the same slots, because the strip repeats.
    expect(at(-ROLL_LAP_SLOTS * ROLL_PHONE_WHEEL.slot)).toEqual([0, 1, 2, 3, 11]);
    // ...and it wraps rather than running off the end.
    expect(at(-11 * ROLL_PHONE_WHEEL.slot)).toEqual([0, 1, 2, 10, 11]);
    // Whatever it shows, there is always somewhere hidden to plant the pick.
    expect(at(0).length).toBeLessThan(ROLL_LAP_SLOTS - 2);
  });

  it("plants the pick in the lap, away from both seams", () => {
    const thrown = throwStrip(SHELF, dice([0.5]));
    expect(thrown).not.toBeNull();
    const { strip, picked } = thrown as NonNullable<typeof thrown>;
    expect(strip.pickSlot).toBeGreaterThan(0);
    expect(strip.pickSlot).toBeLessThan(ROLL_LAP_SLOTS - 1);
    expect(strip.lap[strip.pickSlot]).toBe(picked);
  });

  it("picks from the pool rather than from what the sampler happened to show", () => {
    // Every draw returns the last entry, which a two-slot sample would never contain.
    const thrown = throwStrip(SHELF, dice([0.999]));
    expect(thrown?.picked.copy.id).toBe("e");
  });

  it("does not hand back the copy already on screen", () => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const thrown = throwStrip(SHELF, Math.random, { avoid: "a" });
      expect(thrown?.picked.copy.id).not.toBe("a");
    }
  });

  it("re-picks the only copy in the pool rather than refusing the throw", () => {
    const only = SHELF.slice(0, 1);
    expect(throwStrip(only, Math.random, { avoid: "a" })?.picked.copy.id).toBe("a");
  });

  it("parks the picked slot on the band's centreline, a lap of runway behind it", () => {
    // The deck's own numbers for the phone: a 402px band, a 168px cover, 117 - index x 178.
    // The index is the slot plus the laps of wheel the throw needs to get up to speed over.
    expect(rollRestOffset(402, { lap: new Array(9).fill(SHELF[0]), pickSlot: 0 })).toBe(
      117 - ROLL_PICK_LAP * 9 * 178,
    );
    expect(rollRestOffset(402, { lap: SHELF, pickSlot: 2 })).toBe(
      117 - (2 + ROLL_PICK_LAP * 5) * 178,
    );
  });

  it("measures the dialog's wheel by its own geometry, not a scale of the phone's", () => {
    const strip = { lap: new Array(ROLL_LAP_SLOTS).fill(SHELF[0]), pickSlot: 3 };
    // 27a quotes a 2820px lap at 235 a slot.
    expect(rollLapWidth(strip, ROLL_WIDE_WHEEL)).toBe(2820);
    expect(rollLapWidth(strip, ROLL_PHONE_WHEEL)).toBe(ROLL_LAP_SLOTS * 178);
    expect(rollRestOffset(720, strip, ROLL_WIDE_WHEEL)).toBe(
      (720 - 223) / 2 - (3 + ROLL_PICK_LAP * ROLL_LAP_SLOTS) * 235,
    );
  });

  it("hands the settle a fixed distance however far the spin happened to travel", () => {
    const lap = rollLapWidth({ lap: new Array(ROLL_LAP_SLOTS).fill(SHELF[0]), pickSlot: 0 });
    for (const current of [-10, -1000, -1234.5, -9000, 0]) {
      for (const rest of [-6469, -8071, -7000.5]) {
        const plan = rollThrowPlan(current, rest, lap);
        // The settle is always the same length, which is what keeps its opening speed —
        // and so the handover — the same on every throw.
        expect(plan.handover - plan.rest).toBeCloseTo(ROLL_SETTLE_LAPS * lap, 6);
        // The spin runs leftwards, within half a lap either side of its nominal length.
        const spin = plan.from - plan.handover;
        expect(spin).toBeGreaterThan((ROLL_SPIN_LAPS - 0.51) * lap);
        expect(spin).toBeLessThan((ROLL_SPIN_LAPS + 0.51) * lap);
        // ...and the jump to the starting place is invisible, because it is whole laps.
        expect(Math.abs((plan.from - current) % lap)).toBeLessThan(1e-9);
      }
    }
  });

  it("keeps the whole throw inside the wheel it renders", () => {
    // The band is the widest thing the strip has to cover at either end: the start must
    // not run off the right of the strip, and the resting place not off its left.
    for (const [wheel, band] of [
      [ROLL_PHONE_WHEEL, 440],
      [ROLL_WIDE_WHEEL, 720],
    ] as const) {
      const lap = ROLL_LAP_SLOTS * wheel.slot;
      const width = ROLL_STRIP_LAPS * lap;
      for (let pickSlot = 1; pickSlot <= ROLL_LAP_SLOTS - 2; pickSlot += 1) {
        const strip = { lap: new Array(ROLL_LAP_SLOTS).fill(SHELF[0]), pickSlot };
        const rest = rollRestOffset(band, strip, wheel);
        const plan = rollThrowPlan(0, rest, lap);
        expect(plan.from).toBeLessThanOrEqual(0);
        expect(-rest + band).toBeLessThanOrEqual(width);
      }
    }
  });
});
