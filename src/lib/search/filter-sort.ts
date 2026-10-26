import { distanceKm, inRegion } from "@/lib/geo";
import { listPrice } from "@/lib/pricing";
import type { UnifiedResult } from "@/lib/providers/types";
import { matchesAttrFilter, parseAttrFilter, subCategoryOf } from "./attributes";
import type { Center } from "./useSearchResults";
import type { SearchParams } from "./params";

/**
 * Första versionen filtrerar på typ, kategori, plats, pris och säljare.
 * Övriga fält i SearchParams (datum, leverans, bokningssätt …) finns kvar för gamla länkar men används inte.
 */
export function filterResults(results: UnifiedResult[], p: SearchParams, center: Center): UnifiedResult[] {
  const attrs = parseAttrFilter(p.attrs);
  return results.filter((r) => {
    if (!inRegion(r.city)) return false;
    if (p.type !== "all" && r.listingType !== p.type) return false;
    if (p.category !== "all" && r.category !== p.category) return false;
    if (p.sub !== "all" && subCategoryOf(r) !== p.sub) return false;
    if (!center.wholeRegion && distanceKm(center.lat, center.lng, r.lat, r.lng) > p.radius) return false;

    const price = listPrice(r);
    if (p.priceMin && price < p.priceMin) return false;
    if (p.priceMax && price > p.priceMax) return false;

    if (p.owner !== "all" && r.ownerType !== p.owner) return false;
    if (!matchesAttrFilter(r, attrs)) return false;
    return true;
  });
}

export function sortResults(results: UnifiedResult[], p: SearchParams, center: Center): UnifiedResult[] {
  const dist = (r: UnifiedResult) =>
    center.wholeRegion ? 0 : distanceKm(center.lat, center.lng, r.lat, r.lng);
  const newest = (a: UnifiedResult, b: UnifiedResult) =>
    (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
  return [...results].sort((a, b) => {
    switch (p.sort) {
      case "price":
        return listPrice(a) - listPrice(b);
      case "price_desc":
        return listPrice(b) - listPrice(a);
      case "distance":
        return dist(a) - dist(b);
      case "newest":
        return newest(a, b);
      default:
        // Riktiga annonser före exempelannonser, sedan närmast, sedan nyast.
        return Number(!!a.example) - Number(!!b.example) || dist(a) - dist(b) || newest(a, b);
    }
  });
}
