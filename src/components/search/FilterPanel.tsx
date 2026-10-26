import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORY_SYNONYMS } from "@/lib/search-parse";
import { ACTIVE_CATEGORIES } from "@/lib/categories";
import { CATEGORY_ATTRIBUTES, SUBCATEGORIES, parseAttrFilter, stringifyAttrFilter } from "@/lib/search/attributes";
import { RADIUS_OPTIONS, TYPE_OPTIONS, type SearchParams } from "@/lib/search/params";
import { LOCATIONS } from "@/lib/search/useSearchResults";
import { cn } from "@/lib/utils";
import { REGION } from "@/lib/geo";

type Patch = (p: Partial<SearchParams>) => void;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Check({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
        {label}
      </Label>
    </div>
  );
}

export function FilterPanel({ params, patch }: { params: SearchParams; patch: Patch }) {
  const subs = SUBCATEGORIES[params.category] ?? [];
  const attrDefs = CATEGORY_ATTRIBUTES[params.category] ?? [];
  const attrs = parseAttrFilter(params.attrs);

  const setAttr = (key: string, value: string) => {
    const next = { ...attrs };
    if (!value || value === "all") delete next[key];
    else next[key] = value;
    patch({ attrs: stringifyAttrFilter(next) });
  };

  return (
    <Accordion
      type="multiple"
      defaultValue={["typ", "kategori", "plats", "pris", "saljare"]}
      className="w-full"
    >
      <AccordionItem value="typ">
        <AccordionTrigger className="text-sm font-semibold">Typ</AccordionTrigger>
        <AccordionContent className="flex flex-wrap gap-1.5 pb-4">
          {TYPE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => patch({ type: o.value })}
              className={cn(
                "rounded-full border border-border px-3 py-1 text-xs",
                params.type === o.value && "border-primary bg-primary/10 text-primary",
              )}
            >
              {o.label}
            </button>
          ))}
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="kategori">
        <AccordionTrigger className="text-sm font-semibold">Kategori</AccordionTrigger>
        <AccordionContent className="space-y-3 pb-4">
          <Select value={params.category} onValueChange={(v) => patch({ category: v, sub: "all", attrs: "" })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla kategorier</SelectItem>
              {ACTIVE_CATEGORIES.map((c) => (
                <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {subs.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => patch({ sub: "all" })}
                className={cn(
                  "rounded-full border border-border px-3 py-1 text-xs",
                  params.sub === "all" && "border-primary bg-primary/10 text-primary",
                )}
              >
                Alla typer
              </button>
              {subs.map((s) => (
                <button
                  key={s.slug}
                  type="button"
                  onClick={() => patch({ sub: s.slug })}
                  className={cn(
                    "rounded-full border border-border px-3 py-1 text-xs",
                    params.sub === s.slug && "border-primary bg-primary/10 text-primary",
                  )}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </AccordionContent>
      </AccordionItem>

      {attrDefs.length > 0 && (
        <AccordionItem value="attribut">
          <AccordionTrigger className="text-sm font-semibold">
            Egenskaper · {CATEGORY_SYNONYMS[params.category]?.name ?? params.category}
          </AccordionTrigger>
          <AccordionContent className="space-y-3 pb-4">
            {attrDefs.map((a) =>
              a.type === "bool" ? (
                <Check
                  key={a.key}
                  id={`attr-${a.key}`}
                  label={a.label}
                  checked={attrs[a.key] === "true"}
                  onChange={(v) => setAttr(a.key, v ? "true" : "")}
                />
              ) : a.type === "select" ? (
                <Row key={a.key} label={a.label}>
                  <Select value={attrs[a.key] ?? "all"} onValueChange={(v) => setAttr(a.key, v)}>
                    <SelectTrigger><SelectValue placeholder="Alla" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla</SelectItem>
                      {(a.options ?? []).map((o) => (
                        <SelectItem key={o} value={o}>{o}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Row>
              ) : (
                <Row key={a.key} label={`${a.label} (minst)`}>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={a.min}
                    max={a.max}
                    step={a.step}
                    value={attrs[a.key] ?? ""}
                    onChange={(e) => setAttr(a.key, e.target.value)}
                    placeholder="Alla"
                  />
                </Row>
              ),
            )}
          </AccordionContent>
        </AccordionItem>
      )}

      <AccordionItem value="plats">
        <AccordionTrigger className="text-sm font-semibold">Plats</AccordionTrigger>
        <AccordionContent className="space-y-3 pb-4">
          <Select value={params.location} onValueChange={(v) => patch({ location: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {LOCATIONS.map((l) => (
                <SelectItem key={l.slug} value={l.slug}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex flex-wrap gap-1.5">
            {RADIUS_OPTIONS.map((r) => (
              <button
                key={r}
                type="button"
                disabled={params.location === REGION.slug}
                onClick={() => patch({ radius: r })}
                className={cn(
                  "rounded-full border border-border px-3 py-1 text-xs disabled:opacity-40",
                  params.radius === r && "border-primary bg-primary/10 text-primary",
                )}
              >
                {r} km
              </button>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="pris">
        <AccordionTrigger className="text-sm font-semibold">Pris</AccordionTrigger>
        <AccordionContent className="space-y-3 pb-4">
          <p className="text-xs text-muted-foreground">För saker som hyrs ut gäller priset per dygn.</p>
          <div className="grid grid-cols-2 gap-2">
            <Row label="Min (kr)">
              <Input
                type="number"
                inputMode="numeric"
                value={params.priceMin || ""}
                onChange={(e) => patch({ priceMin: Number(e.target.value) || 0 })}
                placeholder="0"
              />
            </Row>
            <Row label="Max (kr)">
              <Input
                type="number"
                inputMode="numeric"
                value={params.priceMax || ""}
                onChange={(e) => patch({ priceMax: Number(e.target.value) || 0 })}
                placeholder="Valfritt"
              />
            </Row>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="saljare">
        <AccordionTrigger className="text-sm font-semibold">Säljare</AccordionTrigger>
        <AccordionContent className="space-y-3 pb-4">
          <Row label="Säljare">
            <Select value={params.owner} onValueChange={(v) => patch({ owner: v as SearchParams["owner"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla</SelectItem>
                <SelectItem value="private">Privatpersoner</SelectItem>
                <SelectItem value="company">Företag</SelectItem>
              </SelectContent>
            </Select>
          </Row>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export function ClearAllButton({ onClear, count }: { onClear: () => void; count: number }) {
  if (!count) return null;
  return (
    <Button variant="ghost" size="sm" className="rounded-full text-xs" onClick={onClear}>
      Rensa alla ({count})
    </Button>
  );
}
