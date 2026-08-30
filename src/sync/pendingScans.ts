import type { Copy, Release, WishlistItem } from "../domain/types.js";
import type { LocalStore } from "../local/LocalStore.js";
import type { ClockSource } from "../local/copyWrites.js";
import { resolveScannedCopy } from "../local/copyWrites.js";
import { resolveScannedWish } from "../local/wishWrites.js";

/**
 * Naming the scans that were kept before anyone could look them up.
 *
 * The scanner works in a basement: reading a barcode is the camera's job and needs no
 * signal, while finding out which record it is means asking a catalogue, which does. So a
 * scan made offline is stored as the digits it genuinely is, and this turns those digits
 * into records once a connection exists.
 *
 * Deliberately in the shared package: the phone and the browser have to reach exactly the
 * same conclusion about the same barcode, or the same scan resolves to a different
 * pressing on each device and the merge picks between two answers nobody chose.
 */

/** The pressings behind one barcode, in the catalogue's own order. */
export type PendingScanLookup = (barcode: string) => Promise<Release[]>;

export interface ResolvePendingScansOptions {
  readonly store: LocalStore;
  readonly clock: ClockSource;
  readonly lookup: PendingScanLookup;
  /**
   * Barcodes this run should not ask about again, and the set it adds to.
   *
   * A barcode the catalogues genuinely do not have — a promo, a club edition, anything
   * pressed before the mid-eighties — would otherwise be looked up on every sweep for as
   * long as the copy exists. Held by the caller rather than stored, and never synced:
   * "this mirror had nothing for it just now" is a fact about one app session, not about
   * the record, and another device with another cache may well answer.
   */
  readonly asked?: Set<string>;
}

export interface ResolvedScans {
  readonly copies: number;
  readonly wishes: number;
  /** Still waiting: no connection, or a barcode nothing could be found for. */
  readonly stillPending: number;
}

/**
 * Which of the pressings behind a barcode this scan meant.
 *
 * A barcode is reused across reissues often enough that "the first one" is a coin toss,
 * but the person did answer one question on the confirm card — the format — and that is
 * the only thing distinguishing the candidates that they actually saw. So a pressing in
 * the format they picked wins, and the catalogue's own order decides among those.
 *
 * Exported because the confirm card ranks the same candidates the same way: the pressing
 * the card calls its best guess has to be the one an offline scan would settle on, or the
 * flow tells two different stories about the same record.
 */
export function pickPressing(
  releases: readonly Release[],
  format: Copy["manualFormat"],
): Release | undefined {
  if (format === null) return releases[0];
  return releases.find((release) => release.format === format) ?? releases[0];
}

/**
 * Looks up everything still waiting and writes back what it can name.
 *
 * One lookup per distinct barcode, not per record: scanning the same record onto the shelf
 * and onto the wishlist in one session is an ordinary thing to do in a shop, and asking
 * twice would spend two requests to arrive at the same answer.
 *
 * A failed lookup is not an error here. It means the phone is still offline, or the
 * catalogue has nothing — both leave the record exactly as it was, waiting, which is what
 * its row already says.
 */
export async function resolvePendingScans({
  store,
  clock,
  lookup,
  asked = new Set<string>(),
}: ResolvePendingScansOptions): Promise<ResolvedScans> {
  const { copies, wishes } = await store.listPendingScans();
  if (copies.length === 0 && wishes.length === 0) {
    return { copies: 0, wishes: 0, stillPending: 0 };
  }

  const barcodes = new Set<string>();
  for (const record of [...copies, ...wishes]) {
    if (record.pendingBarcode !== null && !asked.has(record.pendingBarcode)) {
      barcodes.add(record.pendingBarcode);
    }
  }

  const found = new Map<string, Release[]>();
  for (const barcode of barcodes) {
    try {
      const releases = await lookup(barcode);
      asked.add(barcode);
      if (releases.length > 0) found.set(barcode, releases);
    } catch {
      // Offline, rate-limited, or the proxy is down. The scan keeps its digits and the
      // next sweep asks again — which is why this barcode is not marked as asked.
    }
  }

  const cached = [...found.values()].flat();
  if (cached.length > 0) await store.cacheReleases(cached);

  let namedCopies = 0;
  for (const copy of copies) {
    const release = candidate(found, copy.pendingBarcode, copy.manualFormat);
    if (release === undefined) continue;
    await store.putCopy(resolveScannedCopy(copy, release.id, clock));
    namedCopies += 1;
  }

  let namedWishes = 0;
  for (const wish of wishes) {
    const release = candidate(found, wish.pendingBarcode, wish.desiredFormat);
    if (release === undefined) continue;
    await store.putWishlistItem(resolvedWish(wish, release, clock));
    namedWishes += 1;
  }

  return {
    copies: namedCopies,
    wishes: namedWishes,
    stillPending: copies.length + wishes.length - namedCopies - namedWishes,
  };
}

function candidate(
  found: ReadonlyMap<string, Release[]>,
  barcode: string | null,
  format: Copy["manualFormat"],
): Release | undefined {
  if (barcode === null) return undefined;
  const releases = found.get(barcode);
  return releases === undefined ? undefined : pickPressing(releases, format);
}

function resolvedWish(wish: WishlistItem, release: Release, clock: ClockSource): WishlistItem {
  return resolveScannedWish(
    wish,
    {
      albumId: release.albumId,
      releaseId: release.id,
      title: release.title,
      artistName: release.artistName,
      year: release.year,
    },
    clock,
  );
}
