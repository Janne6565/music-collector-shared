import { OPERATOR } from "./operator.js";
import type { LegalDocument } from "./types.js";

/**
 * The Nutzungsbedingungen.
 *
 * German first and English second, in that order on purpose: the German text is the one that
 * binds, and it was written rather than translated. The service is free, which is why the
 * liability clause is the ordinary German staircase rather than a disclaimer of everything —
 * a blanket exclusion would simply be void under § 309 BGB and leave nothing standing.
 */
export const TERMS_OF_USE: LegalDocument = {
  id: "terms",
  version: "1.0",
  effective: "2026-08-25",
  title: { de: "Nutzungsbedingungen", en: "Terms of use" },
  lede: {
    de: "Allgemeine Geschäftsbedingungen für Rekordo",
    en: "General terms and conditions for Rekordo",
  },
  summary: null,
  numbered: true,
  sections: [
    {
      id: "scope",
      heading: { de: "Geltungsbereich und Anbieter", en: "Scope and provider" },
      paragraphs: [
        {
          de: `Diese Bedingungen gelten für die Nutzung der Music-Collector-Apps und der Website, betrieben von ${OPERATOR.name}, ${OPERATOR.street}, ${OPERATOR.city}. Abweichende Bedingungen gelten nur, wenn sie ausdrücklich in Textform vereinbart wurden.`,
          en: `These terms govern your use of the Rekordo apps and website, operated by ${OPERATOR.name}, ${OPERATOR.street}, ${OPERATOR.city}, Germany. Deviating terms apply only where expressly agreed in text form.`,
        },
      ],
    },
    {
      id: "service",
      heading: { de: "Der Dienst", en: "The service" },
      paragraphs: [
        {
          de: "Mit Rekordo erfasst du die Musik, die du besitzt, führst eine Wunschliste und teilst Listen mit Personen deiner Wahl. Die Nutzung ist kostenlos. Ein Anspruch auf ununterbrochene Verfügbarkeit besteht nicht; Wartung und technische Störungen können den Dienst unterbrechen, und Funktionen können sich ändern oder entfallen.",
          en: "Rekordo lets you record the music you own, keep a wishlist and share lists with people you choose. Use is free of charge. There is no claim to uninterrupted availability; maintenance and technical faults can interrupt the service, and features may change or be discontinued.",
        },
      ],
    },
    {
      id: "account",
      heading: { de: "Konto — oder kein Konto", en: "Account, or no account" },
      paragraphs: [
        {
          de: "Du kannst die App ohne Konto nutzen; deine Daten bleiben dann auf deinem Gerät und werden nicht gesichert. Ein Konto setzt eine gültige E-Mail-Adresse und ein Passwort voraus, das du für dich behältst. Du musst mindestens 16 Jahre alt sein.",
          en: "You may use the app without an account, in which case your data stays on your device and is not backed up. An account requires a valid e-mail address and a password you keep to yourself. You must be at least 16 years old.",
        },
      ],
    },
    {
      id: "content",
      heading: { de: "Deine Inhalte", en: "Your content" },
      paragraphs: [
        {
          de: "Exemplare, Fotos und Notizen bleiben deine. Mit dem Teilen einer Liste räumst du uns das einfache Recht ein, diese Inhalte den von dir ausgewählten Personen anzuzeigen, solange die Freigabe besteht. Lade keine Inhalte hoch, an denen du keine Rechte hast, und keine Cover-Scans, die Rechte Dritter verletzen.",
          en: "Items, photos and notes remain yours. By sharing a list you grant us the simple right to display that content to the people you shared it with, for as long as the sharing lasts. Do not upload content you have no rights to, and do not upload cover scans that infringe third-party rights.",
        },
      ],
    },
    {
      id: "catalog",
      heading: { de: "Katalogdaten", en: "Catalogue data" },
      paragraphs: [
        {
          de: "Release-Informationen stammen aus Katalogen Dritter und können unvollständig oder falsch sein. Von dir erfasste Preise sind deine eigenen Angaben und keine Wertermittlung durch uns.",
          en: "Release information comes from third-party catalogues and may be incomplete or wrong. Prices you record are your own entries and are not valuations by us.",
        },
      ],
    },
    {
      id: "liability",
      heading: { de: "Haftung", en: "Liability" },
      paragraphs: [
        {
          de: "Wir haften unbeschränkt für Vorsatz und grobe Fahrlässigkeit, für Verletzungen von Leben, Körper und Gesundheit sowie nach dem Produkthaftungsgesetz. Bei leichter Fahrlässigkeit haften wir nur für die Verletzung einer wesentlichen Vertragspflicht und nur auf den vertragstypisch vorhersehbaren Schaden. Gesetzliche Rechte bleiben unberührt.",
          en: "We are liable without limitation for intent and gross negligence, for injury to life, body and health, and under the Product Liability Act. For slight negligence we are liable only for breach of a material contractual obligation and only up to the foreseeable damage typical for this kind of contract. Statutory rights remain unaffected.",
        },
      ],
    },
    {
      id: "termination",
      heading: { de: "Beendigung der Nutzung", en: "Ending use" },
      paragraphs: [
        {
          de: "Du kannst dein Konto jederzeit und ohne Frist in den Einstellungen löschen. Wir können mit einer Frist von 14 Tagen kündigen, bei schwerwiegenden Verstößen gegen diese Bedingungen auch fristlos.",
          en: "You can delete your account at any time in Settings, with no notice period. We may terminate with 14 days' notice, or immediately for serious breaches of these terms.",
        },
      ],
    },
    {
      id: "changes",
      heading: { de: "Änderungen und anwendbares Recht", en: "Changes and applicable law" },
      paragraphs: [
        {
          de: "Änderungen dieser Bedingungen kündigen wir mindestens 30 Tage vorher per E-Mail oder in der App an; die weitere Nutzung gilt als Zustimmung, und du kannst stattdessen dein Konto löschen. Es gilt deutsches Recht. Bist du Verbraucher, bleiben die zwingenden Verbraucherschutzvorschriften deines Wohnsitzstaates unberührt.",
          en: "We will notify you of changes to these terms at least 30 days in advance by e-mail or in the app; continued use counts as acceptance, and you may delete your account instead. German law applies. If you are a consumer, the mandatory consumer protection law of your country of residence remains unaffected.",
        },
      ],
    },
  ],
  closing: null,
};
