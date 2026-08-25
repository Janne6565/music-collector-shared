import { IMPRESSUM } from "./impressum.js";
import { PRIVACY_POLICY } from "./privacy.js";
import { TERMS_OF_USE } from "./terms.js";
import type { LegalDocument, LegalDocumentId, LegalLanguage, Localized } from "./types.js";

/**
 * The three documents, in the order they are listed everywhere: who we are, what we do with
 * your data, what you agreed to.
 */
export const LEGAL_DOCUMENTS: readonly LegalDocument[] = [IMPRESSUM, PRIVACY_POLICY, TERMS_OF_USE];

export function legalDocument(id: LegalDocumentId): LegalDocument {
  const found = LEGAL_DOCUMENTS.find((document) => document.id === id);
  // Unreachable through the typed API; a runtime id from a URL segment can still miss.
  if (found === undefined) throw new Error(`Unknown legal document: ${id}`);
  return found;
}

/** Reads one side of a localized string. The single place a language choice is spent. */
export function localized(value: Localized, language: LegalLanguage): string {
  return value[language];
}

/**
 * The heading as the document draws it: numbered documents carry their position, and the
 * number comes from the order in the array rather than from the section, so inserting a
 * section renumbers the rest instead of leaving two "4"s.
 */
export function sectionLabel(
  document: LegalDocument,
  index: number,
  language: LegalLanguage,
): string {
  const heading = document.sections[index].heading[language];
  return document.numbered ? `${index + 1} · ${heading}` : heading;
}

/** The short chip in a jump list: "3 Rechtsgrundlagen" without the separator. */
export function sectionChip(
  document: LegalDocument,
  index: number,
  language: LegalLanguage,
): string {
  const heading = document.sections[index].heading[language];
  return document.numbered ? `${index + 1} ${heading}` : heading;
}

export { IMPRESSUM, PRIVACY_POLICY, TERMS_OF_USE };
export * from "./operator.js";
export * from "./types.js";
