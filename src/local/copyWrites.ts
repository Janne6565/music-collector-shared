import { type Hlc, hlcEncode } from "../domain/hlc.js";
import type { Copy, CopyMergeableField, Release } from "../domain/types.js";
import { COPY_MERGEABLE_FIELDS } from "../domain/types.js";

export interface CopyDraft {
  readonly condition: Copy["condition"];
  readonly sleeveCondition: Copy["sleeveCondition"];
  readonly preferCatalogArt: Copy["preferCatalogArt"];
  readonly pricePaidCents: Copy["pricePaidCents"];
  readonly currency: string;
  readonly purchasedOn: Copy["purchasedOn"];
  readonly purchasedAt: Copy["purchasedAt"];
  readonly notes: Copy["notes"];
  readonly rating: Copy["rating"];
}

export interface ClockSource {
  /** Advances the device clock and returns the new stamp. */
  next(): Hlc;
}

/**
 * Creates a copy with every mergeable field stamped.
 *
 * Stamping all of them at creation — rather than leaving them unstamped until first edit —
 * means a merge never has to special-case "this field has no clock", which would otherwise
 * be indistinguishable from "this field is older than everything".
 */
export function createCopy(
  release: Release,
  draft: CopyDraft,
  clock: ClockSource,
  now: number,
  id: string,
): Copy {
  const stamp = hlcEncode(clock.next());
  const fieldClocks = Object.fromEntries(
    COPY_MERGEABLE_FIELDS.map((field) => [field, stamp]),
  ) as Copy["fieldClocks"];

  return {
    id,
    releaseId: release.id,
    condition: draft.condition,
    sleeveCondition: draft.sleeveCondition,
    preferCatalogArt: draft.preferCatalogArt,
    pricePaidCents: draft.pricePaidCents,
    currency: draft.currency,
    purchasedOn: draft.purchasedOn,
    purchasedAt: draft.purchasedAt,
    notes: draft.notes,
    notesConflict: null,
    rating: draft.rating,
    createdAt: now,
    deletedAt: null,
    fieldClocks,
  };
}

/**
 * Applies a patch, restamping only the fields whose value actually changed.
 *
 * This is the whole point of field-level merge: editing the condition on one device and
 * the price on another leaves each field carrying its own clock, so both edits survive.
 * Restamping untouched fields would destroy that — a no-op save on one device would start
 * winning conflicts against real edits made elsewhere.
 */
export function applyCopyPatch(copy: Copy, patch: Partial<CopyDraft>, clock: ClockSource): Copy {
  const changed = (Object.keys(patch) as (keyof CopyDraft)[]).filter(
    (key) => patch[key] !== undefined && patch[key] !== copy[key],
  );
  if (changed.length === 0) {
    return copy;
  }

  const stamp = hlcEncode(clock.next());
  const fieldClocks = { ...copy.fieldClocks };
  const updated: Record<string, unknown> = { ...copy };
  if (changed.includes("notes")) {
    // Writing the notes is how a person resolves a conflict: they have seen both versions
    // and chosen what the text should say, so the other one stops being pending.
    updated.notesConflict = null;
  }
  for (const key of changed) {
    fieldClocks[key as CopyMergeableField] = stamp;
    // Assigned key by key rather than by spreading `patch`: a patch carrying an explicit
    // `undefined` for an untouched field would otherwise overwrite the real value with it.
    updated[key] = patch[key];
  }

  return { ...updated, fieldClocks } as Copy;
}

/** Tombstones a copy. The delete is itself a stamped field, so it can lose a merge. */
export function tombstoneCopy(copy: Copy, clock: ClockSource, now: number): Copy {
  return {
    ...copy,
    deletedAt: now,
    fieldClocks: { ...copy.fieldClocks, deletedAt: hlcEncode(clock.next()) },
  };
}
