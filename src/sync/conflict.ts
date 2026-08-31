import { hlcDecode } from "../domain/hlc.js";
import type {
  Copy,
  CopyMergeableField,
  Format,
  WishMergeableField,
  WishlistItem,
} from "../domain/types.js";

/**
 * What the two shelves look like at the moment somebody signs in, and what each way out
 * of that would cost.
 *
 * The app is used before anyone has an account, so signing in is nearly always signing in
 * *onto* data that already exists. Most of the time one side is simply ahead of the other
 * and there is nothing to weigh; the point of this module is to be able to say which of
 * those two situations it is, in numbers, before a single record is written.
 *
 * Everything here is pure. The engine hands it two snapshots — the local store and a peek
 * at the account — and it answers with arithmetic. Nothing in this file writes.
 */

/** Which of the two shelves a value, or an entry, is from. */
export type ShelfSide = "LOCAL" | "ACCOUNT";

/** The two kinds of record that sync, and that the difference is therefore made of. */
export type EntryKind = "COPY" | "WISH";

/**
 * The fields of a copy whose disagreement is worth putting in front of a person.
 *
 * Deliberately a subset of {@link COPY_MERGEABLE_FIELDS}. A copy carries nineteen
 * mergeable fields and most of them cannot meaningfully differ at a first sign-in — a
 * tombstone, a release id, a pending barcode — or are not a judgement anyone would want
 * to make by hand. What is left is the handful somebody actually typed: what they thought
 * of the record, what shape it is in, and what they paid.
 */
export const REVIEWABLE_COPY_FIELDS = [
  "rating",
  "notes",
  "condition",
  "sleeveCondition",
  "pricePaidCents",
  "purchasedOn",
] as const satisfies readonly CopyMergeableField[];
export type ReviewableCopyField = (typeof REVIEWABLE_COPY_FIELDS)[number];

/** The same, for a wishlist entry: the line somebody wrote and the format they want. */
export const REVIEWABLE_WISH_FIELDS = [
  "note",
  "desiredFormat",
] as const satisfies readonly WishMergeableField[];
export type ReviewableWishField = (typeof REVIEWABLE_WISH_FIELDS)[number];

export type ReviewableField = ReviewableCopyField | ReviewableWishField;

/** Enough of a record to name it in a list, whichever side it came from. */
export interface EntryLabel {
  readonly title: string | null;
  readonly artistName: string | null;
  readonly year: number | null;
  readonly format: Format;
}

/** One record that exists, live, on exactly one of the two sides. */
export interface OneSidedEntry extends EntryLabel {
  readonly id: string;
  readonly kind: EntryKind;
  readonly side: ShelfSide;
  /** When that side last touched it, in wall-clock milliseconds. */
  readonly changedAt: number;
}

/**
 * One field of one record that both sides hold, with two different answers.
 *
 * Keyed per field rather than per record: two devices that disagree about a rating *and*
 * a note have made two separate decisions, and a review that made them pick a whole side
 * at once would force one of the two to be wrong.
 */
export interface ValueDifference extends EntryLabel {
  readonly id: string;
  readonly kind: EntryKind;
  readonly field: ReviewableField;
  readonly local: unknown;
  readonly account: unknown;
  readonly localAt: number;
  readonly accountAt: number;
  /** The side an ordinary merge would take — the later stamp. */
  readonly winner: ShelfSide;
}

/**
 * Which of the three situations a sign-in is.
 *
 * The distinction is the whole design: only `CONFLICT` is a question, and only a question
 * is allowed to block the library.
 */
export type ComparisonOutcome =
  /** The account holds nothing at all. Nothing to compare, so nothing is asked. */
  | "EMPTY_ACCOUNT"
  /**
   * One side contains everything the other has and no value is disputed, so merging
   * deletes nothing and there is no decision to make — a confirmation, not a choice.
   */
  | "NO_LOSS"
  /** Both sides changed and neither contains everything. */
  | "CONFLICT";

export interface ShelfComparison {
  readonly outcome: ComparisonOutcome;
  /** Live records on each side, by kind. */
  readonly localCopies: number;
  readonly localWishes: number;
  readonly accountCopies: number;
  readonly accountWishes: number;
  /** Held by both sides with nothing in dispute — the part of the shelf nobody has to read. */
  readonly identicalCopies: number;
  readonly identicalWishes: number;
  readonly onlyLocal: readonly OneSidedEntry[];
  readonly onlyAccount: readonly OneSidedEntry[];
  readonly values: readonly ValueDifference[];
  /** When each side was last touched, or null when that side is empty. */
  readonly localChangedAt: number | null;
  readonly accountChangedAt: number | null;
  /**
   * Sleeve photographs held on this device.
   *
   * Reported because it is the one number that is *not* part of the argument: no choice
   * offered here deletes a photo, and saying so is only credible next to a count.
   */
  readonly photos: number;
}

/** The number of entries the itemised difference will list. */
export function differenceCount(comparison: ShelfComparison): number {
  return comparison.onlyLocal.length + comparison.onlyAccount.length + comparison.values.length;
}

/** Copies on the shelf after "keep both": everything local, plus what only the account had. */
export function mergedCopies(comparison: ShelfComparison): number {
  return comparison.localCopies + countKind(comparison.onlyAccount, "COPY");
}

export function mergedWishes(comparison: ShelfComparison): number {
  return comparison.localWishes + countKind(comparison.onlyAccount, "WISH");
}

/**
 * How many entries keeping `side` throws away.
 *
 * Copies and wishlist entries together, on purpose: the sentence this number goes into is
 * about loss, not about categories. The itemised difference is where the split is legible.
 */
export function dropCount(comparison: ShelfComparison, side: ShelfSide): number {
  return side === "LOCAL" ? comparison.onlyAccount.length : comparison.onlyLocal.length;
}

/** The entries keeping `side` throws away, for the confirmation and its export. */
export function dropped(comparison: ShelfComparison, side: ShelfSide): readonly OneSidedEntry[] {
  return side === "LOCAL" ? comparison.onlyAccount : comparison.onlyLocal;
}

/** Copies left after keeping one side outright. */
export function keptCopies(comparison: ShelfComparison, side: ShelfSide): number {
  return side === "LOCAL" ? comparison.localCopies : comparison.accountCopies;
}

function countKind(entries: readonly OneSidedEntry[], kind: EntryKind): number {
  return entries.filter((entry) => entry.kind === kind).length;
}

/** The stable key for one disputed value, used by the per-item review's picks. */
export function differenceKey(difference: Pick<ValueDifference, "id" | "field">): string {
  return `${difference.id}:${difference.field}`;
}

/**
 * What somebody decided in the per-item review.
 *
 * Both halves are deliberately sparse: an entry nobody touched is not in `dropped`, and a
 * value nobody picked is not in `picks`. Leaving the screen early therefore keeps
 * everything and takes the ordinary merge for the rest, which is what makes it safe to
 * leave at all.
 */
export interface ReviewPlan {
  /** {@link differenceKey} to the side that was chosen. */
  readonly picks: Readonly<Record<string, ShelfSide>>;
  /** Ids of one-sided entries that were explicitly dropped. */
  readonly dropped: readonly string[];
}

export const EMPTY_REVIEW_PLAN: ReviewPlan = { picks: {}, dropped: [] };

/** Copies the review would leave behind, recomputed as the picks change. */
export function reviewedCopies(comparison: ShelfComparison, plan: ReviewPlan): number {
  return reviewedCount(comparison, plan, "COPY");
}

export function reviewedWishes(comparison: ShelfComparison, plan: ReviewPlan): number {
  return reviewedCount(comparison, plan, "WISH");
}

function reviewedCount(comparison: ShelfComparison, plan: ReviewPlan, kind: EntryKind): number {
  const shared = kind === "COPY" ? comparison.identicalCopies : comparison.identicalWishes;
  const disputed = new Set(
    comparison.values.filter((value) => value.kind === kind).map((value) => value.id),
  );
  const dropping = new Set(plan.dropped);
  const oneSided = [...comparison.onlyLocal, ...comparison.onlyAccount].filter(
    (entry) => entry.kind === kind && !dropping.has(entry.id),
  );
  // Records held by both sides survive every pick — a pick chooses a value, never whether
  // the record is there — so they are counted whole and only the one-sided ones are
  // filtered. `disputed` is what keeps them from being counted twice.
  return shared + disputed.size + oneSided.length;
}

/** How many of the difference's decisions have actually been made. */
export function decidedCount(comparison: ShelfComparison, plan: ReviewPlan): number {
  const oneSidedIds = new Set(
    [...comparison.onlyLocal, ...comparison.onlyAccount].map((entry) => entry.id),
  );
  const droppedHere = plan.dropped.filter((id) => oneSidedIds.has(id)).length;
  const picked = comparison.values.filter(
    (value) => plan.picks[differenceKey(value)] !== undefined,
  ).length;
  return droppedHere + picked;
}

/** The most recent wall time any of these records was stamped with, or null when empty. */
export function lastChangedAt(
  records: readonly { readonly fieldClocks: Readonly<Record<string, string>> }[],
): number | null {
  let latest: number | null = null;
  for (const record of records) {
    const at = stampedAt(record);
    if (latest === null || at > latest) latest = at;
  }
  return latest;
}

/**
 * When a record was last written, read off its field clocks.
 *
 * There is no `updatedAt` column anywhere in the model, and adding one would be a second
 * source of truth about the same event. The clocks already carry it: an HLC's wall half is
 * the millisecond the write happened, and the newest of them is the newest edit.
 */
export function stampedAt(record: {
  readonly fieldClocks: Readonly<Record<string, string>>;
}): number {
  let latest = 0;
  for (const encoded of Object.values(record.fieldClocks)) {
    const wall = hlcDecode(encoded).wall;
    if (wall > latest) latest = wall;
  }
  return latest;
}

/** How a caller turns a record into something the difference list can draw. */
export interface LabelSource {
  labelForCopy(copy: Copy): EntryLabel;
  labelForWish(wish: WishlistItem): EntryLabel;
}

interface Snapshot {
  readonly copies: readonly Copy[];
  readonly wishes: readonly WishlistItem[];
}

/**
 * Compares two snapshots of the same collection.
 *
 * Tombstones are absence: a record deleted on one side is simply not there, and only
 * becomes one-sided if it is live on the other. Reading it any other way would list a
 * delete as an addition and offer to "keep" a record that somebody threw away.
 */
export function compareShelves(
  local: Snapshot,
  account: Snapshot,
  labels: LabelSource,
  photos: number,
): ShelfComparison {
  const localCopies = live(local.copies);
  const accountCopies = live(account.copies);
  const localWishes = live(local.wishes);
  const accountWishes = live(account.wishes);

  const copyDiff = diffRecords(localCopies, accountCopies, "COPY", REVIEWABLE_COPY_FIELDS, (copy) =>
    labels.labelForCopy(copy),
  );
  const wishDiff = diffRecords(localWishes, accountWishes, "WISH", REVIEWABLE_WISH_FIELDS, (wish) =>
    labels.labelForWish(wish),
  );

  const onlyLocal = [...copyDiff.onlyLocal, ...wishDiff.onlyLocal].sort(byRecency);
  const onlyAccount = [...copyDiff.onlyAccount, ...wishDiff.onlyAccount].sort(byRecency);
  const values = [...copyDiff.values, ...wishDiff.values];

  return {
    outcome: outcomeOf(accountCopies.length + accountWishes.length, onlyLocal, onlyAccount, values),
    localCopies: localCopies.length,
    localWishes: localWishes.length,
    accountCopies: accountCopies.length,
    accountWishes: accountWishes.length,
    identicalCopies: copyDiff.shared - copyDiff.disputedRecords,
    identicalWishes: wishDiff.shared - wishDiff.disputedRecords,
    onlyLocal,
    onlyAccount,
    values,
    localChangedAt: lastChangedAt([...localCopies, ...localWishes]),
    accountChangedAt: lastChangedAt([...accountCopies, ...accountWishes]),
    photos,
  };
}

function outcomeOf(
  accountSize: number,
  onlyLocal: readonly OneSidedEntry[],
  onlyAccount: readonly OneSidedEntry[],
  values: readonly ValueDifference[],
): ComparisonOutcome {
  if (accountSize === 0) return "EMPTY_ACCOUNT";
  // Merging never deletes, so the only thing that makes this a question is a value both
  // sides claim, or each side holding something the other does not. Either alone is
  // arithmetic; the pair is a decision.
  if (values.length > 0) return "CONFLICT";
  if (onlyLocal.length > 0 && onlyAccount.length > 0) return "CONFLICT";
  return "NO_LOSS";
}

interface RecordDiff {
  readonly onlyLocal: OneSidedEntry[];
  readonly onlyAccount: OneSidedEntry[];
  readonly values: ValueDifference[];
  /** Records both sides hold. */
  readonly shared: number;
  /** How many of those have at least one disputed value. */
  readonly disputedRecords: number;
}

function diffRecords<Record_ extends { readonly id: string }>(
  localRecords: readonly Record_[],
  accountRecords: readonly Record_[],
  kind: EntryKind,
  fields: readonly string[],
  label: (record: Record_) => EntryLabel,
): RecordDiff {
  const accountById = new Map(accountRecords.map((record) => [record.id, record]));
  const localById = new Map(localRecords.map((record) => [record.id, record]));

  const onlyLocal: OneSidedEntry[] = [];
  const onlyAccount: OneSidedEntry[] = [];
  const values: ValueDifference[] = [];
  let shared = 0;
  let disputedRecords = 0;

  for (const localRecord of localRecords) {
    const accountRecord = accountById.get(localRecord.id);
    if (accountRecord === undefined) {
      onlyLocal.push(entryOf(localRecord, kind, "LOCAL", label));
      continue;
    }
    shared += 1;
    const disputed = disputedFields(localRecord, accountRecord, kind, fields, label(localRecord));
    if (disputed.length > 0) disputedRecords += 1;
    values.push(...disputed);
  }
  for (const accountRecord of accountRecords) {
    if (!localById.has(accountRecord.id)) {
      onlyAccount.push(entryOf(accountRecord, kind, "ACCOUNT", label));
    }
  }

  return { onlyLocal, onlyAccount, values, shared, disputedRecords };
}

function disputedFields<Record_ extends { readonly id: string }>(
  localRecord: Record_,
  accountRecord: Record_,
  kind: EntryKind,
  fields: readonly string[],
  label: EntryLabel,
): ValueDifference[] {
  const localAny = localRecord as unknown as Clocked;
  const accountAny = accountRecord as unknown as Clocked;
  const found: ValueDifference[] = [];

  for (const field of fields) {
    const localValue = localAny[field];
    const accountValue = accountAny[field];
    if (sameValue(localValue, accountValue)) continue;
    const localClock = localAny.fieldClocks[field];
    const accountClock = accountAny.fieldClocks[field];
    found.push({
      ...label,
      id: localRecord.id,
      kind,
      field: field as ReviewableField,
      local: localValue,
      account: accountValue,
      localAt: localClock === undefined ? 0 : hlcDecode(localClock).wall,
      accountAt: accountClock === undefined ? 0 : hlcDecode(accountClock).wall,
      // The same comparison the merge makes, and made the same way: the encoding is
      // fixed-width, so the strings sort exactly as the clocks do. Anything else here
      // would let the review promise an outcome the merge then contradicts.
      winner: winnerOf(localClock, accountClock),
    });
  }
  return found;
}

interface Clocked {
  readonly fieldClocks: Readonly<Record<string, string | undefined>>;
  readonly [field: string]: unknown;
}

function winnerOf(localClock: string | undefined, accountClock: string | undefined): ShelfSide {
  if (accountClock === undefined) return "LOCAL";
  if (localClock === undefined) return "ACCOUNT";
  return accountClock > localClock ? "ACCOUNT" : "LOCAL";
}

/**
 * Whether two field values are the same answer.
 *
 * Empty text is not a value: a note somebody cleared and a note nobody ever wrote are the
 * same statement, and treating `""` and `null` as a disagreement would fill the review
 * with rows where both sides say nothing.
 */
function sameValue(a: unknown, b: unknown): boolean {
  return blank(a) && blank(b) ? true : a === b;
}

function blank(value: unknown): boolean {
  return (
    value === null || value === undefined || (typeof value === "string" && value.trim() === "")
  );
}

function entryOf<Record_ extends { readonly id: string }>(
  record: Record_,
  kind: EntryKind,
  side: ShelfSide,
  label: (record: Record_) => EntryLabel,
): OneSidedEntry {
  return {
    ...label(record),
    id: record.id,
    kind,
    side,
    changedAt: stampedAt(record as unknown as { fieldClocks: Readonly<Record<string, string>> }),
  };
}

function byRecency(a: OneSidedEntry, b: OneSidedEntry): number {
  return b.changedAt - a.changedAt;
}

function live<Record_ extends { readonly deletedAt: number | null }>(
  records: readonly Record_[],
): readonly Record_[] {
  return records.filter((record) => record.deletedAt === null);
}
