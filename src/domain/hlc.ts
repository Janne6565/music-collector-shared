/**
 * Hybrid logical clocks.
 *
 * Sync merges per field, last-write-wins. With plain wall-clock timestamps a device whose
 * clock runs fast wins every conflict forever, and nothing in the data would ever reveal
 * why — the losing edits simply vanish. An HLC keeps wall time (so ordering still matches
 * human intuition and stays comparable across devices) but adds a counter that advances
 * whenever wall time doesn't, and takes the maximum of local and remote on every receive.
 * A skewed device can then win at most until real time catches up, rather than permanently.
 *
 * The node id breaks ties so two devices can never produce equal-but-different stamps.
 */
export interface Hlc {
  /** Milliseconds since the epoch. */
  readonly wall: number;
  /** Advances when two stamps land in the same millisecond. */
  readonly counter: number;
  /** Stable per-device id. */
  readonly node: string;
}

/** Counter width before it would overflow the encoded form. */
const MAX_COUNTER = 0xffff;

/**
 * How far ahead of local wall time a remote stamp may be before we refuse it. A remote
 * clock that is days fast would otherwise drag every subsequent local stamp forward with
 * it, and the drift would never unwind.
 */
export const MAX_CLOCK_DRIFT_MS = 60_000;

export function hlcInitial(node: string): Hlc {
  return { wall: 0, counter: 0, node };
}

/** Stamp a local event. */
export function hlcTick(previous: Hlc, now: number): Hlc {
  if (now > previous.wall) {
    return { wall: now, counter: 0, node: previous.node };
  }
  return { wall: previous.wall, counter: nextCounter(previous.counter), node: previous.node };
}

/** Fold a stamp received from another device into the local clock. */
export function hlcReceive(local: Hlc, remote: Hlc, now: number): Hlc {
  if (remote.wall - now > MAX_CLOCK_DRIFT_MS) {
    // Treat an implausible remote stamp as a local event: the remote edit still merges on
    // its own stamp, but our clock refuses to follow it forward.
    return hlcTick(local, now);
  }
  const wall = Math.max(now, local.wall, remote.wall);
  if (wall === local.wall && wall === remote.wall) {
    return {
      wall,
      counter: nextCounter(Math.max(local.counter, remote.counter)),
      node: local.node,
    };
  }
  if (wall === local.wall) {
    return { wall, counter: nextCounter(local.counter), node: local.node };
  }
  if (wall === remote.wall) {
    return { wall, counter: nextCounter(remote.counter), node: local.node };
  }
  return { wall, counter: 0, node: local.node };
}

function nextCounter(counter: number): number {
  if (counter >= MAX_COUNTER) {
    throw new Error("HLC counter overflow — more than 65535 events in a single millisecond");
  }
  return counter + 1;
}

/** Negative when `a` happened before `b`. Total order: never returns 0 for distinct nodes. */
export function hlcCompare(a: Hlc, b: Hlc): number {
  if (a.wall !== b.wall) return a.wall - b.wall;
  if (a.counter !== b.counter) return a.counter - b.counter;
  return a.node < b.node ? -1 : a.node > b.node ? 1 : 0;
}

/**
 * Fixed-width so the encoded form sorts lexicographically in the same order as
 * `hlcCompare` — which lets IndexedDB and SQL index it directly.
 */
export function hlcEncode(clock: Hlc): string {
  return `${clock.wall.toString().padStart(15, "0")}:${clock.counter.toString(16).padStart(4, "0")}:${clock.node}`;
}

export function hlcDecode(encoded: string): Hlc {
  const [wall, counter, ...node] = encoded.split(":");
  if (wall === undefined || counter === undefined || node.length === 0) {
    throw new Error(`Malformed HLC: ${encoded}`);
  }
  return {
    wall: Number.parseInt(wall, 10),
    counter: Number.parseInt(counter, 16),
    node: node.join(":"),
  };
}
