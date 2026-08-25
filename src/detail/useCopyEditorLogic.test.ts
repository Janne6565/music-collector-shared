import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Copy } from "../domain/types.js";
import { useCopyEditorLogic } from "./useCopyEditorLogic.js";

function copy(overrides: Partial<Copy> = {}): Copy {
  return {
    id: "copy-1",
    releaseId: "rel-1",
    condition: "VG_PLUS",
    sleeveCondition: "NM",
    preferCatalogArt: false,
    pricePaidCents: 2800,
    currency: "EUR",
    purchasedOn: "2026-08-14",
    purchasedAt: "Concerto, Amsterdam",
    notes: "Gatefold.",
    notesConflict: null,
    rating: 4,
    createdAt: 1000,
    deletedAt: null,
    fieldClocks: {} as Copy["fieldClocks"],
    ...overrides,
  };
}

describe("useCopyEditorLogic", () => {
  it("starts from what the copy already holds", () => {
    const { result } = renderHook(() => useCopyEditorLogic(copy(), vi.fn()));

    expect(result.current.fields).toEqual({
      condition: "VG_PLUS",
      sleeveCondition: "NM",
      price: "28.00",
      purchasedOn: "2026-08-14",
      purchasedAt: "Concerto, Amsterdam",
      rating: 4,
      notes: "Gatefold.",
    });
  });

  it("saves what was typed", () => {
    const onSave = vi.fn();
    const { result } = renderHook(() => useCopyEditorLogic(copy(), onSave));

    act(() => result.current.set("price", "34,50"));
    act(() => result.current.set("condition", "NM"));
    act(() => result.current.submit());

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ pricePaidCents: 3450, condition: "NM" }),
    );
  });

  it("turns cleared fields into nulls rather than empty strings", () => {
    // "Not recorded" has to be null, or the detail screen shows a blank where it should
    // show an em dash, and sync stores an empty string as a real value.
    const onSave = vi.fn();
    const { result } = renderHook(() => useCopyEditorLogic(copy(), onSave));

    act(() => result.current.set("price", ""));
    act(() => result.current.set("purchasedAt", "   "));
    act(() => result.current.set("notes", ""));
    act(() => result.current.set("condition", ""));
    act(() => result.current.submit());

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        pricePaidCents: null,
        purchasedAt: null,
        notes: null,
        condition: null,
      }),
    );
  });

  it("refuses to save an unparseable price and says so", () => {
    const onSave = vi.fn();
    const { result } = renderHook(() => useCopyEditorLogic(copy(), onSave));

    act(() => result.current.set("price", "about thirty quid"));
    act(() => result.current.submit());

    expect(onSave).not.toHaveBeenCalled();
    expect(result.current.priceInvalid).toBe(true);
  });

  it("refuses a date that is not a date", () => {
    const onSave = vi.fn();
    const { result } = renderHook(() => useCopyEditorLogic(copy(), onSave));

    act(() => result.current.set("purchasedOn", "2026-02-30"));
    act(() => result.current.submit());

    expect(onSave).not.toHaveBeenCalled();
    expect(result.current.dateInvalid).toBe(true);
  });

  it("clears the error once the field is edited again", () => {
    const { result } = renderHook(() => useCopyEditorLogic(copy(), vi.fn()));

    act(() => result.current.set("price", "nonsense"));
    act(() => result.current.submit());
    expect(result.current.priceInvalid).toBe(true);

    act(() => result.current.set("price", "12.00"));
    expect(result.current.priceInvalid).toBe(false);
  });

  it("restores the original values on reset", () => {
    const { result } = renderHook(() => useCopyEditorLogic(copy(), vi.fn()));

    act(() => result.current.set("notes", "something else"));
    act(() => result.current.reset());

    expect(result.current.fields.notes).toBe("Gatefold.");
  });

  it("can record a free record without it looking unrecorded", () => {
    // Zero and "not recorded" are different facts about a record.
    const onSave = vi.fn();
    const { result } = renderHook(() => useCopyEditorLogic(copy(), onSave));

    act(() => result.current.set("price", "0"));
    act(() => result.current.submit());

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ pricePaidCents: 0 }));
  });

  it("starts blank for a copy that has nothing recorded yet", () => {
    const { result } = renderHook(() =>
      useCopyEditorLogic(
        copy({
          condition: null,
          sleeveCondition: null,
          pricePaidCents: null,
          purchasedOn: null,
          purchasedAt: null,
          notes: null,
          rating: null,
        }),
        vi.fn(),
      ),
    );

    expect(result.current.fields).toEqual({
      condition: "",
      sleeveCondition: "",
      price: "",
      purchasedOn: "",
      purchasedAt: "",
      rating: null,
      notes: "",
    });
  });
});
