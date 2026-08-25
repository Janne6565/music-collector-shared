/**
 * The shape of a legal document, and the only two languages it exists in.
 *
 * The app's own UI language is a separate setting: the interface may be English while the
 * documents are read in German, because which document version binds you is a legal question
 * and which language you read menus in is a preference.
 */

/** German is the binding original; English is a courtesy translation of it. */
export type LegalLanguage = "de" | "en";

export const LEGAL_LANGUAGES: readonly LegalLanguage[] = ["de", "en"];

/** The language the German original is written in — the one that wins a dispute. */
export const BINDING_LANGUAGE: LegalLanguage = "de";

/** A string that exists in both languages. Every user-visible word in a document is one. */
export type Localized = { readonly [L in LegalLanguage]: string };

export type LegalDocumentId = "impressum" | "privacy" | "terms";

export interface LegalSection {
  /**
   * Stable across translations and across versions, because it is what a jump link, a
   * section nav and a deep link all point at. Renumbering a section changes its heading,
   * never its id.
   */
  readonly id: string;
  readonly heading: Localized;
  readonly paragraphs: readonly Localized[];
}

export interface LegalDocument {
  readonly id: LegalDocumentId;
  /**
   * What a consent record names. The server stamps its own copy of this at the moment of
   * acceptance rather than trusting the client's, so an old app cannot record consent to a
   * document that has since been rewritten.
   */
  readonly version: string;
  /** ISO date. The "Stand:" / "effective" line at the foot of the document. */
  readonly effective: string;
  readonly title: Localized;
  /** The line above the title — "Angaben gemäß § 5 DDG" and its like. Null where there is none. */
  readonly lede: Localized | null;
  /** The plain-language box before the legal sections. Null where the document is short enough. */
  readonly summary: Localized | null;
  /** True where the headings read "1 · Verantwortlicher" and a jump list is worth drawing. */
  readonly numbered: boolean;
  readonly sections: readonly LegalSection[];
  /**
   * The boxed note after the last section — the sentence a reader is meant to leave with
   * rather than one more numbered clause. Null where the document ends at its sections.
   */
  readonly closing: Localized | null;
}
