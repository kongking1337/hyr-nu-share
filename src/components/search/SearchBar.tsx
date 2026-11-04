import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Clock, MapPin, Search, Tag, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { suggest, type Suggestion } from "@/lib/search/suggest";
import { LOCATIONS } from "@/lib/search/useSearchResults";
import { RADIUS_OPTIONS } from "@/lib/search/params";
import { cn } from "@/lib/utils";
import { REGION } from "@/lib/geo";

const ICONS = {
  term: Search,
  category: Tag,
  subcategory: Tag,
  popular: TrendingUp,
  recent: Clock,
} as const;

export function SearchBar({
  q,
  location,
  radius,
  size = "lg",
  onSubmit,
}: {
  q: string;
  location: string;
  radius: number;
  size?: "lg" | "md";
  onSubmit: (next: { q: string; location: string; radius: number; category?: string; sub?: string }) => void;
}) {
  const [text, setText] = useState(q);
  const [debounced, setDebounced] = useState(q);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loc, setLoc] = useState(location);
  const [rad, setRad] = useState(radius);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => setText(q), [q]);
  useEffect(() => setLoc(location), [location]);
  useEffect(() => setRad(radius), [radius]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(text), 180);
    return () => clearTimeout(t);
  }, [text]);

  const items = useMemo(() => suggest(debounced), [debounced]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(s: Suggestion) {
    setText(s.label);
    setOpen(false);
    onSubmit({
      q: s.kind === "category" ? "" : s.label,
      location: loc,
      radius: rad,
      ...(s.category ? { category: s.category } : {}),
      ...(s.kind === "subcategory" ? { sub: s.id.split("-").slice(2).join("-") } : {}),
    });
  }

  const h = size === "lg" ? "h-14" : "h-12";
  const showList = open && items.length > 0;

  return (
    <div ref={boxRef} className="relative">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setOpen(false);
          onSubmit({ q: text, location: loc, radius: rad });
        }}
        className="flex flex-col gap-2 md:flex-row md:items-center"
      >
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (!open) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, items.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, -1));
              } else if (e.key === "Enter" && active >= 0 && items[active]) {
                e.preventDefault();
                pick(items[active]!);
              } else if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Vad letar du efter?"
            aria-label="Vad letar du efter?"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showList}
            aria-controls={showList ? listId : undefined}
            aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
            autoComplete="off"
            className={cn(h, "rounded-full pl-12 pr-[5.5rem] text-base shadow-sm md:text-base")}
          />
          <Button
            type="submit"
            className={cn(
              "absolute right-1.5 top-1/2 -translate-y-1/2 px-5",
              size === "lg" ? "h-11" : "h-9",
            )}
          >
            Sök
          </Button>

          {showList && (
            <ul
              id={listId}
              role="listbox"
              aria-label="Förslag"
              className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl"
            >
              {items.map((s, i) => {
                const Icon = ICONS[s.kind];
                return (
                  <li
                    key={s.id}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(s)}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm",
                      i === active && "bg-muted",
                    )}
                  >
                    <Icon aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{s.label}</span>
                    {s.hint && <span className="shrink-0 text-xs text-muted-foreground">{s.hint}</span>}
                    {s.kind === "recent" && <span className="shrink-0 text-xs text-muted-foreground">Tidigare</span>}
                    {s.kind === "popular" && <span className="shrink-0 text-xs text-muted-foreground">Populärt</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 md:flex">
          <Select
            value={loc}
            onValueChange={(v) => {
              setLoc(v);
              onSubmit({ q: text, location: v, radius: rad });
            }}
          >
            <SelectTrigger
              className={cn(h, "justify-start rounded-full px-4 md:w-[200px] [&>span]:flex-1 [&>span]:text-left")}
              aria-label="Plats"
            >
              <MapPin aria-hidden className="mr-1 h-4 w-4 shrink-0 text-muted-foreground" />
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

          <Select
            value={String(rad)}
            onValueChange={(v) => {
              setRad(Number(v));
              onSubmit({ q: text, location: loc, radius: Number(v) });
            }}
          >
            <SelectTrigger
              className={cn(h, "w-[108px] rounded-full px-4")}
              disabled={loc === REGION.slug}
              aria-label="Radie"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RADIUS_OPTIONS.map((r) => (
                <SelectItem key={r} value={String(r)}>
                  +{r} km
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </form>
    </div>
  );
}
