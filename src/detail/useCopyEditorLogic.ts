import { useCallback, useState } from "react";
import { isManualCopy } from "../domain/manualRelease.js";
import { parseIsoDate, parseMoneyToCents } from "../domain/money.js";
import type { Condition, Copy, Format, ManualRelease } from "../domain/types.js";
import type { CopyPatch } from "../local/copyWrites.js";

export interface EditorFields {
  condition: Condition | "";
  sleeveCondition: Condition | "";
  price: string;
  purchasedOn: string;
  purchasedAt: string;
  rating: number | null;
  notes: string;
  /**
   * The pressing's own facts, editable only on a copy that was typed in by hand.
   *
   * Held as strings like every other field here, including the year: a half-typed "19" is
   * a legitimate intermediate state of a field somebody is filling in, and parsing on each
   * keystroke would either reject it or silently store 19.
   *
   * `format` is the exception: every copy has one and every copy may change it, so on a
   * matched copy this starts at the catalogue's answer rather than blank.
   */
  title: string;
  artist: string;
  year: string;
  label: string;
  catalogNumber: string;
  format: Format | "";
}

function fieldsOf(copy: Copy, catalogFormat: Format | undefined): EditorFields {
  return {
    condition: copy.condition ?? "",
    sleeveCondition: copy.sleeveCondition ?? "",
    price: copy.pricePaidCents === null ? "" : (copy.pricePaidCents / 100).toFixed(2),
    purchasedOn: copy.purchasedOn ?? "",
    purchasedAt: copy.purchasedAt ?? "",
    rating: copy.rating,
    notes: copy.notes ?? "",
    title: copy.manualTitle ?? "",
    artist: copy.manualArtist ?? "",
    // Nullish rather than a null check: a copy stored before this field existed has no
    // key at all, and "undefined" is not a year anybody typed.
    year: copy.manualYear == null ? "" : String(copy.manualYear),
    label: copy.manualLabel ?? "",
    catalogNumber: copy.manualCatalogNumber ?? "",
    format: copy.manualFormat ?? catalogFormat ?? "",
  };
}

/**
 * The pressing half of the patch — five fields on a hand-entered copy, and on a matched
 * one only the format, and only when it actually moved.
 *
 * Omitted rather than sent as nulls on a matched copy: `applyCopyPatch` restamps whatever
 * it is given a value for, and stamping six fields nobody edited would let a save here
 * start winning conflicts elsewhere.
 */
function manualPatch(
  copy: Copy,
  fields: EditorFields,
  catalogFormat: Format | undefined,
): Partial<ManualRelease> {
  if (!isManualCopy(copy)) {
    // Picking the catalogue's own format is how you take the override off again: the copy
    // goes back to following the archive, including if the archive is corrected later.
    const chosen = fields.format === "" || fields.format === catalogFormat ? null : fields.format;
    return chosen === (copy.manualFormat ?? null) ? {} : { manualFormat: chosen };
  }
  const year = Number.parseInt(fields.year.trim(), 10);
  return {
    manualTitle: blankToNull(fields.title),
    manualArtist: blankToNull(fields.artist),
    manualYear: Number.isNaN(year) ? null : year,
    manualLabel: blankToNull(fields.label),
    manualCatalogNumber: blankToNull(fields.catalogNumber),
    manualFormat: fields.format === "" ? null : fields.format,
  };
}

function blankToNull(value: string): string | null {
  return value.trim() === "" ? null : value.trim();
}

/**
 * Editing one copy.
 *
 * The patch is built from what actually changed, and `applyCopyPatch` restamps only those
 * fields — so saving a form where you only touched the price does not start winning
 * conflicts against another device's edit to the condition.
 */
export function useCopyEditorLogic(
  copy: Copy,
  onSave: (patch: CopyPatch) => void,
  /**
   * What the archive says this pressing is, when it is a pressing the archive has.
   *
   * Passed in rather than looked up: this hook edits a copy, and the screens that draw it
   * are already holding the release.
   */
  catalogFormat?: Format,
) {
  const [fields, setFields] = useState<EditorFields>(() => fieldsOf(copy, catalogFormat));
  const [priceInvalid, setPriceInvalid] = useState(false);
  const [dateInvalid, setDateInvalid] = useState(false);

  const set = useCallback(<K extends keyof EditorFields>(key: K, value: EditorFields[K]) => {
    setFields((current) => ({ ...current, [key]: value }));
    if (key === "price") setPriceInvalid(false);
    if (key === "purchasedOn") setDateInvalid(false);
  }, []);

  const reset = useCallback(() => {
    setFields(fieldsOf(copy, catalogFormat));
    setPriceInvalid(false);
    setDateInvalid(false);
  }, [copy, catalogFormat]);

  const submit = useCallback(() => {
    // A manual copy cleared of its artist or title has nothing left to call it on the
    // shelf. The button is disabled for the same reason; this is the second lock, for the
    // Enter key that never sees a disabled button.
    if (isManualCopy(copy) && (fields.artist.trim() === "" || fields.title.trim() === "")) {
      return;
    }
    // A blank price means "not recorded", which is different from an unparseable one —
    // the second is a mistake worth surfacing rather than silently discarding.
    const price = fields.price.trim() === "" ? null : parseMoneyToCents(fields.price);
    if (fields.price.trim() !== "" && price === null) {
      setPriceInvalid(true);
      return;
    }
    const purchasedOn = fields.purchasedOn.trim() === "" ? null : parseIsoDate(fields.purchasedOn);
    if (fields.purchasedOn.trim() !== "" && purchasedOn === null) {
      setDateInvalid(true);
      return;
    }

    onSave({
      condition: fields.condition === "" ? null : fields.condition,
      sleeveCondition: fields.sleeveCondition === "" ? null : fields.sleeveCondition,
      pricePaidCents: price,
      purchasedOn,
      purchasedAt: fields.purchasedAt.trim() === "" ? null : fields.purchasedAt.trim(),
      rating: fields.rating,
      notes: fields.notes.trim() === "" ? null : fields.notes,
      ...manualPatch(copy, fields, catalogFormat),
    });
  }, [copy, fields, onSave, catalogFormat]);

  return {
    fields,
    set,
    reset,
    submit,
    priceInvalid,
    dateInvalid,
    /** Whether the pressing fields — bar the format, which is always editable — are this copy's. */
    manual: isManualCopy(copy),
    /** A manual copy still needs the two things that name it. */
    canSave: !isManualCopy(copy) || (fields.artist.trim() !== "" && fields.title.trim() !== ""),
  };
}
