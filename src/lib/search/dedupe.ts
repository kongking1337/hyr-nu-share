/**
 * MVP-deduplicering: slår ihop poster som med hög sannolikhet är samma objekt
 * hos flera källor. Signaler: titel-likhet, bild, uthyrare, plats, pris/modell.
 */
import { normalize } from "@/lib/geo";
import type { UnifiedResult } from "@/lib/providers/types";

export type ResultGroup = {
  key: string;
  primary: UnifiedResult;
  offers: UnifiedResult[];
  sources: number;
};

const STOP = new Set(["med", "och", "for", "till", "i", "pa", "den", "en", "ett", "hyra", "dygnshyra"]);

function tokens(r: UnifiedResult): Set<string> {
  return new Set(
    normalize(r.title)
      .split(" ")
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  a.forEach((t) => b.has(t) && inter++);
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

function confidence(a: UnifiedResult, b: UnifiedResult): number {
  let s = jaccard(tokens(a), tokens(b)) * 0.55;
  if (a.category === b.category) s += 0.12;
  if (normalize(a.city) === normalize(b.city)) s += 0.12;
  if (a.images[0] && a.images[0] === b.images[0]) s += 0.2;
  if (normalize(a.ownerName) === normalize(b.ownerName)) s += 0.1;
  const p = Math.abs(a.priceDay - b.priceDay) / Math.max(a.priceDay, b.priceDay, 1);
  if (p < 0.25) s += 0.1;
  return s;
}

const THRESHOLD = 0.62;

export function dedupe(results: UnifiedResult[]): ResultGroup[] {
  const groups: ResultGroup[] = [];
  for (const r of results) {
    const hit = groups.find(
      (g) => g.offers.some((o) => o.source.slug !== r.source.slug && confidence(o, r) >= THRESHOLD),
    );
    if (hit) {
      hit.offers.push(r);
      hit.sources = new Set(hit.offers.map((o) => o.source.slug)).size;
    } else {
      groups.push({ key: r.id, primary: r, offers: [r], sources: 1 });
    }
  }
  return groups;
}
