/**
 * Autocomplete-index för sökrutan.
 * Innehåller produkttermer, kategorier, underkategorier och populära sökningar.
 */
import { normalize } from "@/lib/geo";
import { CATEGORY_SYNONYMS } from "@/lib/search-parse";
import { SUBCATEGORIES } from "./attributes";

export type Suggestion = {
  id: string;
  label: string;
  kind: "term" | "category" | "subcategory" | "popular" | "recent";
  category?: string;
  hint?: string;
};

/** Vanliga uthyrningsobjekt på svenska – driver "Bor → Borrmaskin/Bordsåg". */
export const TERMS: Array<{ label: string; category: string }> = [
  { label: "Borrmaskin", category: "verktyg" },
  { label: "Borrhammare", category: "verktyg" },
  { label: "Bordsåg", category: "verktyg" },
  { label: "Bord och stolar", category: "fest" },
  { label: "Bygglampa", category: "bygg" },
  { label: "Betongblandare", category: "bygg" },
  { label: "Byggställning", category: "bygg" },
  { label: "Högtryckstvätt", category: "verktyg" },
  { label: "Tigersåg", category: "verktyg" },
  { label: "Slipmaskin", category: "verktyg" },
  { label: "Spikpistol", category: "verktyg" },
  { label: "Släpvagn 750 kg", category: "slapvagn" },
  { label: "Släpvagn bromsad", category: "slapvagn" },
  { label: "Flyttsläp med kåpa", category: "slapvagn" },
  { label: "Biltransportsläp", category: "slapvagn" },
  { label: "Systemkamera", category: "kamera" },
  { label: "Objektiv 24-70mm", category: "kamera" },
  { label: "Drönare", category: "kamera" },
  { label: "GoPro", category: "kamera" },
  { label: "Partytält", category: "fest" },
  { label: "Högtalare och ljudanläggning", category: "fest" },
  { label: "Popcornmaskin", category: "fest" },
  { label: "Gräsklippare", category: "tradgard" },
  { label: "Jordfräs", category: "tradgard" },
  { label: "Lövblås", category: "tradgard" },
  { label: "Häcksax", category: "tradgard" },
  { label: "Kajak", category: "fritid" },
  { label: "Paddleboard (SUP)", category: "fritid" },
  { label: "Elcykel", category: "fritid" },
  { label: "PS5", category: "fritid" },
  { label: "Projektor", category: "fritid" },
  { label: "Barnvagn", category: "barn" },
  { label: "Bilbarnstol", category: "barn" },
  { label: "Resesäng", category: "barn" },
];

export const POPULAR: string[] = [
  "Släpvagn",
  "Högtryckstvätt",
  "Partytält",
  "Borrmaskin",
  "Systemkamera",
  "Elcykel",
];

const RECENT_KEY = "hyrkoll.recent-searches";

export function recentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return (JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[]).slice(0, 6);
  } catch {
    return [];
  }
}

export function pushRecentSearch(q: string) {
  if (typeof window === "undefined") return;
  const clean = q.trim();
  if (!clean) return;
  const list = [clean, ...recentSearches().filter((r) => r.toLowerCase() !== clean.toLowerCase())].slice(0, 6);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}

function score(query: string, label: string): number {
  const q = normalize(query);
  const l = normalize(label);
  if (!q) return 0;
  if (l.startsWith(q)) return 100 - l.length;
  const wordStart = l.split(" ").some((w) => w.startsWith(q));
  if (wordStart) return 80 - l.length;
  if (l.includes(q)) return 60 - l.length;
  // enkel stavfelstolerans
  if (q.length >= 4 && l.slice(0, 4) === q.slice(0, 4)) return 40;
  return -1;
}

export function suggest(query: string, limit = 8): Suggestion[] {
  const q = query.trim();
  if (!q) {
    return [
      ...recentSearches().map((r, i) => ({ id: `recent-${i}`, label: r, kind: "recent" as const })),
      ...POPULAR.map((p, i) => ({ id: `pop-${i}`, label: p, kind: "popular" as const })),
    ].slice(0, limit);
  }

  const out: Array<Suggestion & { s: number }> = [];

  for (const t of TERMS) {
    const s = score(q, t.label);
    if (s > 0) out.push({ id: `t-${t.label}`, label: t.label, kind: "term", category: t.category, s });
  }
  for (const [slug, def] of Object.entries(CATEGORY_SYNONYMS)) {
    const s = Math.max(score(q, def.name), ...def.words.map((w) => score(q, w) - 10));
    if (s > 0)
      out.push({ id: `c-${slug}`, label: def.name, kind: "category", category: slug, hint: "Kategori", s: s + 5 });
  }
  for (const [cat, subs] of Object.entries(SUBCATEGORIES)) {
    for (const sub of subs) {
      const s = score(q, sub.name);
      if (s > 0)
        out.push({
          id: `s-${cat}-${sub.slug}`,
          label: sub.name,
          kind: "subcategory",
          category: cat,
          hint: CATEGORY_SYNONYMS[cat]?.name,
          s: s - 5,
        });
    }
  }

  return out
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(({ s: _s, ...rest }) => rest);
}
