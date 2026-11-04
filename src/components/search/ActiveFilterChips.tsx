import { X } from "lucide-react";
import { CATEGORY_SYNONYMS } from "@/lib/search-parse";
import { DEFAULTS, type SearchParams } from "@/lib/search/params";
import { formatDates } from "@/lib/bookings";
import { LOCATIONS } from "@/lib/search/useSearchResults";
import { CATEGORY_ATTRIBUTES, SUBCATEGORIES, parseAttrFilter, stringifyAttrFilter } from "@/lib/search/attributes";

export type Chip = { key: string; label: string; patch: Partial<SearchParams> };

export function activeChips(p: SearchParams): Chip[] {
  const chips: Chip[] = [];
  const add = (key: string, label: string, patch: Partial<SearchParams>) => chips.push({ key, label, patch });

  if (p.q) add("q", `”${p.q}”`, { q: "" });
  if (p.category !== "all")
    add("category", CATEGORY_SYNONYMS[p.category]?.name ?? p.category, { category: "all", sub: "all", attrs: "" });
  if (p.sub !== "all") {
    const name = SUBCATEGORIES[p.category]?.find((s) => s.slug === p.sub)?.name ?? p.sub;
    add("sub", name, { sub: "all" });
  }
  if (p.location !== DEFAULTS.location) {
    const name = LOCATIONS.find((l) => l.slug === p.location)?.name ?? p.location;
    add("location", `${name} +${p.radius} km`, { location: DEFAULTS.location });
  }
  if (p.from && p.to) add("dates", `Ledig ${formatDates(p.from, p.to)}`, { from: "", to: "" });
  if (p.priceMin) add("priceMin", `Från ${p.priceMin} kr`, { priceMin: 0 });
  if (p.priceMax) add("priceMax", `Max ${p.priceMax} kr`, { priceMax: 0 });
  if (p.owner !== "all") add("owner", p.owner === "private" ? "Privatpersoner" : "Företag", { owner: "all" });

  const attrs = parseAttrFilter(p.attrs);
  Object.entries(attrs).forEach(([k, v]) => {
    const def = (CATEGORY_ATTRIBUTES[p.category] ?? []).find((a) => a.key === k);
    const rest = { ...attrs };
    delete rest[k];
    add(`attr-${k}`, `${def?.label ?? k}: ${v === "true" ? "Ja" : v}`, { attrs: stringifyAttrFilter(rest) });
  });

  return chips;
}

export function ActiveFilterChips({
  params,
  onPatch,
  onClearAll,
  hide = [],
}: {
  params: SearchParams;
  onPatch: (p: Partial<SearchParams>) => void;
  onClearAll: () => void;
  /** Filter som sidan låser (t.ex. kategorin på /hyra/verktyg) visas inte som borttagbara. */
  hide?: string[];
}) {
  const chips = activeChips(params).filter((c) => !hide.includes(c.key));
  if (!chips.length) return null;
  return (
    <ul className="flex flex-wrap items-center gap-2" aria-label="Valda filter">
      {chips.map((c) => (
        <li key={c.key}>
          <button
            type="button"
            onClick={() => onPatch(c.patch)}
            aria-label={`Ta bort filter: ${c.label}`}
            className="flex h-8 items-center gap-1.5 rounded-full bg-muted pl-3 pr-2.5 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {c.label}
            <X aria-hidden className="h-3.5 w-3.5 opacity-70" />
          </button>
        </li>
      ))}
      <li>
        <button
          type="button"
          onClick={onClearAll}
          className="h-8 rounded-full px-2 text-xs font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Rensa alla
        </button>
      </li>
    </ul>
  );
}
