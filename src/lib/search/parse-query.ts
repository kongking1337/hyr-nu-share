/**
 * Naturligt språk → sökparametrar.
 * Bygger vidare på `parseSearch` med pris, "nära mig", kapacitet och produktnamn.
 */
import { normalize } from "@/lib/geo";
import { parseSearch } from "@/lib/search-parse";
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
  const notes = [...base.notes];
  const patch: Partial<SearchParams> = {};

  if (base.category) patch.category = base.category;
  if (base.cityName) patch.location = normalize(base.cityName).replace(/ /g, "-");
  if (base.radiusKm) patch.radius = base.radiusKm;
  if (base.startDate) patch.from = base.startDate;
  if (base.endDate) patch.to = base.endDate;
  if (base.sort) {
    const map: Record<string, SortKey> = { price_asc: "total", distance: "distance" };
    patch.sort = map[base.sort] ?? "recommended";
  }

  // "billig" utan explicit sortering → lägsta totalpris
  if (/\bbillig|prisvard|budget/.test(n) && !patch.sort) {
    patch.sort = "total";
    notes.push("Sortering: lägsta totalpris");
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

  // produktnamn (PS5, partytält …) → underkategori
  const term = TERMS.find((t) => n.includes(normalize(t.label)) || normalize(t.label).startsWith(n));
  if (term && !patch.category) {
    patch.category = term.category;
    notes.push(`Kategori: ${term.category}`);
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
