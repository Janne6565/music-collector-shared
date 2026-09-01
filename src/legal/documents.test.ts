import { describe, expect, it } from "vitest";
import { LEGAL_DOCUMENTS, legalDocument, sectionChip, sectionLabel } from "./documents.js";
import { OPERATOR, OPERATOR_ADDRESS_LINES, OPERATOR_ONE_LINE } from "./operator.js";
import { LEGAL_LANGUAGES } from "./types.js";

/**
 * These are content, not logic, so the tests are about the ways content goes wrong: a
 * section translated on one side only, a version that never moved when the text did, an
 * Impressum missing the line § 5 DDG actually asks for.
 */
describe("legal documents", () => {
  it("carries every document in both languages, with nothing blank", () => {
    for (const document of LEGAL_DOCUMENTS) {
      for (const language of LEGAL_LANGUAGES) {
        expect(document.title[language].trim(), `${document.id} title ${language}`).not.toBe("");
        for (const section of document.sections) {
          expect(section.heading[language].trim(), `${document.id}/${section.id}`).not.toBe("");
          expect(section.paragraphs.length, `${document.id}/${section.id}`).toBeGreaterThan(0);
          for (const paragraph of section.paragraphs) {
            expect(paragraph[language].trim(), `${document.id}/${section.id}`).not.toBe("");
          }
        }
      }
    }
  });

  it("keeps section ids unique inside a document, since links point at them", () => {
    for (const document of LEGAL_DOCUMENTS) {
      const ids = document.sections.map((section) => section.id);
      expect(new Set(ids).size, document.id).toBe(ids.length);
    }
  });

  it("dates and versions every document", () => {
    for (const document of LEGAL_DOCUMENTS) {
      expect(document.version, document.id).toMatch(/^\d+\.\d+$/);
      expect(document.effective, document.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("says who the provider is, which is the whole point of the Impressum", () => {
    const impressum = legalDocument("impressum");
    const german = impressum.sections.flatMap((section) =>
      section.paragraphs.map((paragraph) => paragraph.de),
    );
    expect(german.join("\n")).toContain(OPERATOR.name);
    expect(german.join("\n")).toContain(OPERATOR.street);
    expect(german.join("\n")).toContain(OPERATOR.email);
  });

  it("numbers the headings of the long documents and leaves the Impressum alone", () => {
    const privacy = legalDocument("privacy");
    expect(sectionLabel(privacy, 0, "de")).toBe("1 · Verantwortlicher");
    expect(sectionChip(privacy, 2, "de")).toBe("3 Rechtsgrundlagen");
    expect(sectionLabel(legalDocument("impressum"), 0, "de")).toBe("Anbieter");
  });

  it("names the operator in one line for a footer with no room", () => {
    expect(OPERATOR_ONE_LINE).toContain(OPERATOR.city);
    expect(OPERATOR_ONE_LINE.split(" · ")).toHaveLength(4);
  });

  it("claims no company, because there is none", () => {
    const impressum = legalDocument("impressum");
    const text = impressum.sections
      .flatMap((section) => section.paragraphs.flatMap((paragraph) => [paragraph.de, paragraph.en]))
      .join("\n");
    // Rekordo is run privately. Every one of these words would assert a business that does
    // not exist, and an Impressum that invents a trader is worse than one that omits a line.
    for (const claim of ["Kleinunternehmer", "UStG", "USt-IdNr", "GmbH"]) {
      expect(text, claim).not.toContain(claim);
    }
    // The address block is a person, not a letterhead: name, street, city, country.
    expect(OPERATOR_ADDRESS_LINES).toHaveLength(4);
    expect(OPERATOR_ADDRESS_LINES).not.toContain("Rekordo");
  });

  it("promises no telephone number it does not publish", () => {
    const impressum = legalDocument("impressum");
    const text = impressum.sections
      .flatMap((section) => section.paragraphs.map((paragraph) => paragraph.de))
      .join("\n");
    // The phone line is printed from OPERATOR.phone, so a document that talks about a
    // number while the constant is null is a document that lies.
    expect(text.includes("Telefon:")).toBe(OPERATOR.phone !== null);
  });
});
