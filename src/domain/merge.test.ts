import { describe, expect, it } from "vitest";
import fixture from "./merge-fixture.json";
import { mergeCollections, mergeCopies } from "./merge.js";
import type { Copy } from "./types.js";

interface FixtureCase {
  readonly name: string;
  readonly local: Copy | null;
  readonly remote: Copy | null;
  readonly expected: Copy;
}

const cases = fixture.cases as unknown as FixtureCase[];

describe("merge contract (shared with the Java backend)", () => {
  it.each(cases.map((c) => [c.name, c] as const))("%s", (_name, testCase) => {
    const local = testCase.local ?? undefined;
    const remote = testCase.remote ?? undefined;

    expect(mergeCopies(local, remote)).toEqual(testCase.expected);
  });

  it.each(cases.map((c) => [c.name, c] as const))("is commutative: %s", (_name, testCase) => {
    // Two peers merging the same pair from opposite directions must agree, or the
    // collection never converges.
    const local = testCase.local ?? undefined;
    const remote = testCase.remote ?? undefined;

    expect(mergeCopies(remote, local)).toEqual(testCase.expected);
  });

  it.each(cases.map((c) => [c.name, c] as const))("is idempotent: %s", (_name, testCase) => {
    // Syncing twice with no intervening edit must not change anything — most importantly
    // it must not re-trigger a notes conflict that was already resolved.
    const local = testCase.local ?? undefined;
    const remote = testCase.remote ?? undefined;
    const once = mergeCopies(local, remote);

    expect(mergeCopies(once, remote)).toEqual(once);
    expect(mergeCopies(once, local)).toEqual(once);
    expect(mergeCopies(once, once)).toEqual(once);
  });
});

describe("mergeCopies", () => {
  const base = cases[1] as FixtureCase;

  it("refuses to merge two different copies", () => {
    const other = { ...(base.local as Copy), id: "different" };

    expect(() => mergeCopies(base.local as Copy, other)).toThrow(/different copies/);
  });

  it("refuses to merge nothing", () => {
    expect(() => mergeCopies(undefined, undefined)).toThrow();
  });

  it("never corrupts the notes value itself, however many times it is merged", () => {
    // The losing text lives in its own field precisely so repeated syncs cannot keep
    // appending it to the value the person reads.
    const conflict = cases.find((c) => c.name.startsWith("notes edited on both")) as FixtureCase;

    const once = mergeCopies(conflict.local as Copy, conflict.remote as Copy);
    const twice = mergeCopies(once, conflict.remote as Copy);
    const thrice = mergeCopies(twice, conflict.local as Copy);

    expect(thrice.notes).toBe("Plays clean after a wash.");
    expect(thrice.notesConflict).toBe("Sleeve is sharp, no seam splits.");
  });

  it("lets a later edit win outright", () => {
    const conflict = cases.find((c) => c.name.startsWith("notes edited on both")) as FixtureCase;
    const merged = mergeCopies(conflict.local as Copy, conflict.remote as Copy);

    // A person reads both versions and writes the one they want to keep.
    const resolved: Copy = {
      ...merged,
      notes: "Sleeve is sharp. Plays clean after a wash.",
      notesConflict: null,
      fieldClocks: { ...merged.fieldClocks, notes: "000000000099000:0000:a" },
    };

    expect(mergeCopies(resolved, merged).notes).toBe("Sleeve is sharp. Plays clean after a wash.");
  });

  it("keeps the conflict across a push-and-pull round trip", () => {
    // The client merges, pushes, pulls the same record back and merges again. If the
    // marker did not survive that, it would vanish before anyone saw it.
    const conflict = cases.find((c) => c.name.startsWith("notes edited on both")) as FixtureCase;
    const merged = mergeCopies(conflict.local as Copy, conflict.remote as Copy);

    expect(mergeCopies(merged, merged).notesConflict).toBe("Sleeve is sharp, no seam splits.");
  });

  it("drops the conflict when the winning notes are cleared", () => {
    const conflict = cases.find((c) => c.name.startsWith("notes edited on both")) as FixtureCase;
    const cleared: Copy = {
      ...(conflict.remote as Copy),
      notes: null,
      fieldClocks: { ...(conflict.remote as Copy).fieldClocks, notes: "000000000099000:0000:b" },
    };

    // Nothing to reconcile against once there are no notes to show.
    expect(mergeCopies(conflict.local as Copy, cleared).notesConflict).toBeNull();
  });
});

describe("mergeCollections", () => {
  it("keeps copies that exist on only one side and merges the ones that overlap", () => {
    const shared = cases[1] as FixtureCase;
    const onlyLocal = { ...(shared.local as Copy), id: "local-only" };
    const onlyRemote = { ...(shared.remote as Copy), id: "remote-only" };

    const merged = mergeCollections(
      [shared.local as Copy, onlyLocal],
      [shared.remote as Copy, onlyRemote],
    );

    expect(merged.map((copy) => copy.id).sort()).toEqual(["c1", "local-only", "remote-only"]);
    expect(merged.find((copy) => copy.id === "c1")).toEqual(shared.expected);
  });

  it("is empty for two empty collections", () => {
    expect(mergeCollections([], [])).toEqual([]);
  });
});
