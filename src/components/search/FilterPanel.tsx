import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORY_SYNONYMS } from "@/lib/search-parse";
import { ACTIVE_CATEGORIES } from "@/lib/categories";
import {
  CATEGORY_ATTRIBUTES,
  SUBCATEGORIES,
  parseAttrFilter,
  stringifyAttrFilter,
} from "@/lib/search/attributes";
import { RADIUS_OPTIONS, type SearchParams } from "@/lib/search/params";
import { todayISO } from "@/lib/bookings";
import { LOCATIONS } from "@/lib/search/useSearchResults";
import { cn } from "@/lib/utils";
import { REGION } from "@/lib/geo";

type Patch = (p: Partial<SearchParams>) => void;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // Etiketten omsluter fältet så att den hör ihop med det för skärmläsare.
    <label className="block space-y-1.5">
      <span className="block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
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

/** Liten valknapp (underkategori, radie). Vald = mörk pill, som vy-växlaren. */
function Toggle({
  selected,
  disabled,
  onClick,
  children,
}: {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-40",
        selected
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-card hover:border-foreground/40",
      )}
    >
      {children}
    </button>
  );
}

const TRIGGER =
  "rounded-md py-3.5 text-sm font-semibold hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

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
      defaultValue={["kategori", "plats", "datum", "pris", "uthyrare"]}
      className="w-full"
    >
      <AccordionItem value="kategori">
        <AccordionTrigger className={TRIGGER}>Kategori</AccordionTrigger>
        <AccordionContent className="space-y-3 px-0.5 pb-4">
          <Select
            value={params.category}
            onValueChange={(v) => patch({ category: v, sub: "all", attrs: "" })}
          >
            <SelectTrigger aria-label="Kategori">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla kategorier</SelectItem>
              {ACTIVE_CATEGORIES.map((c) => (
                <SelectItem key={c.slug} value={c.slug}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {subs.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <Toggle selected={params.sub === "all"} onClick={() => patch({ sub: "all" })}>
                Alla typer
              </Toggle>
              {subs.map((s) => (
                <Toggle
                  key={s.slug}
                  selected={params.sub === s.slug}
                  onClick={() => patch({ sub: s.slug })}
                >
                  {s.name}
                </Toggle>
              ))}
            </div>
          )}
        </AccordionContent>
      </AccordionItem>

      {attrDefs.length > 0 && (
        <AccordionItem value="attribut">
          <AccordionTrigger className={TRIGGER}>
            Egenskaper · {CATEGORY_SYNONYMS[params.category]?.name ?? params.category}
          </AccordionTrigger>
          <AccordionContent className="space-y-3 px-0.5 pb-4">
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
                    <SelectTrigger>
                      <SelectValue placeholder="Alla" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla</SelectItem>
                      {(a.options ?? []).map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
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
        <AccordionTrigger className={TRIGGER}>Plats</AccordionTrigger>
        <AccordionContent className="space-y-3 px-0.5 pb-4">
          <Select value={params.location} onValueChange={(v) => patch({ location: v })}>
            <SelectTrigger aria-label="Plats">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOCATIONS.map((l) => (
                <SelectItem key={l.slug} value={l.slug}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Radie">
            {RADIUS_OPTIONS.map((r) => (
              <Toggle
                key={r}
                selected={params.radius === r}
                disabled={params.location === REGION.slug}
                onClick={() => patch({ radius: r })}
              >
                {r} km
              </Toggle>
            ))}
          </div>
          {params.location === REGION.slug && (
            <p className="text-xs text-muted-foreground">Välj en kommun för att ändra radien.</p>
          )}
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="datum">
        <AccordionTrigger className={TRIGGER}>Datum</AccordionTrigger>
        <AccordionContent className="space-y-3 px-0.5 pb-4">
          <div className="grid grid-cols-2 gap-2">
            <Row label="Från">
              <Input
                type="date"
                min={todayISO()}
                value={params.from}
                onChange={(e) => {
                  const from = e.target.value;
                  patch({
                    from,
                    to: params.to && from && params.to < from ? from : params.to || from,
                  });
                }}
              />
            </Row>
            <Row label="Till">
              <Input
                type="date"
                min={params.from || todayISO()}
                value={params.to}
                onChange={(e) => {
                  const to = e.target.value;
                  patch({
                    to: params.from && to && to < params.from ? params.from : to,
                    from: params.from || to,
                  });
                }}
              />
            </Row>
          </div>
          <p className="text-xs text-muted-foreground">
            Visar bara saker som är lediga alla dagarna.
          </p>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="pris">
        <AccordionTrigger className={TRIGGER}>Pris</AccordionTrigger>
        <AccordionContent className="space-y-3 px-0.5 pb-4">
          <p className="text-xs text-muted-foreground">Pris per dygn.</p>
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
        <AccordionTrigger className={TRIGGER}>Uthyrare</AccordionTrigger>
        <AccordionContent className="space-y-3 px-0.5 pb-4">
          <Row label="Visa annonser från">
            <Select
              value={params.owner}
              onValueChange={(v) => patch({ owner: v as SearchParams["owner"] })}
            >
              <SelectTrigger aria-label="Visa annonser från">
                <SelectValue />
              </SelectTrigger>
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
