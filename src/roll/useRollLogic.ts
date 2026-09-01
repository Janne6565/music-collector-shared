import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Format } from "../domain/types.js";
import { ANY_POOL, type RollPool, type RollRow, rollPoolOf } from "./rollPool.js";
import {
  ROLL_MIN_SPIN_MS,
  ROLL_SETTLE_MS,
  type RollPhase,
  type RollStrip,
  idleStrip,
  throwStrip,
} from "./rollWheel.js";

/**
 * Turn 26a's sheet, as a state machine — everything about a roll except how it is drawn.
 *
 * Shared because the two clients must agree on what a roll *is*: the same pool means the
 * same candidates, the same throw takes the same time, and a record that came up on the
 * phone could have come up in the browser. What is not shared is the wheel itself, which
 * is CSS in one place and `Animated` in the other.
 *
 * Nothing here is written down. The deck leaves open whether a roll is recorded at all,
 * and until that is answered the history is this session's and goes when the sheet does —
 * which is also why `passedOn` is a list and not a query.
 */

export interface RollLogicOptions {
  /** The whole shelf. The pool is taken from it here, not by a second query. */
  readonly rows: readonly RollRow[];
  /** Injected so a test can throw a known sequence. */
  readonly random?: () => number;
  /** With motion turned down the wheel does not spin, so the throw is only the cross-fade. */
  readonly reducedMotion?: boolean;
  /**
   * Which slots of the lap are on screen at this instant, asked at the moment of the throw.
   *
   * Only the client knows: the wheel's position is a running animation, not state. What it
   * buys is a throw that changes nothing anybody can see — see `ThrowOptions.lap`.
   */
  readonly visibleSlots?: () => readonly number[];
}

export interface RollLogic {
  readonly phase: RollPhase;
  readonly pool: RollPool;
  readonly poolRows: readonly RollRow[];
  /** How many the pool holds, and how many there are altogether — "38 of 240". */
  readonly poolCount: number;
  readonly totalCount: number;
  readonly strip: RollStrip;
  readonly picked: RollRow | null;
  /** Earlier picks this session, most recent first, the one on screen excluded. */
  readonly passedOn: readonly RollRow[];
  /** Which roll of this session is on screen. */
  readonly rollCount: number;
  /** Whether the pool block is open. It folds away for the throw and stays folded after. */
  readonly poolOpen: boolean;
  readonly canRoll: boolean;
  readonly roll: () => void;
  readonly setFormat: (format: Format | "ALL") => void;
  readonly setMinRating: (rating: number | null) => void;
  readonly editPool: () => void;
}

export function useRollLogic({
  rows,
  random = Math.random,
  reducedMotion = false,
  visibleSlots,
}: RollLogicOptions): RollLogic {
  const [pool, setPool] = useState<RollPool>(ANY_POOL);
  const [phase, setPhase] = useState<RollPhase>("IDLE");
  const [strip, setStrip] = useState<RollStrip>({ lap: [], pickSlot: -1 });
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [history, setHistory] = useState<readonly string[]>([]);
  const [poolOpen, setPoolOpen] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const poolRows = useMemo(() => rollPoolOf(rows, pool), [rows, pool]);

  // The wheel has to be turning before anything is thrown, so the first lap is drawn as
  // soon as there is a pool to draw it from — and again whenever the pool changes, because
  // a wheel still showing CDs after you asked for vinyl is telling you the wrong thing.
  const poolKey = `${pool.format}:${pool.minRating}:${poolRows.length}`;
  const randomRef = useRef(random);
  randomRef.current = random;
  const poolRef = useRef(poolRows);
  poolRef.current = poolRows;
  const visibleRef = useRef(visibleSlots);
  visibleRef.current = visibleSlots;
  // `poolRows` is a fresh array on every shelf re-read, so the lap is keyed on what the
  // pool *is* instead. Re-seeding it on each read would make the wheel jump under a reader
  // who is not touching it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the pool, see above.
  useEffect(() => {
    setStrip(idleStrip(poolRef.current, randomRef.current));
  }, [poolKey]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const roll = useCallback(() => {
    // Taps while the wheel is moving are ignored, both halves of the movement: a second
    // throw mid-settle would swap the answer out from under the transform that is
    // delivering it.
    if (phase === "THROWING" || phase === "SETTLING" || poolRows.length === 0) return;
    const thrown = throwStrip(poolRows, randomRef.current, {
      avoid: pickedId ?? undefined,
      lap: strip.lap,
      visible: visibleRef.current?.(),
    });
    if (thrown === null) return;

    // The previous pick joins the list of ones you passed on — at the moment it stops
    // being the answer, not when it was given.
    if (pickedId !== null) setHistory((past) => [pickedId, ...past]);
    setStrip(thrown.strip);
    setPickedId(thrown.picked.copy.id);
    setPoolOpen(false);

    clearTimeout(timer.current);
    if (reducedMotion) {
      setPhase("SETTLED");
      return;
    }
    setPhase("THROWING");
    timer.current = setTimeout(() => {
      setPhase("SETTLING");
      timer.current = setTimeout(() => setPhase("SETTLED"), ROLL_SETTLE_MS);
    }, ROLL_MIN_SPIN_MS);
  }, [phase, poolRows, pickedId, reducedMotion, strip.lap]);

  const repool = useCallback((next: (current: RollPool) => RollPool) => {
    // Changing the pool retires the pick rather than keeping it: a record that is no
    // longer in the pool is not an answer to the question the sheet is now asking. The
    // history stays — those are still records you were shown and passed on.
    clearTimeout(timer.current);
    setPool(next);
    setPhase("IDLE");
    setPickedId(null);
    setPoolOpen(true);
  }, []);

  const byId = useMemo(() => new Map(rows.map((row) => [row.copy.id, row])), [rows]);
  const picked = pickedId === null ? null : (byId.get(pickedId) ?? null);
  const passedOn = useMemo(
    () => history.flatMap((id) => (byId.has(id) ? [byId.get(id) as RollRow] : [])),
    [history, byId],
  );

  return {
    phase,
    pool,
    poolRows,
    poolCount: poolRows.length,
    totalCount: rows.length,
    strip,
    picked,
    passedOn,
    rollCount: history.length + (pickedId === null ? 0 : 1),
    poolOpen,
    canRoll: (phase === "IDLE" || phase === "SETTLED") && poolRows.length > 0,
    roll,
    setFormat: useCallback(
      (format: Format | "ALL") => repool((current) => ({ ...current, format })),
      [repool],
    ),
    setMinRating: useCallback(
      (minRating: number | null) => repool((current) => ({ ...current, minRating })),
      [repool],
    ),
    editPool: useCallback(() => setPoolOpen(true), []),
  };
}

/** How long a whole throw takes, tap to named copy — about 2.4 seconds. */
export const ROLL_TOTAL_MS = ROLL_MIN_SPIN_MS + ROLL_SETTLE_MS;
