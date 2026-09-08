import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, MapPin, Search, Tag, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { suggest, type Suggestion } from "@/lib/search/suggest";
import { LOCATIONS } from "@/lib/search/useSearchResults";
import { RADIUS_OPTIONS } from "@/lib/search/params";
import { cn } from "@/lib/utils";

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

  return (
    <div ref={boxRef} className="relative">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setOpen(false);
          onSubmit({ q: text, location: loc, radius: rad });
        }}
        className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
      >
        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
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
            placeholder="Vad vill du hyra?"
            aria-label="Vad vill du hyra?"
            className={cn(h, "rounded-2xl pl-12 text-base")}
          />
        </div>

        <Select
          value={loc}
          onValueChange={(v) => {
            setLoc(v);
            onSubmit({ q: text, location: v, radius: rad });
          }}
        >
          <SelectTrigger className={cn(h, "rounded-2xl md:w-[190px]")} aria-label="Plats">
            <MapPin className="mr-1 h-4 w-4 shrink-0 text-muted-foreground" />
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
            className={cn(h, "rounded-2xl md:w-[120px]")}
            disabled={loc === "hela-sverige"}
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

        <Button type="submit" className={cn(h, "rounded-2xl px-8")}>
          Sök
        </Button>
      </form>

      {open && items.length > 0 && (
        <ul className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-border bg-popover p-1.5 shadow-xl md:w-[calc(100%-440px)]">
          {items.map((s, i) => {
            const Icon = ICONS[s.kind];
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(s)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm",
                    i === active && "bg-muted",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{s.label}</span>
                  {s.hint && <span className="shrink-0 text-xs text-muted-foreground">{s.hint}</span>}
                  {s.kind === "recent" && <span className="shrink-0 text-xs text-muted-foreground">Tidigare</span>}
                  {s.kind === "popular" && <span className="shrink-0 text-xs text-muted-foreground">Populärt</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
