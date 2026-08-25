import type { Copy } from "./types.js";

/**
 * Which picture stands for a copy, as a source the art component can use.
 *
 * The rule is one sentence and both apps have to say it the same way, or the same
 * collection looks different on two devices: the copy's own first photo wins, unless the
 * catalogue's artwork has been starred instead.
 *
 * `HIDDEN` does not appear here on purpose. It says the catalogue art is not one of this
 * copy's images, which is a question about the *list* rather than about which of its
 * entries is the preview — see `catalogArtShown`.
 *
 * @param photoSrc the copy's first photo, however this platform addresses it — an object
 *   URL on the web, a file URI on the device — or null when it has none, or when its bytes
 *   have not reached this device yet.
 * @returns the source to draw, or null to fall through to the release's own cover art.
 */
export function copyPreviewSrc(
  copy: Pick<Copy, "catalogArt">,
  photoSrc: string | null,
): string | null {
  return copy.catalogArt === "PREFERRED" ? null : photoSrc;
}

/**
 * Whether the release's cover art is one of this copy's images at all.
 *
 * Hiding it is per copy: the archive's art for a pressing can be the wrong cover, or one
 * you would rather not see on your shelf, and neither is a claim about the pressing that
 * other people's copies should inherit. A copy that has hidden it falls back to the format
 * silhouette where it has no photos of its own, exactly as a release with no art does.
 *
 * @param hasArt whether the release has cover art to show in the first place.
 */
export function catalogArtShown(copy: Pick<Copy, "catalogArt">, hasArt: boolean): boolean {
  return hasArt && copy.catalogArt !== "HIDDEN";
}
