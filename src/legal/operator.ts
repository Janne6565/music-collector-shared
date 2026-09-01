/**
 * Who runs Rekordo, in the form German law asks for it.
 *
 * Shared rather than duplicated because an Impressum that says one thing on the website and
 * another in the app is worse than no Impressum: § 5 DDG wants one provider, identifiable.
 * Every screen that prints an address, a controller or a contact reads it from here.
 */

export interface Operator {
  readonly name: string;
  readonly street: string;
  /** Postcode and city on one line, the way a German address is written. */
  readonly city: string;
  readonly country: string;
  readonly email: string;
  /**
   * Null when there is no published number. § 5 DDG asks for a way to reach the provider
   * quickly and electronically; an e-mail address answered in good time satisfies that, so
   * a phone number is offered rather than required — and a fake one would be worse than none.
   */
  readonly phone: string | null;
}

export const OPERATOR: Operator = {
  name: "Janne Keipert",
  street: "Marchlewskistraße 102",
  city: "10243 Berlin",
  country: "Deutschland",
  email: "jabbekeipert@gmail.com",
  phone: null,
};

/**
 * The address block, one line per line, for anywhere that prints it whole.
 *
 * A natural person and nothing else. Rekordo is run privately and is not a business, so the
 * app's name has no place between the name and the street: § 5 DDG wants the provider
 * identified, and a product name where a Firma would stand reads as a company that does not
 * exist. If that ever changes, the business name belongs in OPERATOR.name, not here.
 */
export const OPERATOR_ADDRESS_LINES: readonly string[] = [
  OPERATOR.name,
  OPERATOR.street,
  OPERATOR.city,
  OPERATOR.country,
];

/** One line, for footers that have no room for five. */
export const OPERATOR_ONE_LINE = [
  OPERATOR.name,
  OPERATOR.street,
  OPERATOR.city,
  OPERATOR.email,
].join(" · ");

/**
 * The supervisory authority a complaint under Art. 77 DSGVO goes to.
 *
 * It follows the controller's seat, not the user's: someone in Munich still complains to
 * Berlin about us, and naming their own authority instead would send them to the wrong desk.
 */
export const SUPERVISORY_AUTHORITY = {
  name: "Berliner Beauftragte für Datenschutz und Informationsfreiheit",
  address: "Alt-Moabit 59–61, 10555 Berlin",
  url: "https://www.datenschutz-berlin.de",
} as const;

/** The one processor that holds everything: the cluster and the photo bucket both run there. */
export const HOSTING_PROCESSOR = {
  name: "Hetzner Online GmbH",
  address: "Industriestr. 25, 91710 Gunzenhausen, Deutschland",
} as const;
