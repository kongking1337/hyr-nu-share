/**
 * Transparent prisinsikt: låg-, marknads-, hög- och rekommenderad nivå.
 *
 * Bygger på samma underlag som price-advice (egna annonser + märkta
 * demoannonser). Alltid en uppskattning – aldrig en garanti.
 */
import type { PriceAdvice } from "@/lib/price-advice";

export type PriceStrategy = "fast" | "recommended" | "revenue";

export type PriceLevels = {
  low: number;
  market: number;
  high: number;
  recommended: number;
  minimumSuggestion: number;
  expectedAcceptedOffer: number;
  strategies: { key: PriceStrategy; label: string; price: number; note: string }[];
  explanation: string;
  sample: number;
};

const round5 = (n: number) => Math.round(n / 5) * 5;

export function priceLevels(advice: PriceAdvice): PriceLevels {
  const market = advice.median || advice.average;
  const low = round5(Math.min(advice.cheapest, market * 0.78));
  const high = round5(market * 1.25);
  const recommended = advice.recommended.mid || round5(market);

  return {
    low,
    market: round5(market),
    high,
    recommended,
    minimumSuggestion: round5(recommended * 0.8),
    expectedAcceptedOffer: round5(recommended * 0.88),
    sample: advice.sample,
    strategies: [
      {
        key: "fast",
        label: "Snabb uthyrning",
        price: round5(recommended * 0.88),
        note: "Under marknadsnivå – störst chans att bli uthyrd snabbt.",
      },
      {
        key: "recommended",
        label: "Rekommenderat",
        price: recommended,
        note: "Balans mellan efterfrågan och intäkt.",
      },
      {
        key: "revenue",
        label: "Högre intäkt",
        price: round5(recommended * 1.15),
        note: "Mer per uthyrning, men lägre efterfrågan och fler bud.",
      },
    ],
    explanation: `Baserat på ${advice.sample} jämförbara annonser: median ${round5(market)} kr/dygn, billigast ${advice.cheapest} kr/dygn. Uppskattningen är en rekommendation tills det finns tillräckligt med genomförda bokningar i kategorin.`,
  };
}

export type MarketIndicator = {
  label: string;
  pct: number;
  tone: "good" | "neutral" | "high";
  estimate: boolean;
};

/** Liten AI-marknadsindikator för resultatkort. */
export function marketIndicator(priceDay: number, marketDay: number | null | undefined, sample = 0): MarketIndicator | null {
  if (!priceDay) return null;
  if (!marketDay || marketDay <= 0) {
    return { label: "Uppskattning saknar underlag", pct: 0, tone: "neutral", estimate: true };
  }
  const pct = Math.round(((priceDay - marketDay) / marketDay) * 100);
  if (pct <= -10) return { label: `${Math.abs(pct)} % under marknadspris`, pct, tone: "good", estimate: sample < 6 };
  if (pct <= -3) return { label: "Bra pris", pct, tone: "good", estimate: sample < 6 };
  if (pct >= 10) return { label: `${pct} % över marknadspris`, pct, tone: "high", estimate: sample < 6 };
  return { label: "Marknadsnivå", pct, tone: "neutral", estimate: sample < 6 };
}

export const ESTIMATE_DISCLAIMER =
  "AI-prisinsikt är en uppskattning från egna annonser och märkta demokällor. Den blir mer träffsäker när fler riktiga bokningar och godkända datakällor finns – den är aldrig en garanti.";
