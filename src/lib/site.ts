/**
 * Uppgifter som visas i villkoren, integritetspolicyn och på kontaktsidan.
 * Fyll i innan sajten öppnas för andra än testare.
 */
export const SITE = {
  name: "Hyrkoll",
  /** Vem som driver sajten, t.ex. ditt namn nu och senare företagets namn och org.nr. */
  operator: "",
  /** E-postadress för frågor, anmälningar och överklaganden. */
  contactEmail: "",
  /** När villkoren och integritetspolicyn senast ändrades. */
  updated: "1 november 2026",
};

export const SITE_INFO_MISSING = !SITE.operator || !SITE.contactEmail;
export const operatorText = SITE.operator || "[namn på den som driver sajten]";
export const contactText = SITE.contactEmail || "[e-postadress]";
