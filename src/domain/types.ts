/**
 * The domain the app stores locally.
 *
 * Three levels, mirroring MusicBrainz and the design deck's screens:
 *
 *   ReleaseGroup  the album            Bitches Brew
 *   Release       a specific edition   Columbia GP 26, 2xLP, US, 1970
 *   Copy          the item you own     VG+, EUR 28, Concerto Amsterdam, 14 Aug 2026
 *
 * `Release` rows are a cache of what the metadata proxy returned. `Copy` and
 * `WishlistItem` are the user's own data — the only records that ever sync.
 */

export const FORMATS = ["VINYL", "CD", "CASSETTE", "DIGITAL", "OTHER"] as const;
export type Format = (typeof FORMATS)[number];

/** The Goldmine grading scale, which screen 1l names as the default. */
export const CONDITIONS = ["M", "NM", "VG_PLUS", "VG", "G_PLUS", "G", "F", "P"] as const;
export type Condition = (typeof CONDITIONS)[number];

export interface CoverTheme {
  readonly dominantColor: string;
  readonly accentColor: string;
  /**
   * Perceptual lightness (CIE L*), normalised to 0..1 — not WCAG relative luminance,
   * which is linear light and would put mid-grey at 0.22.
   */
  readonly lightness: number;
  /** Precomputed by the server so the theme is right on first paint, before the image loads. */
  readonly dark: boolean;
}

/**
 * A person or group, as the search offers them (screens 10a/10b).
 *
 * `disambiguation` is load-bearing, not decoration: MusicBrainz holds several distinct
 * artists called "Daughter", and that one line ("UK indie folk band fronted by Elena
 * Tonra") is frequently the only thing separating them in a list.
 */
export interface Artist {
  readonly mbid: string;
  readonly name: string;
  /** Empty rather than null when the archive has none, so no caller has to guard it. */
  readonly disambiguation: string;
  /** "Group" or "Person" as MusicBrainz classifies it, when it knows. */
  readonly type: string | null;
  readonly country: string | null;
  readonly beganIn: string | null;
  readonly endedIn: string | null;
  /** MusicBrainz's own match confidence, 0-100. An exact name scores 100. */
  readonly score: number | null;
}

/**
 * A release group — the album, above the pressings of it.
 *
 * A discography lists these rather than releases because listing it by pressing is
 * unreadable: Miles Davis has 51 albums and over 1400 releases, and Bitches Brew alone
 * accounts for 47 of them.
 */
export interface Album {
  readonly albumId: string;
  readonly title: string;
  readonly artistName: string;
  readonly year: number | null;
  /** Album, EP, Single, Broadcast, Compilation — how the artist screen sections itself. */
  readonly primaryType: string | null;
  readonly coverArtUrl: string | null;
}

export interface Release {
  /**
   * Source-qualified: "musicbrainz:<uuid>" or "discogs:<int>".
   *
   * The app reads two catalogues and they share no identifiers, so an id has to say where
   * it came from. Source and id are one value rather than two fields on purpose — see the
   * note on Copy.releaseId.
   */
  readonly id: string;
  /** The album this is a pressing of, source-qualified the same way. */
  readonly albumId: string;
  readonly title: string;
  readonly artistName: string;
  readonly year: number | null;
  readonly format: Format;
  readonly label: string | null;
  readonly catalogNumber: string | null;
  readonly country: string | null;
  readonly barcode: string | null;
  /** Partial dates are normal: "1970", "1970-03" and "1970-03-30" all occur. */
  readonly releaseDate: string | null;
  readonly trackCount: number | null;
  readonly discCount: number | null;
  readonly coverArtUrl: string | null;
  readonly coverTheme: CoverTheme | null;
  /** When this cache row was written, so it can be refreshed later. */
  readonly cachedAt: number;
}

/**
 * Fields of a Copy that sync independently. Each carries its own clock, so two devices
 * editing different fields of the same copy both keep their edit.
 */
export const COPY_MERGEABLE_FIELDS = [
  "releaseId",
  "condition",
  "sleeveCondition",
  "preferCatalogArt",
  "pricePaidCents",
  "currency",
  "purchasedOn",
  "purchasedAt",
  "notes",
  "rating",
  "deletedAt",
] as const;
export type CopyMergeableField = (typeof COPY_MERGEABLE_FIELDS)[number];

/** Encoded HLC stamps, one per mergeable field. */
export type FieldClocks<Field extends string> = Readonly<Record<Field, string>>;

export interface Copy {
  /** Client-generated, so a record created offline never collides on sync. */
  readonly id: string;
  /**
   * Which release this is a copy of, source-qualified ("musicbrainz:<uuid>",
   * "discogs:<int>").
   *
   * One field rather than a source beside an id: this is a mergeable value, so as two
   * fields each would merge under its own clock and one device's source could pair with
   * another device's id — a copy pointing at nothing. One field makes that
   * unrepresentable.
   */
  readonly releaseId: string;
  /**
   * The media grade. Named `condition` rather than `mediaCondition` because it is the
   * field that already syncs — renaming it would have meant a coordinated rename of the
   * merge contract in three repositories for no gain.
   */
  readonly condition: Condition | null;
  /**
   * The sleeve grade, judged separately from the media. A near-mint record in a ring-worn
   * jacket is a different object from a near-mint one in a near-mint jacket, and that is
   * how sellers list them.
   */
  readonly sleeveCondition: Condition | null;
  /**
   * Show the catalogue's artwork for this copy rather than its own first photo.
   *
   * Everything else about "which picture stands for this record" is the order of the photo
   * list — starring a photo moves it to the front, and the front one is what the grid and
   * the hero draw. The catalogue cover cannot be expressed that way: it is not a Photo, it
   * belongs to the release rather than to the copy, and it has no position to be moved to.
   * So the one choice the order cannot represent gets a flag, and only that one.
   *
   * A boolean rather than a nullable photo id, because "the catalogue" is the only value
   * the order could not already have said. Mergeable, so the two devices that disagree
   * about it converge like they do about a grade; false is both the default and what a
   * client older than this field sends.
   */
  readonly preferCatalogArt: boolean;
  readonly pricePaidCents: number | null;
  readonly currency: string;
  /** ISO date, no time — you know the day you bought a record, not the minute. */
  readonly purchasedOn: string | null;
  readonly purchasedAt: string | null;
  readonly notes: string | null;
  /**
   * The other device's version of the notes, when a merge found two different ones.
   *
   * Notes are the one long free-text field, so plain last-write-wins would silently
   * discard a paragraph someone wrote elsewhere. The winner still becomes `notes`; the
   * loser is kept here for the person to reconcile, and the detail screen surfaces it.
   *
   * Derived by the merge from its two inputs rather than written by a device, so it
   * carries no clock of its own.
   */
  readonly notesConflict: string | null;
  readonly rating: number | null;
  readonly createdAt: number;
  /** Tombstone. Deletes have to be represented, or sync would resurrect the row. */
  readonly deletedAt: number | null;
  readonly fieldClocks: FieldClocks<CopyMergeableField>;
}

/**
 * Fields of a WishlistItem that sync independently, mirroring how a Copy works. A wish is
 * edited less often than a copy, but sharing the machinery costs less than inventing a
 * second, subtly different merge.
 */
export const WISH_MERGEABLE_FIELDS = [
  "albumId",
  "title",
  "artistName",
  "year",
  "desiredFormat",
  "note",
  "deletedAt",
] as const;
export type WishMergeableField = (typeof WISH_MERGEABLE_FIELDS)[number];

export interface WishlistItem {
  /** Client-generated, so an item added offline keeps its identity when it syncs. */
  readonly id: string;
  readonly albumId: string;
  readonly title: string;
  readonly artistName: string;
  readonly year: number | null;
  /** A wish is for an album in a format, not for one specific pressing. */
  readonly desiredFormat: Format | null;
  readonly note: string | null;
  readonly createdAt: number;
  readonly deletedAt: number | null;
  readonly fieldClocks: FieldClocks<WishMergeableField>;
}

/**
 * Fields of a Photo that sync independently.
 *
 * The bytes are immutable — a photo id points at one image forever — so `storageKey`,
 * `contentType` and `byteSize` only ever change from "not uploaded yet" to "uploaded".
 * What genuinely moves is where it sits in the strip and whether it was deleted.
 */
export const PHOTO_MERGEABLE_FIELDS = [
  "copyId",
  "storageKey",
  "contentType",
  "byteSize",
  "sortIndex",
  "deletedAt",
] as const;
export type PhotoMergeableField = (typeof PHOTO_MERGEABLE_FIELDS)[number];

export interface Photo {
  /** Client-generated: the photo exists on the device before it is ever uploaded. */
  readonly id: string;
  readonly copyId: string;
  /**
   * Where the bytes live in object storage, or null while the photo is still only on this
   * device. This *is* the upload state — a separate flag could disagree with reality.
   */
  readonly storageKey: string | null;
  readonly contentType: string;
  readonly byteSize: number;
  readonly sortIndex: number;
  readonly createdAt: number;
  readonly deletedAt: number | null;
  readonly fieldClocks: FieldClocks<PhotoMergeableField>;
}

export interface CollectionStats {
  readonly copyCount: number;
  readonly releaseGroupCount: number;
  readonly totalSpentCents: number;
  readonly averageSpentCents: number;
  readonly byFormat: Readonly<Record<Format, number>>;
}

export const CONDITION_LABELS: Readonly<Record<Condition, string>> = {
  M: "Mint",
  NM: "Near Mint",
  VG_PLUS: "Very Good Plus",
  VG: "Very Good",
  G_PLUS: "Good Plus",
  G: "Good",
  F: "Fair",
  P: "Poor",
};

/** The short form the design deck shows on badges ("VG+", "NM"). */
export const CONDITION_SHORT: Readonly<Record<Condition, string>> = {
  M: "M",
  NM: "NM",
  VG_PLUS: "VG+",
  VG: "VG",
  G_PLUS: "G+",
  G: "G",
  F: "F",
  P: "P",
};

export const FORMAT_LABELS: Readonly<Record<Format, string>> = {
  VINYL: "Vinyl",
  CD: "CD",
  CASSETTE: "Cassette",
  DIGITAL: "Digital",
  OTHER: "Other",
};
