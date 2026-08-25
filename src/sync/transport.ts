import type { Copy, Photo, Release, WishlistItem } from "../domain/types.js";

/**
 * Everything the sync engine needs from the network, expressed in domain terms.
 *
 * The two apps talk to the same endpoints in different ways — the web app through an
 * Orval-generated client whose DTOs have every field optional, the mobile app through a
 * hand-written fetch client — and they move photo bytes differently besides: a Blob on the
 * web, a file URI on the device. None of that is reconciliation logic, and all of it used
 * to be woven through two copies of the engine that then drifted apart.
 *
 * Everything above this line is the same program on both platforms. Everything below it is
 * each app's own business, implemented next to its API client.
 */
export interface SyncPage {
  readonly copies: readonly Copy[];
  readonly wishes: readonly WishlistItem[];
  readonly photos: readonly Photo[];
  readonly cursor: number;
  readonly hasMore: boolean;
}

export interface PushResult {
  /** What the server decided each record looks like, adopted verbatim afterwards. */
  readonly copies: readonly Copy[];
  readonly wishes: readonly WishlistItem[];
  readonly photos: readonly Photo[];
  readonly cursor: number;
}

export interface SyncTransport {
  /**
   * One page of everything changed since `cursor`. A malformed record is the transport's
   * problem: drop it there rather than letting it reach the store.
   */
  pull(cursor: number): Promise<SyncPage>;

  push(
    copies: readonly Copy[],
    wishes: readonly WishlistItem[],
    photos: readonly Photo[],
  ): Promise<PushResult>;

  /**
   * Moves one photo's bytes to the server, returning the key they landed under.
   *
   * Null means "not now, and not an error" — the bytes are not on this device, or the
   * server refused them. The photo stays pending and the next sync tries again, which is
   * why this must not throw for the ordinary cases.
   */
  uploadPhoto(photo: Photo): Promise<{ readonly storageKey: string } | null>;

  /** Fetches one photo's bytes and stores them on this device. */
  downloadPhoto(photo: Photo): Promise<void>;

  /**
   * The catalogue entries behind a set of release ids.
   *
   * Sync moves copies, not the catalogue: a release is a shared cache of MusicBrainz and
   * Discogs that any client may drop and refill, so it travels over its own endpoint. Ids
   * the mirror does not hold are simply missing from the answer — that is not a failure,
   * and the next sync asks again.
   */
  fetchReleases(releaseIds: readonly string[]): Promise<readonly Release[]>;
}
