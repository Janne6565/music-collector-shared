import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Copy, Release } from "../domain/types.js";
import type { RollRow } from "./rollPool.js";
import { ROLL_MIN_SPIN_MS, ROLL_SETTLE_MS } from "./rollWheel.js";
import { useRollLogic } from "./useRollLogic.js";

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
  row("e", "VINYL", 4),
];

/** A die that hands back a fixed sequence, so a throw can be asserted rather than sampled. */
function dice(values: readonly number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length] as number;
}

function setup(rows: readonly RollRow[] = SHELF, random = dice([0.4])) {
  return renderHook(() => useRollLogic({ rows, random }));
}

describe("useRollLogic", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("opens on the whole shelf, turning, with nothing picked", () => {
    const { result } = setup();
    expect(result.current.phase).toBe("IDLE");
    expect(result.current.poolCount).toBe(5);
    expect(result.current.totalCount).toBe(5);
    expect(result.current.picked).toBeNull();
    expect(result.current.poolOpen).toBe(true);
    // The wheel has covers on it before anything is thrown.
    expect(result.current.strip.lap.length).toBeGreaterThan(0);
  });

  it("spins for the minimum, then settles, and only then is there an answer", () => {
    const { result } = setup();
    act(() => result.current.roll());
    expect(result.current.phase).toBe("THROWING");
    // The pool folds away the instant the throw starts, not when it lands.
    expect(result.current.poolOpen).toBe(false);

    act(() => vi.advanceTimersByTime(ROLL_MIN_SPIN_MS));
    expect(result.current.phase).toBe("SETTLING");

    act(() => vi.advanceTimersByTime(ROLL_SETTLE_MS));
    expect(result.current.phase).toBe("SETTLED");
    expect(result.current.picked).not.toBeNull();
    expect(result.current.rollCount).toBe(1);
  });

  it("ignores a second throw while one is in the air", () => {
    const { result } = setup();
    act(() => result.current.roll());
    const first = result.current.strip;
    act(() => result.current.roll());
    expect(result.current.strip).toBe(first);
    act(() => vi.advanceTimersByTime(ROLL_MIN_SPIN_MS));
    act(() => result.current.roll());
    expect(result.current.phase).toBe("SETTLING");
  });

  it("moves the copy you were shown into the ones you passed on", () => {
    const { result } = setup(SHELF, Math.random);
    const land = () =>
      act(() => {
        result.current.roll();
        vi.advanceTimersByTime(ROLL_MIN_SPIN_MS + ROLL_SETTLE_MS);
      });

    land();
    const first = result.current.picked?.copy.id;
    expect(result.current.passedOn).toHaveLength(0);

    land();
    expect(result.current.passedOn.map((entry) => entry.copy.id)).toEqual([first]);
    // ...and never hands back the one still on screen.
    expect(result.current.picked?.copy.id).not.toBe(first);
    expect(result.current.rollCount).toBe(2);
  });

  it("retires the pick when the pool changes, and keeps what you passed on", () => {
    const { result } = setup(SHELF, Math.random);
    const land = () =>
      act(() => {
        result.current.roll();
        vi.advanceTimersByTime(ROLL_MIN_SPIN_MS + ROLL_SETTLE_MS);
      });
    land();
    land();
    expect(result.current.passedOn).toHaveLength(1);

    act(() => result.current.setFormat("VINYL"));
    // A record that is no longer in the pool is not an answer to the question now asked.
    expect(result.current.phase).toBe("IDLE");
    expect(result.current.picked).toBeNull();
    expect(result.current.poolOpen).toBe(true);
    expect(result.current.poolCount).toBe(3);
    // Those are still records you were shown and turned down.
    expect(result.current.passedOn).toHaveLength(1);
  });

  it("narrows on both axes at once", () => {
    const { result } = setup();
    act(() => result.current.setFormat("VINYL"));
    act(() => result.current.setMinRating(4));
    expect(result.current.poolCount).toBe(2);
    expect(result.current.canRoll).toBe(true);
  });

  it("refuses to throw from an empty pool", () => {
    const { result } = setup();
    act(() => result.current.setMinRating(5));
    act(() => result.current.setFormat("CASSETTE"));
    expect(result.current.poolCount).toBe(0);
    expect(result.current.canRoll).toBe(false);
    act(() => result.current.roll());
    expect(result.current.phase).toBe("IDLE");
    expect(result.current.picked).toBeNull();
  });

  it("hands the answer over at once when motion is turned down", () => {
    const { result } = renderHook(() =>
      useRollLogic({ rows: SHELF, random: dice([0.4]), reducedMotion: true }),
    );
    act(() => result.current.roll());
    // No spin and no settle: the pick cross-fades in, which is the client's whole job here.
    expect(result.current.phase).toBe("SETTLED");
    expect(result.current.picked).not.toBeNull();
  });

  it("reopens the pool without throwing the answer away", () => {
    const { result } = setup();
    act(() => {
      result.current.roll();
      vi.advanceTimersByTime(ROLL_MIN_SPIN_MS + ROLL_SETTLE_MS);
    });
    const picked = result.current.picked;
    act(() => result.current.editPool());
    expect(result.current.poolOpen).toBe(true);
    expect(result.current.picked).toBe(picked);
    expect(result.current.phase).toBe("SETTLED");
  });
});
