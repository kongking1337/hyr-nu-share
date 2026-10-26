import { X } from "lucide-react";
import { CATEGORY_SYNONYMS } from "@/lib/search-parse";
import { DEFAULTS, TYPE_OPTIONS, type SearchParams } from "@/lib/search/params";
import { LOCATIONS } from "@/lib/search/useSearchResults";
import { CATEGORY_ATTRIBUTES, SUBCATEGORIES, parseAttrFilter, stringifyAttrFilter } from "@/lib/search/attributes";

export type Chip = { key: string; label: string; patch: Partial<SearchParams> };

export function activeChips(p: SearchParams): Chip[] {
  const chips: Chip[] = [];
  const add = (key: string, label: string, patch: Partial<SearchParams>) => chips.push({ key, label, patch });

  if (p.q) add("q", `”${p.q}”`, { q: "" });
  if (p.type !== "all") add("type", TYPE_OPTIONS.find((o) => o.value === p.type)?.label ?? p.type, { type: "all" });
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
}: {
  params: SearchParams;
  onPatch: (p: Partial<SearchParams>) => void;
  onClearAll: () => void;
}) {
  const chips = activeChips(params);
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => onPatch(c.patch)}
          className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs transition-colors hover:border-primary hover:text-primary"
        >
          {c.label}
          <X className="h-3 w-3" />
        </button>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground underline-offset-4 hover:underline"
      >
        Rensa alla
      </button>
    </div>
  );
}
