import { CATEGORY_SYNONYMS } from "@/lib/search-parse";

/**
 * Kategorier som visas på sajten (startsidan, sökfiltret och "Lägg upp annons").
 * Ta bort en slug här för att dölja kategorin, t.ex. för att lansera med bara
 * verktyg, släp och maskiner. Kategorierna finns kvar i databasen.
 */
const ACTIVE_SLUGS = ["slapvagn", "verktyg", "kamera", "fest", "tradgard", "fritid", "bygg", "barn"];

export const ACTIVE_CATEGORIES = ACTIVE_SLUGS.filter((slug) => CATEGORY_SYNONYMS[slug]).map((slug) => ({
  slug,
  name: CATEGORY_SYNONYMS[slug]!.name,
}));
