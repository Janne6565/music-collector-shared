import type { LocalStore } from "../local/LocalStore.js";

/**
 * Why the last photo upload was turned away, remembered across launches.
 *
 * Until this existed the engine caught every upload failure and dropped it on the floor.
 * That is the right shape for the ordinary ones -- offline, or the bytes not being on this
 * device -- because the photo is kept, the next sync tries again and nothing is lost. It is
 * the wrong shape for the two the server means as answers rather than accidents: the account
 * is full, or this one picture is too big. Those never fix themselves. Retrying for ever in
 * silence is how a photo ends up living on one phone for two days while the person who took
 * it believes it is backed up (design 28d).
 *
 * Kept in the settings table rather than in memory: the photo stays local until somebody
 * deletes something, which may be days and several launches away, and a banner that
 * disappears when the app restarts is a banner nobody will ever see twice.
 *
 * Only ever the *latest* refusal, not a list. Both reasons are about the account or the
 * picture rather than about one particular upload, so a second refusal for the same reason
 * is the same news; and the sentence the UI shows names the fix, which is identical however
 * many photos are waiting.
 */
export const PHOTO_UPLOAD_REFUSAL = "photo.upload.refusal";

/**
 * `full` is fixed by deleting a photo, `tooLarge` by choosing another picture, and each
 * screen that shows one must rule the other out -- 28d makes that the whole point of the
 * copy. Which is why the two are stored apart rather than as one "refused" flag.
 */
export type UploadRefusalReason = "full" | "tooLarge";

export interface UploadRefusal {
  readonly reason: UploadRefusalReason;
  /** The photo that was turned away, so the strip can mark the right tile (28e). */
  readonly photoId: string;
  /** Epoch millis, from the engine's clock, so a stale refusal can be recognised. */
  readonly at: number;
}

/**
 * The HTTP status behind a thrown upload, whatever threw it.
 *
 * Two shapes reach here and neither is ours to change: axios rejects with the response
 * hanging off the error, and the phone's client throws an `HttpError` carrying the status
 * directly. Anything else -- a network failure, an abort, a bug -- has no status, which is
 * the answer that matters: no status means it was not the server refusing.
 */
export function httpStatusOf(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const direct = (error as { status?: unknown }).status;
  if (typeof direct === "number") return direct;
  const response = (error as { response?: { status?: unknown } }).response;
  if (typeof response?.status === "number") return response.status;
  return null;
}

/**
 * Which refusal a status means, or null for everything that is worth retrying quietly.
 *
 * 401 is deliberately not here. A token that has expired mid-sync is not a refusal of the
 * photo, and telling somebody their storage is full because their session lapsed would be
 * both wrong and unfixable by the thing the sentence asks them to do.
 */
export function refusalReasonFor(status: number | null): UploadRefusalReason | null {
  if (status === 507) return "full";
  if (status === 413) return "tooLarge";
  return null;
}

export async function readUploadRefusal(store: LocalStore): Promise<UploadRefusal | null> {
  const raw = await store.readSetting(PHOTO_UPLOAD_REFUSAL);
  if (raw === undefined || raw === "") return null;
  try {
    const parsed = JSON.parse(raw) as Partial<UploadRefusal>;
    if (parsed.reason !== "full" && parsed.reason !== "tooLarge") return null;
    if (typeof parsed.photoId !== "string" || typeof parsed.at !== "number") return null;
    return { reason: parsed.reason, photoId: parsed.photoId, at: parsed.at };
  } catch {
    // A settings row written by a future version, or half a write. Reading it as "nothing
    // was refused" is the safe way to be wrong: the banner is missing rather than lying.
    return null;
  }
}

export async function writeUploadRefusal(store: LocalStore, refusal: UploadRefusal): Promise<void> {
  await store.writeSetting(PHOTO_UPLOAD_REFUSAL, JSON.stringify(refusal));
}

/** Cleared the moment anything uploads, which is the only proof there is room again. */
export async function clearUploadRefusal(store: LocalStore): Promise<void> {
  await store.writeSetting(PHOTO_UPLOAD_REFUSAL, "");
}
