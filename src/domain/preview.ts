import type { Copy } from "./types.js";

/**
 * Which picture stands for a copy, as a source the art component can use.
 *
 * The rule is one sentence and both apps have to say it the same way, or the same
 * collection looks different on two devices: the copy's own first photo wins, unless the
 * catalogue's artwork has been starred. It is here rather than in either app because the
 * two answers must agree, even though each draws the result its own way.
 *
 * @param photoSrc the copy's first photo, however this platform addresses it — an object
 *   URL on the web, a file URI on the device — or null when it has none, or when its bytes
 *   have not reached this device yet.
 * @returns the source to draw, or null to fall through to the release's own cover art.
 */
export function copyPreviewSrc(
  copy: Pick<Copy, "preferCatalogArt">,
  photoSrc: string | null,
): string | null {
  return copy.preferCatalogArt ? null : photoSrc;
}
