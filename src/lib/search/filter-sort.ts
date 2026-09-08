import { distanceKm } from "@/lib/geo";
import { bestBasePrice, quote } from "@/lib/pricing";
import type { UnifiedResult } from "@/lib/providers/types";
import { matchesAttrFilter, parseAttrFilter, subCategoryOf } from "./attributes";
import type { Center } from "./useSearchResults";
import type { PriceBase, SearchParams } from "./params";

export function daysBetween(from: string, to: string): number {
  if (!from || !to) return 1;
  const d = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1;
  return Number.isFinite(d) ? Math.max(1, d) : 1;
}

/** Annonserat pris enligt vald prisbas. */
export function advertisedPrice(r: UnifiedResult, base: PriceBase, days: number): number {
  switch (base) {
    case "hour":
      return r.priceHour ?? Math.round(r.priceDay / 8);
    case "week":
      return r.priceWeek ?? r.priceDay * 6;
    case "month":
      return r.priceMonth ?? (r.priceWeek ?? r.priceDay * 6) * 3.6;
    case "total":
      return quote(r, days).total;
    default:
      return r.priceDay;
  }
}

export function priceBaseLabel(base: PriceBase): string {
  return { hour: "/tim", day: "/dygn", week: "/vecka", month: "/mån", total: " totalt" }[base];
}

export function filterResults(
  results: UnifiedResult[],
  p: SearchParams,
  center: Center,
  days: number,
): UnifiedResult[] {
  const attrs = parseAttrFilter(p.attrs);
  return results.filter((r) => {
    if (p.category !== "all" && r.category !== p.category) return false;
    if (p.sub !== "all" && subCategoryOf(r) !== p.sub) return false;
    if (!center.nationwide && distanceKm(center.lat, center.lng, r.lat, r.lng) > p.radius) return false;

    const price = advertisedPrice(r, p.priceBase, days);
    if (p.priceMin && price < p.priceMin) return false;
    if (p.priceMax && price > p.priceMax) return false;

    if (p.owner !== "all" && r.ownerType !== p.owner) return false;
    if (p.delivery === "delivery" && !r.deliveryAvailable) return false;
    if (p.delivery === "pickup" && !r.pickupAvailable) return false;
    if (p.rating && r.rating < p.rating) return false;
    if (p.booking === "instant" && !r.instantBook) return false;
    if (p.booking === "request" && r.instantBook) return false;
    if (p.verified && r.source.kind !== "internal") return false;
    if (p.noDeposit && r.deposit > 0) return false;
    if (p.insurance && r.insuranceFee <= 0) return false;
    if (p.availableToday && r.availableFrom && new Date(r.availableFrom) > new Date()) return false;
    if (!matchesAttrFilter(r, attrs)) return false;
    return true;
  });
}

export function sortResults(
  results: UnifiedResult[],
  p: SearchParams,
  center: Center,
  days: number,
): UnifiedResult[] {
  const dist = (r: UnifiedResult) =>
    center.nationwide ? 0 : distanceKm(center.lat, center.lng, r.lat, r.lng);
  return [...results].sort((a, b) => {
    switch (p.sort) {
      case "price":
        return bestBasePrice(a, 1).base - bestBasePrice(b, 1).base;
      case "total":
        return quote(a, days).total - quote(b, days).total;
      case "price_desc":
        return quote(b, days).total - quote(a, days).total;
      case "distance":
        return dist(a) - dist(b);
      case "newest":
        return (b.availableFrom ?? "").localeCompare(a.availableFrom ?? "") || b.bookingCount - a.bookingCount;
      case "rating":
        return b.rating - a.rating;
      case "popular":
        return b.bookingCount - a.bookingCount;
      default: {
        const s = (r: UnifiedResult) =>
          r.rating * 18 +
          Math.min(r.reviewCount, 120) * 0.4 +
          (r.source.kind === "internal" ? 25 : 0) +
          (r.instantBook ? 8 : 0) -
          dist(r) * 0.3;
        return s(b) - s(a);
      }
    }
  });
}
