import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORY_SYNONYMS } from "@/lib/search-parse";
import { CATEGORY_ATTRIBUTES, SUBCATEGORIES, parseAttrFilter, stringifyAttrFilter } from "@/lib/search/attributes";
import { PRICE_BASES, RADIUS_OPTIONS, type SearchParams } from "@/lib/search/params";
import { LOCATIONS } from "@/lib/search/useSearchResults";
import { cn } from "@/lib/utils";

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
      defaultValue={["kategori", "plats", "period", "pris", "uthyrare", "kalla", "ovrigt"]}
      className="w-full"
    >
      <AccordionItem value="kategori">
        <AccordionTrigger className="text-sm font-semibold">Kategori</AccordionTrigger>
        <AccordionContent className="space-y-3 pb-4">
          <Select value={params.category} onValueChange={(v) => patch({ category: v, sub: "all", attrs: "" })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla kategorier</SelectItem>
              {Object.entries(CATEGORY_SYNONYMS).map(([slug, def]) => (
                <SelectItem key={slug} value={slug}>{def.name}</SelectItem>
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
                disabled={params.location === "hela-sverige"}
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

      <AccordionItem value="period">
        <AccordionTrigger className="text-sm font-semibold">Datum</AccordionTrigger>
        <AccordionContent className="grid grid-cols-2 gap-2 pb-4">
          <Row label="Från">
            <Input type="date" value={params.from} onChange={(e) => patch({ from: e.target.value })} />
          </Row>
          <Row label="Till">
            <Input type="date" value={params.to} onChange={(e) => patch({ to: e.target.value })} />
          </Row>
          <div className="col-span-2">
            <Check
              id="availableToday"
              label="Tillgänglig idag"
              checked={params.availableToday}
              onChange={(v) => patch({ availableToday: v })}
            />
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="pris">
        <AccordionTrigger className="text-sm font-semibold">Pris</AccordionTrigger>
        <AccordionContent className="space-y-3 pb-4">
          <Row label="Prisbas">
            <Select value={params.priceBase} onValueChange={(v) => patch({ priceBase: v as SearchParams["priceBase"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRICE_BASES.map((b) => (
                  <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
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

      <AccordionItem value="uthyrare">
        <AccordionTrigger className="text-sm font-semibold">Uthyrare & bokning</AccordionTrigger>
        <AccordionContent className="space-y-3 pb-4">
          <Row label="Uthyrare">
            <Select value={params.owner} onValueChange={(v) => patch({ owner: v as SearchParams["owner"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla</SelectItem>
                <SelectItem value="private">Privatpersoner</SelectItem>
                <SelectItem value="company">Företag</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          <Row label="Leverans">
            <Select value={params.delivery} onValueChange={(v) => patch({ delivery: v as SearchParams["delivery"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla</SelectItem>
                <SelectItem value="delivery">Med leverans</SelectItem>
                <SelectItem value="pickup">Upphämtning</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          <Row label="Bokningssätt">
            <Select value={params.booking} onValueChange={(v) => patch({ booking: v as SearchParams["booking"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla</SelectItem>
                <SelectItem value="instant">Direktbokning</SelectItem>
                <SelectItem value="request">Bokningsförfrågan</SelectItem>
              </SelectContent>
            </Select>
          </Row>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="ovrigt">
        <AccordionTrigger className="text-sm font-semibold">Övrigt</AccordionTrigger>
        <AccordionContent className="space-y-2.5 pb-4">
          <Check id="noDeposit" label="Ingen deposition" checked={params.noDeposit} onChange={(v) => patch({ noDeposit: v })} />
          <Check
            id="deliveryOnly"
            label="Leverans möjlig"
            checked={params.delivery === "delivery"}
            onChange={(v) => patch({ delivery: v ? "delivery" : "all" })}
          />
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
