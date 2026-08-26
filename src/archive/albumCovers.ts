import { isManualReleaseId } from "../domain/types.js";
import type { LocalStore } from "../local/LocalStore.js";

/**
 * The album covers an archive brought with it.
 *
 * A wishlist entry names an album, and artwork belongs to a pressing — so a wish carries
 * no cover of its own and the server resolves one from the pressings it has mirrored.
 * That mirror is per-environment and per-deployment: an archive exported where the albums
 * were known and imported where they are not leaves every wish drawing the format
 * silhouette, and it does not heal, because the covers endpoint calls no catalogue and
 * nothing else ever asks about those albums again.
 *
 * So the archive carries the answer the exporting device already had, and the importing
 * one keeps it as a fallback for exactly the ids the server cannot answer for. It is a
 * cache of a catalogue fact, not part of the collection: device-local, never synced, and
 * always beaten by a live answer.
 */

/**
 * Kept in the settings table rather than a table of its own.
 *
 * It is device-local and unsynced, which is what settings are for, and it is bounded by
 * the size of a wishlist — tens of rows, not thousands. A table would mean a Dexie
 * version and a SQLite migration in both apps for a cache that may be dropped at any time.
 */
export const ARCHIVED_ALBUM_COVERS_KEY = "archivedAlbumCovers";

export type AlbumCovers = Readonly<Record<string, string>>;

export async function readArchivedAlbumCovers(store: LocalStore): Promise<AlbumCovers> {
  const raw = await store.readSetting(ARCHIVED_ALBUM_COVERS_KEY);
  if (raw === undefined) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as AlbumCovers) : {};
  } catch {
    // A cache that cannot be read is a cache that is empty. Never a reason to fail an
    // import or blank a screen.
    return {};
  }
}

/** Merges rather than replaces: two archives describe two parts of one shelf. */
export async function rememberArchivedAlbumCovers(
  store: LocalStore,
  covers: AlbumCovers,
): Promise<void> {
  if (Object.keys(covers).length === 0) return;
  const merged = { ...(await readArchivedAlbumCovers(store)), ...covers };
  await store.writeSetting(ARCHIVED_ALBUM_COVERS_KEY, JSON.stringify(merged));
}

/**
 * The server's answer, with the archive's filling the gaps.
 *
 * A live *URL* always wins — it is this deployment's own catalogue talking. A live
 * **null** does not, and that is the whole point: null means "nothing I know of has a
 * cover", which is an absence of knowledge rather than knowledge of an absence. The two
 * are indistinguishable in the response, and on a deployment whose mirror has never seen
 * the album every wish comes back null. Falling back there is exactly the case this
 * exists for.
 */
export function withArchivedCovers(
  resolved: ReadonlyMap<string, string | null>,
  archived: AlbumCovers,
): ReadonlyMap<string, string | null> {
  const merged = new Map(resolved);
  for (const [albumId, url] of Object.entries(archived)) {
    const live = merged.get(albumId);
    if (live === undefined || live === null) merged.set(albumId, url);
  }
  return merged;
}

/**
 * The albums an export should resolve covers for.
 *
 * Wishes only: a copy's artwork travels on its `Release`, which the archive already
 * carries. Hand-entered `local:` albums are left out because no catalogue has ever heard
 * of them — their picture is a photo, and photos are in the archive already.
 */
export function albumsNeedingCovers(wishes: readonly { readonly albumId: string }[]): string[] {
  const ids = new Set<string>();
  for (const wish of wishes) {
    if (!isManualReleaseId(wish.albumId)) ids.add(wish.albumId);
  }
  return [...ids];
}

/**
 * The pressings an export should resolve covers for.
 *
 * An entry made from a search result names the pressing it was made from, and that
 * sleeve — not whichever pressing of the album the mirror ranks first — is the picture
 * the wishlist has been showing. It has to be asked for separately: the covers endpoint
 * answers about albums, and an album cannot say which of its pressings somebody picked.
 */
export function pressingsNeedingCovers(
  wishes: readonly { readonly albumId: string; readonly releaseId: string | null }[],
): string[] {
  const ids = new Set<string>();
  for (const wish of wishes) {
    if (wish.releaseId === null || isManualReleaseId(wish.releaseId)) continue;
    ids.add(wish.releaseId);
  }
  return [...ids];
}
