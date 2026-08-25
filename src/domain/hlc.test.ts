import { describe, expect, it } from "vitest";
import {
  MAX_CLOCK_DRIFT_MS,
  hlcCompare,
  hlcDecode,
  hlcEncode,
  hlcInitial,
  hlcReceive,
  hlcTick,
} from "./hlc.js";

describe("hlcTick", () => {
  it("follows wall time forward and resets the counter", () => {
    const first = hlcTick(hlcInitial("a"), 1000);
    const second = hlcTick(first, 2000);

    expect(second).toEqual({ wall: 2000, counter: 0, node: "a" });
  });

  it("advances the counter when two events land in the same millisecond", () => {
    const first = hlcTick(hlcInitial("a"), 1000);
    const second = hlcTick(first, 1000);
    const third = hlcTick(second, 1000);

    expect([first.counter, second.counter, third.counter]).toEqual([0, 1, 2]);
    expect(hlcCompare(second, third)).toBeLessThan(0);
  });

  it("does not go backwards when the local clock does", () => {
    const first = hlcTick(hlcInitial("a"), 5000);
    const afterClockJumpedBack = hlcTick(first, 1000);

    expect(afterClockJumpedBack.wall).toBe(5000);
    expect(hlcCompare(first, afterClockJumpedBack)).toBeLessThan(0);
  });
});

describe("hlcReceive", () => {
  it("adopts a remote stamp that is ahead of us", () => {
    const local = hlcTick(hlcInitial("a"), 1000);
    const remote = { wall: 3000, counter: 0, node: "b" };

    const merged = hlcReceive(local, remote, 1000);

    expect(merged.wall).toBe(3000);
    expect(merged.node).toBe("a");
    expect(hlcCompare(remote, merged)).toBeLessThan(0);
  });

  it("keeps our own time when the remote is behind", () => {
    const local = hlcTick(hlcInitial("a"), 5000);

    const merged = hlcReceive(local, { wall: 1000, counter: 9, node: "b" }, 5000);

    expect(merged.wall).toBe(5000);
    expect(merged.counter).toBe(1);
  });

  it("refuses a remote clock that is implausibly far ahead", () => {
    // Without this guard one device with a broken clock drags every other device's
    // stamps forward with it, permanently.
    const local = hlcTick(hlcInitial("a"), 1000);
    const wildlyAhead = { wall: 1000 + MAX_CLOCK_DRIFT_MS * 10, counter: 0, node: "b" };

    const merged = hlcReceive(local, wildlyAhead, 1000);

    expect(merged.wall).toBe(1000);
  });

  it("breaks a same-millisecond tie by advancing past both", () => {
    const local = { wall: 1000, counter: 3, node: "a" };
    const remote = { wall: 1000, counter: 7, node: "b" };

    const merged = hlcReceive(local, remote, 1000);

    expect(merged).toEqual({ wall: 1000, counter: 8, node: "a" });
  });
});

describe("hlcCompare", () => {
  it("orders by wall time, then counter, then node", () => {
    const stamps = [
      { wall: 2000, counter: 0, node: "a" },
      { wall: 1000, counter: 1, node: "b" },
      { wall: 1000, counter: 1, node: "a" },
      { wall: 1000, counter: 0, node: "z" },
    ];

    expect([...stamps].sort(hlcCompare)).toEqual([
      { wall: 1000, counter: 0, node: "z" },
      { wall: 1000, counter: 1, node: "a" },
      { wall: 1000, counter: 1, node: "b" },
      { wall: 2000, counter: 0, node: "a" },
    ]);
  });

  it("never calls two different devices equal", () => {
    // A tie would make merges non-deterministic: two devices would each keep their own.
    expect(
      hlcCompare({ wall: 1, counter: 1, node: "a" }, { wall: 1, counter: 1, node: "b" }),
    ).not.toBe(0);
  });
});

describe("encoding", () => {
  it("round-trips", () => {
    const clock = { wall: 1_724_500_000_000, counter: 42, node: "device-1" };

    expect(hlcDecode(hlcEncode(clock))).toEqual(clock);
  });

  it("sorts lexicographically in the same order as hlcCompare", () => {
    // This is what lets IndexedDB and SQL index the encoded form directly.
    const stamps = [
      { wall: 999, counter: 0, node: "a" },
      { wall: 1000, counter: 0, node: "a" },
      { wall: 1000, counter: 16, node: "a" },
      { wall: 1000, counter: 16, node: "b" },
      { wall: 10_000, counter: 0, node: "a" },
    ];

    const byCompare = [...stamps].sort(hlcCompare).map(hlcEncode);
    const byString = [...stamps].map(hlcEncode).sort();

    expect(byString).toEqual(byCompare);
  });

  it("rejects malformed input rather than producing NaN", () => {
    expect(() => hlcDecode("nonsense")).toThrow();
  });
});
