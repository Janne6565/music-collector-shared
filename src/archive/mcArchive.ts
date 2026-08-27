import type { Copy, Photo, Release, WishlistItem } from "../domain/types.js";
import type { AlbumCovers } from "./albumCovers.js";
import { type ZipEntry, ZipError, decodeUtf8, encodeUtf8, readZip, writeZip } from "./zip.js";

/**
 * The `.mc` archive: everything the CSV export cannot say.
 *
 * A CSV is a spreadsheet, and a spreadsheet cannot hold a photograph. It also cannot hold
 * a field clock, which is what makes a copy *the same copy* when it comes back — a CSV
 * re-import necessarily creates new records, because there is nothing in the file to
 * recognise the old ones by. `.mc` is the other half of that pair: the whole collection,
 * with its identities, its clocks and its pictures, in one file a person owns.
 *
 * It is an ordinary ZIP, and it deliberately carries the two CSVs as well:
 *
 *     collection.json   copies, releases, wishes and photo records
 *     collection.csv    the spreadsheet export, unchanged
 *     wishlist.csv      the wishlist export, unchanged
 *     photos/<id>.jpg   the bytes, one file per photo
 *
 * so that someone who opens it in a file manager years from now finds their records
 * readable and their pictures viewable, with or without this app. That is the whole point
 * of an export, and a format that only this app could read would not have it.
 */

export const MC_FORMAT_VERSION = 1;
export const MC_EXTENSION = "mc";
/** A `.mc` is a ZIP, and saying so is what lets other tools open it. */
export const MC_MIME_TYPE = "application/zip";

export const MC_MANIFEST_PATH = "collection.json";
export const MC_COLLECTION_CSV_PATH = "collection.csv";
export const MC_WISHLIST_CSV_PATH = "wishlist.csv";
export const MC_PHOTO_DIRECTORY = "photos/";

/**
 * What the archive says, minus the image bytes.
 *
 * Records are stored exactly as the local store holds them, `fieldClocks` included. That
 * is what lets an import merge rather than duplicate: the same rules that reconcile two
 * devices reconcile a device and a file.
 */
export interface McManifest {
  readonly formatVersion: number;
  /**
   * The format discriminator, deliberately still the pre-Rekordo name. It is written into
   * every .mc file and checked on import, so changing it would make every archive a user
   * has already exported unreadable -- for a string nobody ever sees, since it lives
   * inside the zip. The user-visible name of the file is `rekordo-<date>.mc`.
   */
  readonly app: "music-collector";
  readonly exportedAt: string;
  readonly copies: readonly Copy[];
  /**
   * The catalogue entries the copies point at.
   *
   * Carried even though they are only a cache of MusicBrainz and Discogs, because an
   * import on a device with no network — or of a pressing since withdrawn from the
   * archive — would otherwise restore a collection of untitled placeholders.
   */
  readonly releases: readonly Release[];
  readonly wishes: readonly WishlistItem[];
  /** Metadata only; the bytes are the `photos/` entries, keyed by the photo's id. */
  readonly photos: readonly Photo[];
  /**
   * Album id to cover URL, for the wishlist.
   *
   * A wish names an album and artwork belongs to a pressing, so the cover is resolved by
   * the server from its own mirror — which is per-deployment. Without this, an archive
   * imported anywhere its albums are unknown shows a wishlist of blank silhouettes, and
   * it never recovers. Carried as URLs rather than bytes because that is what the
   * endpoint returns and what the client renders.
   *
   * Optional: archives written before this existed simply have none, which is why the
   * format version did not move. An unknown key is ignored by an older reader, and a
   * missing one reads as an empty map here.
   */
  readonly albumCovers?: AlbumCovers;
}

export interface McPhotoBytes {
  readonly photoId: string;
  readonly contentType: string;
  readonly bytes: Uint8Array;
}

export interface McArchiveInput {
  readonly exportedAt: Date;
  readonly copies: readonly Copy[];
  readonly releases: readonly Release[];
  readonly wishes: readonly WishlistItem[];
  readonly photos: readonly Photo[];
  /** Resolved by the caller, which owns the API client; empty when it could not ask. */
  readonly albumCovers: AlbumCovers;
  /** Only for photos whose bytes are actually on this device; the rest are metadata only. */
  readonly photoBytes: readonly McPhotoBytes[];
  /** The spreadsheet exports, rendered by the caller — each app owns its own CSV code. */
  readonly collectionCsv: string;
  readonly wishlistCsv: string;
}

export class McArchiveError extends Error {}

export function buildMcArchive(input: McArchiveInput): Uint8Array {
  const manifest: McManifest = {
    formatVersion: MC_FORMAT_VERSION,
    app: "music-collector",
    exportedAt: input.exportedAt.toISOString(),
    copies: input.copies,
    releases: input.releases,
    wishes: input.wishes,
    photos: input.photos,
    albumCovers: input.albumCovers,
  };

  const entries: ZipEntry[] = [
    { path: MC_MANIFEST_PATH, bytes: encodeUtf8(`${JSON.stringify(manifest, null, 2)}\n`) },
    { path: MC_COLLECTION_CSV_PATH, bytes: encodeUtf8(input.collectionCsv) },
    { path: MC_WISHLIST_CSV_PATH, bytes: encodeUtf8(input.wishlistCsv) },
  ];
  for (const photo of input.photoBytes) {
    entries.push({ path: photoPath(photo.photoId, photo.contentType), bytes: photo.bytes });
  }
  return writeZip(entries, input.exportedAt);
}

export interface McArchiveContents {
  readonly manifest: McManifest;
  /** Photo id to bytes, for the photos the archive actually carries pictures for. */
  readonly photoBytes: ReadonlyMap<string, Uint8Array>;
}

/**
 * Reads an archive, checking it is one of ours before believing anything in it.
 *
 * A future version is refused by name rather than half-imported: a file written by a newer
 * build may describe records this one has no field for, and importing it anyway would
 * quietly drop them — and then push the lossy version back over sync.
 */
export function readMcArchive(archive: Uint8Array): McArchiveContents {
  let entries: ZipEntry[];
  try {
    entries = readZip(archive);
  } catch (error) {
    if (error instanceof ZipError) throw new McArchiveError(error.message);
    throw error;
  }

  const manifestEntry = entries.find((entry) => entry.path === MC_MANIFEST_PATH);
  if (manifestEntry === undefined) {
    throw new McArchiveError("Not a Rekordo archive: it has no collection.json");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeUtf8(manifestEntry.bytes));
  } catch {
    throw new McArchiveError("The archive's collection.json is not readable");
  }
  const manifest = parsed as McManifest;
  if (manifest?.app !== "music-collector") {
    throw new McArchiveError("Not a Rekordo archive");
  }
  if (manifest.formatVersion > MC_FORMAT_VERSION) {
    throw new McArchiveError(
      `This archive was written by a newer version of the app (format ${manifest.formatVersion})`,
    );
  }

  const photoBytes = new Map<string, Uint8Array>();
  for (const entry of entries) {
    if (!entry.path.startsWith(MC_PHOTO_DIRECTORY)) continue;
    photoBytes.set(photoIdOf(entry.path), entry.bytes);
  }

  return {
    manifest: {
      ...manifest,
      // A file trimmed by hand — or by an older writer — should import what it does have
      // rather than crash on a missing key.
      copies: manifest.copies ?? [],
      releases: manifest.releases ?? [],
      wishes: manifest.wishes ?? [],
      photos: manifest.photos ?? [],
      albumCovers: manifest.albumCovers ?? {},
    },
    photoBytes,
  };
}

/**
 * The extension a photo is filed under.
 *
 * Named after the content type rather than kept alongside it, because the name is what a
 * person sees in a file manager: `photos/4f2a….jpg` opens on a double-click, and
 * `photos/4f2a…` does not. The import reads the type back from the manifest, never from
 * the extension, so an unrecognised type filed as `.bin` still round-trips exactly.
 */
export function photoPath(photoId: string, contentType: string): string {
  return `${MC_PHOTO_DIRECTORY}${photoId}.${extensionFor(contentType)}`;
}

function photoIdOf(path: string): string {
  const name = path.slice(MC_PHOTO_DIRECTORY.length);
  const dot = name.lastIndexOf(".");
  return dot === -1 ? name : name.slice(0, dot);
}

function extensionFor(contentType: string): string {
  switch (contentType.split(";")[0].trim().toLowerCase()) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/heic":
      return "heic";
    case "image/heif":
      return "heif";
    case "image/avif":
      return "avif";
    case "image/gif":
      return "gif";
    default:
      return "bin";
  }
}

/** `rekordo-2026-08-26.mc` — the same shape the CSV exports already use. */
export function mcFileName(exportedAt: Date): string {
  return `rekordo-${exportedAt.toISOString().slice(0, 10)}.${MC_EXTENSION}`;
}
