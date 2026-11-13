/**
 * Uppgifter som visas i villkoren, integritetspolicyn och på kontaktsidan.
 * Fyll i innan sajten öppnas för andra än testare. Lagen om elektronisk handel (8 §) kräver
 * namn, postadress och e-post, och organisationsnummer när det finns ett företag.
 */
export const SITE = {
  name: "Hyrkoll",
  /** Vem som driver sajten, t.ex. ditt namn nu och senare företagets namn. */
  operator: "",
  /** Organisationsnummer (eller momsregistreringsnummer) när det finns ett företag. */
  orgNumber: "",
  /** Postadress dit man kan skicka brev, t.ex. "Gatan 1, 123 45 Stockholm". En c/o-adress går bra. */
  address: "",
  /** E-postadress för frågor, anmälningar och överklaganden. */
  contactEmail: "",
  /** När villkoren och integritetspolicyn senast ändrades. */
  updated: "13 november 2026",
};

export const SITE_INFO_MISSING = !SITE.operator || !SITE.contactEmail || !SITE.address;
export const operatorText = SITE.operator || "[namn på den som driver sajten]";
export const addressText = SITE.address || "[postadress]";
export const contactText = SITE.contactEmail || "[e-postadress]";
/** "Hyrkoll AB (org.nr 559xxx-xxxx)" eller bara namnet när org.nr saknas. */
export const operatorWithOrgText = SITE.orgNumber
  ? `${operatorText} (org.nr ${SITE.orgNumber})`
  : operatorText;
