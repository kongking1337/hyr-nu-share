/**
 * Naturligt språk → sökparametrar.
 * Bygger vidare på `parseSearch` med pris, "nära mig", kapacitet och produktnamn.
 */
import { normalize } from "@/lib/geo";
import { CATEGORY_SYNONYMS, parseSearch } from "@/lib/search-parse";
import { TERMS } from "./suggest";
import { SUBCATEGORIES } from "./attributes";
import type { SearchParams, SortKey } from "./params";

export type QueryIntent = {
  patch: Partial<SearchParams>;
  notes: string[];
};

export function interpretQuery(raw: string): QueryIntent {
  const base = parseSearch(raw);
  const n = normalize(raw);
  // Betyg används inte i första versionen, så det visas inte som tolkning.
  const notes = base.notes
    .filter((note) => !/bäst betyg/.test(note))
    .map((note) => (note === "Sortering: lägsta totalpris" ? "Sortering: lägst pris" : note));
  const patch: Partial<SearchParams> = {};

  if (base.category) patch.category = base.category;
  // "i helgen", "i morgon", "på lördag" → bara saker som är lediga de dagarna.
  if (base.startDate && base.endDate) {
    patch.from = base.startDate;
    patch.to = base.endDate;
  }
  if (base.cityName) patch.location = normalize(base.cityName).replace(/ /g, "-");
  if (base.radiusKm) patch.radius = base.radiusKm;
  if (base.sort) {
    const map: Record<string, SortKey> = { price_asc: "price", distance: "distance" };
    patch.sort = map[base.sort] ?? "recommended";
  }

  // "billig" utan explicit sortering → lägst pris
  if (/\bbillig|prisvard|budget/.test(n) && !patch.sort) {
    patch.sort = "price";
    notes.push("Sortering: lägst pris");
  }

  // "nära mig"
  if (/nara mig|narheten|i narheten|omkring mig/.test(n)) {
    patch.sort = patch.sort ?? "distance";
    patch.radius = patch.radius ?? 10;
    notes.push("Plats: nära mig");
  }

  // "under 500 kr", "max 300 kr"
  const price = n.match(/(?:under|max|hogst|billigare an)\s+(\d{2,5})\s*(kr|sek)?/);
  if (price) {
    patch.priceMax = Number(price[1]);
    notes.push(`Maxpris: ${price[1]} kr`);
  }

  // "för 50 personer" → kapacitetsledtråd
  const cap = n.match(/(?:for|till)\s+(\d{1,4})\s*(personer|pers|gaster)/);
  if (cap) notes.push(`Kapacitet: ${cap[1]} personer`);

  // produktnamn (PS5, partytält …) → underkategori. Inte för en tom sökning: "" är början
  // på alla ord, så tomma sökningar hamnade i den första kategorin (Verktyg).
  const term = n
    ? TERMS.find((t) => n.includes(normalize(t.label)) || (n.length >= 3 && normalize(t.label).startsWith(n)))
    : undefined;
  if (term && !patch.category) {
    patch.category = term.category;
    notes.push(`Kategori: ${CATEGORY_SYNONYMS[term.category]?.name ?? term.category}`);
  }
  const cat = patch.category;
  if (cat && SUBCATEGORIES[cat]) {
    const sub = SUBCATEGORIES[cat].find((s) => s.words.some((w) => n.includes(normalize(w))));
    if (sub) {
      patch.sub = sub.slug;
      notes.push(`Typ: ${sub.name}`);
    }
  }

  return { patch, notes };
}
