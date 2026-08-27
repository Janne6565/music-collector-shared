import { OPERATOR, OPERATOR_ADDRESS_LINES } from "./operator.js";
import type { LegalDocument } from "./types.js";

/**
 * Provider identification under § 5 DDG.
 *
 * Short, and every line of it is a legal requirement rather than a choice — except the
 * catalogue attribution, which sits here because MusicBrainz and Discogs ask to be credited
 * where a reader will actually find it, and nobody scrolls a privacy policy looking for it.
 *
 * A paragraph may contain "\n": renderers break those into lines rather than paragraphs, so
 * an address stays an address.
 */
export const IMPRESSUM: LegalDocument = {
  id: "impressum",
  version: "1.0",
  effective: "2026-08-25",
  title: { de: "Impressum", en: "Impressum" },
  lede: {
    de: "Angaben gemäß § 5 DDG",
    en: "Provider identification under § 5 DDG (German Digital Services Act)",
  },
  summary: null,
  numbered: false,
  closing: null,
  sections: [
    {
      id: "provider",
      heading: { de: "Anbieter", en: "Provider" },
      paragraphs: [
        { de: OPERATOR_ADDRESS_LINES.join("\n"), en: OPERATOR_ADDRESS_LINES.join("\n") },
      ],
    },
    {
      id: "contact",
      heading: { de: "Kontakt", en: "Contact" },
      paragraphs: [
        { de: `E-Mail: ${OPERATOR.email}`, en: `E-mail: ${OPERATOR.email}` },
        // Printed only when there is a number to print. § 5 DDG asks for quick electronic
        // contact, not for a telephone, and inventing one to fill the line would be the
        // one thing an Impressum must never do.
        ...(OPERATOR.phone === null
          ? [
              {
                de: "Rekordo wird als privates Projekt betrieben; eine Rufnummer wird nicht veröffentlicht. Anfragen per E-Mail werden zeitnah beantwortet.",
                en: "Rekordo is run as a private project and publishes no telephone number. E-mail enquiries are answered promptly.",
              },
            ]
          : [{ de: `Telefon: ${OPERATOR.phone}`, en: `Telephone: ${OPERATOR.phone}` }]),
      ],
    },
    {
      id: "vat",
      heading: { de: "Umsatzsteuer", en: "VAT" },
      paragraphs: [
        {
          de: "Als Kleinunternehmer im Sinne von § 19 Abs. 1 UStG wird keine Umsatzsteuer berechnet und daher auch keine Umsatzsteuer-Identifikationsnummer geführt.",
          en: "As a small business under § 19 (1) UStG no VAT is charged, and no VAT identification number is held.",
        },
      ],
    },
    {
      id: "editorial",
      heading: { de: "Verantwortlich für den Inhalt", en: "Responsible for the content" },
      paragraphs: [
        {
          de: `Nach § 18 Abs. 2 MStV: ${OPERATOR.name}, Anschrift wie oben.`,
          en: `Under § 18 (2) MStV: ${OPERATOR.name}, address as above.`,
        },
      ],
    },
    {
      id: "dispute",
      heading: { de: "Verbraucherstreitbeilegung", en: "Consumer dispute resolution" },
      paragraphs: [
        {
          de: "Wir sind nicht verpflichtet und nicht bereit, an einem Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.",
          en: "We are neither obliged nor willing to take part in dispute resolution proceedings before a consumer arbitration body.",
        },
      ],
    },
    {
      id: "liability",
      heading: { de: "Haftung für Inhalte und Links", en: "Liability for content and links" },
      paragraphs: [
        {
          de: "Für eigene Inhalte sind wir nach den allgemeinen Gesetzen verantwortlich, jedoch nicht verpflichtet, von Nutzern eingestellte Inhalte laufend auf Rechtsverstöße zu überwachen. Für verlinkte externe Seiten ist deren jeweiliger Anbieter verantwortlich; bei Bekanntwerden von Rechtsverstößen entfernen wir solche Links unverzüglich.",
          en: "We are responsible for our own content under the general laws, but are not obliged to monitor content uploaded by users for infringements. The respective provider is responsible for the content of linked external pages; where we learn of an infringement we remove such links without delay.",
        },
      ],
    },
    {
      id: "catalog",
      heading: { de: "Katalogdaten", en: "Catalogue data" },
      paragraphs: [
        {
          de: "Release- und Coverdaten stammen von MusicBrainz und Discogs und stehen unter den Lizenzbedingungen der jeweiligen Anbieter. Rechte an Coverabbildungen liegen bei den Rechteinhabern.",
          en: "Release and cover data come from MusicBrainz and Discogs and are subject to those providers' licence terms. Rights in cover artwork remain with their rights holders.",
        },
      ],
    },
  ],
};
