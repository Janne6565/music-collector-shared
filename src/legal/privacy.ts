import { HOSTING_PROCESSOR, OPERATOR, SUPERVISORY_AUTHORITY } from "./operator.js";
import type { LegalDocument } from "./types.js";

/**
 * The Datenschutzerklärung.
 *
 * It is written to be true of the app as built rather than to be safe: the local-only mode
 * really does keep the collection off the server, the catalogue lookup really does leak an
 * IP address to two American organisations, and both are said plainly instead of being
 * covered by a sentence about "technical partners". If a section here stops matching the
 * code, the code is the bug or the section is — either way the version below moves.
 */
export const PRIVACY_POLICY: LegalDocument = {
  id: "privacy",
  version: "1.0",
  effective: "2026-08-25",
  title: { de: "Datenschutzerklärung", en: "Privacy policy" },
  lede: {
    de: "Informationen nach Art. 13 und 14 DSGVO",
    en: "Information under Art. 13 and 14 GDPR",
  },
  summary: {
    de: "Kurz gefasst: Wir speichern dein Konto und deine Sammlung, um die App zu betreiben. Kein Tracking, keine Werbung, keine Weitergabe an Dritte zu Werbezwecken. Geteilt wird nur, was du selbst freigibst.",
    en: "In short: we store your account and your collection in order to run the app. No tracking, no advertising, no passing your data to third parties for advertising. The only things shared are the ones you share yourself.",
  },
  numbered: true,
  sections: [
    {
      id: "controller",
      heading: { de: "Verantwortlicher", en: "Controller" },
      paragraphs: [
        {
          de: `${OPERATOR.name}, ${OPERATOR.street}, ${OPERATOR.city}, ${OPERATOR.email}. Ein Datenschutzbeauftragter ist nicht bestellt, da die Voraussetzungen des § 38 BDSG nicht vorliegen.`,
          en: `${OPERATOR.name}, ${OPERATOR.street}, ${OPERATOR.city}, Germany, ${OPERATOR.email}. No data protection officer has been appointed, as the conditions of § 38 BDSG are not met.`,
        },
      ],
    },
    {
      id: "data",
      heading: { de: "Welche Daten wir verarbeiten", en: "What data we process" },
      paragraphs: [
        {
          de: "Kontodaten: E-Mail-Adresse, Passwort-Hash, Anzeigename, optional ein Handle. Bei Anmeldung über Google oder Apple zusätzlich die von dort übermittelte Kennung und E-Mail-Adresse.",
          en: "Account data: e-mail address, password hash, display name, optionally a handle. If you sign in with Google or Apple, additionally the identifier and e-mail address those services pass on.",
        },
        {
          de: "Sammlungsdaten: deine Exemplare mit Format, Zustand, Kaufpreis, Fundort, Notizen, Bewertungen und selbst hochgeladenen Fotos, deine Wunschliste sowie Freundschaften und Freigabe-Einstellungen.",
          en: "Collection data: your copies with format, condition, purchase price, where you found them, notes, ratings and the photos you upload, your wishlist, plus friendships and sharing settings.",
        },
        {
          de: "Technische Daten: IP-Adresse, Zeitpunkt und angefragte Ressource in Server-Logs. Einwilligungsnachweise: welches Dokument in welcher Fassung wann angenommen wurde.",
          en: "Technical data: IP address, timestamp and requested resource in server logs. Consent records: which document, in which version, was accepted when.",
        },
        {
          de: "Ohne Konto bleiben Sammlungsdaten ausschließlich auf deinem Gerät. Es gibt dann keine Kopie bei uns — auch keine, die wir auf Anfrage herausgeben könnten.",
          en: "Without an account your collection data stays on your device alone. There is then no copy with us — not even one we could hand over on request.",
        },
      ],
    },
    {
      id: "legal-bases",
      heading: { de: "Rechtsgrundlagen", en: "Legal bases" },
      paragraphs: [
        {
          de: "Konto und Synchronisierung: Art. 6 Abs. 1 lit. b DSGVO (Vertrag). Freundesliste, Handle-Suche und öffentliche Profile: Art. 6 Abs. 1 lit. a DSGVO (Einwilligung, jederzeit in den Freigabe-Einstellungen widerrufbar). Server-Logs und Missbrauchsabwehr: Art. 6 Abs. 1 lit. f DSGVO. Einwilligungsnachweise: Art. 6 Abs. 1 lit. c DSGVO in Verbindung mit Art. 7 Abs. 1 DSGVO.",
          en: "Account and synchronisation: Art. 6 (1) (b) GDPR (contract). Friends list, handle search and public profiles: Art. 6 (1) (a) GDPR (consent, withdrawable at any time in the sharing settings). Server logs and abuse prevention: Art. 6 (1) (f) GDPR. Consent records: Art. 6 (1) (c) in conjunction with Art. 7 (1) GDPR.",
        },
        {
          de: "Die Speicherung auf deinem Gerät ist für den Betrieb der App unbedingt erforderlich und daher nach § 25 Abs. 2 Nr. 2 TDDDG einwilligungsfrei. Analyse-, Werbe- oder Tracking-Technologien setzen wir nicht ein; ein Cookie-Banner gibt es deshalb nicht.",
          en: "Storage on your device is strictly necessary for the app to work and therefore needs no consent under § 25 (2) no. 2 TDDDG. We use no analytics, advertising or tracking technologies; that is why there is no cookie banner.",
        },
      ],
    },
    {
      id: "recipients",
      heading: { de: "Empfänger und Auftragsverarbeiter", en: "Recipients and processors" },
      paragraphs: [
        {
          de: `Hosting: ${HOSTING_PROCESSOR.name}, ${HOSTING_PROCESSOR.address}. Server und Foto-Speicher stehen in Deutschland; die Verarbeitung erfolgt auf Grundlage eines Auftragsverarbeitungsvertrags nach Art. 28 DSGVO.`,
          en: `Hosting: ${HOSTING_PROCESSOR.name}, ${HOSTING_PROCESSOR.address}. Servers and photo storage are located in Germany; processing takes place under a data processing agreement pursuant to Art. 28 GDPR.`,
        },
        {
          de: "Katalogabfragen: bei Suche und Barcode-Scan werden Suchbegriff und IP-Adresse an die MusicBrainz Foundation (USA) und Discogs / Zink Media (USA) übermittelt, gestützt auf Art. 6 Abs. 1 lit. b DSGVO und die Standardvertragsklauseln. Wer das vermeiden möchte, legt Exemplare von Hand an — dann findet keine Abfrage statt.",
          en: "Catalogue lookups: when you search or scan a barcode, the search term and your IP address are transmitted to the MusicBrainz Foundation (USA) and Discogs / Zink Media (USA), on the basis of Art. 6 (1) (b) GDPR and the standard contractual clauses. If you would rather avoid this, enter copies by hand — no lookup is then made.",
        },
        {
          de: "E-Mail-Versand (Passwort zurücksetzen): über unseren eigenen Mail-Dienst auf derselben Infrastruktur. Anmeldung über Google oder Apple: dabei erfährt der jeweilige Anbieter, dass du dich bei Music Collector anmeldest. Keine Analyse-, Werbe- oder Tracking-Dienste, keine Nutzungsprofile, kein Verkauf von Daten.",
          en: "E-mail delivery (password resets): through our own mail service on the same infrastructure. Signing in with Google or Apple: the provider concerned learns that you are signing in to Music Collector. No analytics, advertising or tracking services, no usage profiles, no sale of data.",
        },
      ],
    },
    {
      id: "retention",
      heading: { de: "Speicherdauer", en: "Retention" },
      paragraphs: [
        {
          de: "Kontodaten und Sammlungsdaten bis zur Löschung des Kontos, danach längstens 30 Tage in Backups. Server-Logs 14 Tage. Einwilligungsnachweise bis drei Jahre nach Ende der Nutzung, weil sie der Nachweispflicht aus Art. 7 Abs. 1 DSGVO dienen.",
          en: "Account and collection data until the account is deleted, then for at most 30 days in backups. Server logs for 14 days. Consent records for up to three years after use ends, because they serve the duty to demonstrate consent under Art. 7 (1) GDPR.",
        },
        {
          de: "Nach der Löschung bleiben geteilte Inhalte nicht bei anderen Nutzern zurück: Freigaben werden mit dem Konto entfernt, nicht nur unsichtbar geschaltet.",
          en: "After deletion, shared content does not linger with other users: shares are removed with the account rather than merely hidden.",
        },
      ],
    },
    {
      id: "rights",
      heading: { de: "Deine Rechte", en: "Your rights" },
      paragraphs: [
        {
          de: "Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21). Eine erteilte Einwilligung kannst du jederzeit mit Wirkung für die Zukunft widerrufen (Art. 7 Abs. 3).",
          en: "Access (Art. 15), rectification (Art. 16), erasure (Art. 17), restriction (Art. 18), data portability (Art. 20) and objection (Art. 21). Consent you have given can be withdrawn at any time with effect for the future (Art. 7 (3)).",
        },
        {
          de: "Auskunft, Berichtigung, Export, Widerruf und Löschung erledigst du direkt in der App unter Deine Daten. Was sich nicht automatisch erledigen lässt, beantworten wir innerhalb eines Monats nach Art. 12 Abs. 3 DSGVO.",
          en: "Access, rectification, export, withdrawal and deletion are all handled directly in the app under Your data. Anything that cannot be handled automatically is answered within one month, as required by Art. 12 (3) GDPR.",
        },
        {
          de: `Beschwerderecht: ${SUPERVISORY_AUTHORITY.name}, ${SUPERVISORY_AUTHORITY.address}.`,
          en: `Right to complain: ${SUPERVISORY_AUTHORITY.name}, ${SUPERVISORY_AUTHORITY.address}.`,
        },
      ],
    },
  ],
  closing: {
    de: "Eine automatisierte Entscheidungsfindung oder ein Profiling nach Art. 22 DSGVO findet nicht statt.",
    en: "No automated decision-making or profiling within the meaning of Art. 22 GDPR takes place.",
  },
};
