/**
 * Prisrådgivning och konkurrensanalys.
 *
 * Bygger på egna annonser i databasen plus externa demoannonser. Resultatet
 * är en transparent heuristik – aldrig ett faktapåstående om marknadspris.
 */
import { searchAll } from "@/lib/providers";
import type { UnifiedResult } from "@/lib/providers/types";
import { distanceKm } from "@/lib/geo";

export type PriceAdvice = {
  sample: number;
  cheapest: number;
  median: number;
  average: number;
  vsMedianPct: number;
  recommended: { min: number; max: number; mid: number };
  reasons: string[];
  comparables: { title: string; source: string; demo: boolean; priceDay: number; city: string }[];
};

export type PriceContext = {
  category: string;
  city: string;
  lat?: number;
  lng?: number;
  priceDay: number;
  condition?: "nyskick" | "bra" | "sliten";
  brand?: string | null;
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
};

export async function getPriceAdvice(ctx: PriceContext): Promise<PriceAdvice | null> {
  const { results } = await searchAll({ text: ctx.category, category: ctx.category, city: ctx.city });
  const pool = results.filter((r) => r.priceDay > 0);
  if (pool.length < 3) return null;

  const near = (r: UnifiedResult) =>
    ctx.lat != null && ctx.lng != null ? distanceKm(ctx.lat, ctx.lng, r.lat, r.lng) <= 60 : true;
  const scoped = pool.filter(near).length >= 3 ? pool.filter(near) : pool;

  const prices = scoped.map((r) => r.priceDay);
  const med = median(prices);
  const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
  const cheapest = Math.min(...prices);

  const reasons: string[] = [
    `${scoped.length} liknande annonser i kategorin ${ctx.category}${ctx.city ? ` nära ${ctx.city}` : ""}.`,
    `Medianpriset ligger på ${med} kr/dygn, billigaste på ${cheapest} kr/dygn.`,
  ];

  let factor = 1;
  if (ctx.condition === "nyskick") { factor += 0.1; reasons.push("Skick nyskick ger utrymme för +10 %."); }
  if (ctx.condition === "sliten") { factor -= 0.12; reasons.push("Slitet skick sänker rekommendationen med 12 %."); }
  if (ctx.brand) { factor += 0.04; reasons.push(`Känt märke (${ctx.brand}) motiverar ett litet påslag.`); }
  if (["Stockholm", "Göteborg", "Malmö"].includes(ctx.city)) {
    factor += 0.05;
    reasons.push(`Högre efterfrågan i ${ctx.city}.`);
  }

  const mid = Math.round((med * factor) / 5) * 5;
  const advice: PriceAdvice = {
    sample: scoped.length,
    cheapest,
    median: med,
    average: avg,
    vsMedianPct: med ? ((ctx.priceDay - med) / med) * 100 : 0,
    recommended: { min: Math.round((mid * 0.9) / 5) * 5, max: Math.round((mid * 1.12) / 5) * 5, mid },
    reasons,
    comparables: scoped
      .sort((a, b) => a.priceDay - b.priceDay)
      .slice(0, 6)
      .map((r) => ({ title: r.title, source: r.source.name, demo: r.source.demo, priceDay: r.priceDay, city: r.city })),
  };
  return advice;
}
