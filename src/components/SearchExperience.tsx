import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { List, Map as MapIcon, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ListingCard } from "@/components/ListingCard";
import { MapMock } from "@/components/MapMock";
import { searchAll, type SourceFilter } from "@/lib/providers";
import type { UnifiedResult } from "@/lib/providers/types";
import { quote } from "@/lib/pricing";
import { CITIES, distanceKm } from "@/lib/geo";
import { CATEGORY_SYNONYMS, parseSearch } from "@/lib/search-parse";
import { SaveSearchButton } from "@/components/SaveSearchButton";

const RADIUS = [5, 10, 25, 50, 100];

function daysBetween(a: string, b: string) {
  const d = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000) + 1;
  return Math.max(1, d);
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export function SearchExperience({
  initialText = "",
  initialCategory = null,
  initialCity = null,
  title,
}: {
  initialText?: string;
  initialCategory?: string | null;
  initialCity?: string | null;
  title?: string;
}) {
  const parsedInitial = useMemo(() => parseSearch(initialText), [initialText]);

  const [text, setText] = useState(initialText);
  const [parsed, setParsed] = useState(parsedInitial);
  const [category, setCategory] = useState<string>(initialCategory ?? parsedInitial.category ?? "all");
  const [cityName, setCityName] = useState<string>(initialCity ?? parsedInitial.cityName ?? "Stockholm");
  const [radius, setRadius] = useState<number>(parsedInitial.radiusKm ?? 25);
  const [startDate, setStartDate] = useState(parsedInitial.startDate ?? todayIso());
  const [endDate, setEndDate] = useState(parsedInitial.endDate ?? todayIso());
  const [sort, setSort] = useState(parsedInitial.sort ?? "relevance");
  const [ownerType, setOwnerType] = useState("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [maxPrice, setMaxPrice] = useState(2000);
  const [minRating, setMinRating] = useState(0);
  const [maxDeposit, setMaxDeposit] = useState(6000);
  const [deliveryOnly, setDeliveryOnly] = useState(false);
  const [instantOnly, setInstantOnly] = useState(false);
  const [view, setView] = useState<"list" | "map">("list");
  const [showFilters, setShowFilters] = useState(false);

  const city = CITIES.find((c) => c.name === cityName) ?? CITIES[0]!;
  const days = daysBetween(startDate, endDate);

  const { data, isLoading } = useQuery({
    queryKey: ["search", text, category, cityName, radius, sourceFilter],
    queryFn: () =>
      searchAll(
        {
          text,
          category: category === "all" ? null : category,
          city: cityName,
          lat: city.lat,
          lng: city.lng,
          radiusKm: radius,
          startDate,
          endDate,
        },
        sourceFilter,
      ),
  });

  const results = useMemo(() => {
    let list = (data?.results ?? []).filter((r) => {
      const q = quote(r, days);
      if (q.comparableDayPrice > maxPrice) return false;
      if (r.rating < minRating) return false;
      if (r.deposit > maxDeposit) return false;
      if (deliveryOnly && !r.deliveryAvailable) return false;
      if (instantOnly && !r.instantBook) return false;
      if (ownerType !== "all" && r.ownerType !== ownerType) return false;
      return true;
    });

    const dist = (r: UnifiedResult) => distanceKm(city.lat, city.lng, r.lat, r.lng);
    list = [...list].sort((a, b) => {
      switch (sort) {
        case "price_asc":
          return quote(a, days).total - quote(b, days).total;
        case "price_desc":
          return quote(b, days).total - quote(a, days).total;
        case "distance":
          return dist(a) - dist(b);
        case "rating":
          return b.rating - a.rating;
        case "popular":
          return b.bookingCount - a.bookingCount;
        default:
          return b.rating * 20 + b.reviewCount - (a.rating * 20 + a.reviewCount);
      }
    });
    return list;
  }, [data, days, maxPrice, minRating, maxDeposit, deliveryOnly, instantOnly, ownerType, sort, city]);

  const badges = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!results.length) return map;
    const add = (id: string, label: string) => map.set(id, [...(map.get(id) ?? []), label]);
    const cheapest = [...results].sort((a, b) => quote(a, days).total - quote(b, days).total)[0]!;
    const best = [...results].sort((a, b) => b.rating - a.rating)[0]!;
    const near = [...results].sort(
      (a, b) => distanceKm(city.lat, city.lng, a.lat, a.lng) - distanceKm(city.lat, city.lng, b.lat, b.lng),
    )[0]!;
    add(cheapest.id, "Billigast");
    add(best.id, "Bäst betyg");
    add(near.id, "Närmast");
    return map;
  }, [results, days, city]);

  function runSearch(value: string) {
    const p = parseSearch(value);
    setParsed(p);
    setText(value);
    if (p.category) setCategory(p.category);
    if (p.cityName) setCityName(p.cityName);
    if (p.radiusKm) setRadius(p.radiusKm);
    if (p.startDate) setStartDate(p.startDate);
    if (p.endDate) setEndDate(p.endDate);
    if (p.sort) setSort(p.sort);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {title && <h1 className="mb-4 font-display text-3xl font-semibold">{title}</h1>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          runSearch((new FormData(e.currentTarget).get("q") as string) ?? "");
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={text}
            placeholder="Vad vill du hyra?"
            className="h-14 rounded-2xl pl-12 text-base"
          />
        </div>
        <Button type="submit" size="lg" className="h-14 rounded-2xl px-8">
          Sök
        </Button>
      </form>

      {parsed.notes.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" /> Tolkning:
          </span>
          {parsed.notes.map((n) => (
            <span key={n} className="rounded-full bg-muted px-2.5 py-1">
              {n}
            </span>
          ))}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-[190px] rounded-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="relevance">Mest relevant</SelectItem>
            <SelectItem value="price_asc">Billigast totalt</SelectItem>
            <SelectItem value="price_desc">Dyrast totalt</SelectItem>
            <SelectItem value="distance">Närmast</SelectItem>
            <SelectItem value="rating">Bäst betyg</SelectItem>
            <SelectItem value="popular">Populärast</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as SourceFilter)}>
          <SelectTrigger className="w-[170px] rounded-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla källor</SelectItem>
            <SelectItem value="internal">Endast Hyrkoll</SelectItem>
            <SelectItem value="external">Endast externa</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" className="rounded-full" onClick={() => setShowFilters((s) => !s)}>
          <SlidersHorizontal className="mr-1 h-4 w-4" /> Filter
        </Button>

        <div className="ml-auto flex rounded-full border border-border p-1">
          <Button
            size="sm"
            variant={view === "list" ? "default" : "ghost"}
            className="rounded-full"
            onClick={() => setView("list")}
          >
            <List className="mr-1 h-4 w-4" /> Lista
          </Button>
          <Button
            size="sm"
            variant={view === "map" ? "default" : "ghost"}
            className="rounded-full"
            onClick={() => setView("map")}
          >
            <MapIcon className="mr-1 h-4 w-4" /> Karta
          </Button>
        </div>
      </div>

      {showFilters && (
        <div className="mt-4 grid gap-5 rounded-3xl border border-border bg-card p-5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label>Kategori</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla kategorier</SelectItem>
                {Object.entries(CATEGORY_SYNONYMS).map(([slug, def]) => (
                  <SelectItem key={slug} value={slug}>{def.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Plats</Label>
            <Select value={cityName} onValueChange={setCityName}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CITIES.map((c) => (
                  <SelectItem key={c.slug} value={c.name}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Radie</Label>
            <div className="flex gap-1.5">
              {RADIUS.map((r) => (
                <Button
                  key={r}
                  size="sm"
                  variant={radius === r ? "default" : "outline"}
                  className="rounded-full"
                  onClick={() => setRadius(r)}
                >
                  {r}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Från</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Till</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Uthyrare</Label>
            <Select value={ownerType} onValueChange={setOwnerType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla</SelectItem>
                <SelectItem value="private">Privatpersoner</SelectItem>
                <SelectItem value="company">Företag</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Max dagspris: {maxPrice} kr</Label>
            <Slider value={[maxPrice]} min={100} max={2000} step={50} onValueChange={([v]) => setMaxPrice(v!)} />
          </div>
          <div className="space-y-2">
            <Label>Lägsta betyg: {minRating.toFixed(1)}</Label>
            <Slider value={[minRating]} min={0} max={5} step={0.5} onValueChange={([v]) => setMinRating(v!)} />
          </div>
          <div className="space-y-2">
            <Label>Max deposition: {maxDeposit} kr</Label>
            <Slider value={[maxDeposit]} min={0} max={6000} step={250} onValueChange={([v]) => setMaxDeposit(v!)} />
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-muted/60 px-4 py-3">
            <Label htmlFor="delivery">Endast med leverans</Label>
            <Switch id="delivery" checked={deliveryOnly} onCheckedChange={setDeliveryOnly} />
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-muted/60 px-4 py-3">
            <Label htmlFor="instant">Endast direktbokning</Label>
            <Switch id="instant" checked={instantOnly} onCheckedChange={setInstantOnly} />
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">
          {isLoading ? "Söker…" : `${results.length} träffar · period ${days} dygn · totalpris inkl. avgifter`}
        </p>
        <SaveSearchButton
          label={text || "Min sökning"}
          filters={{ category, cityName, radius, sort, startDate, endDate, sourceFilter }}
        />
      </div>

      {data?.failed?.length ? (
        <p className="mt-2 text-xs text-destructive">
          Källa svarade inte: {data.failed.join(", ")}
        </p>
      ) : null}

      {view === "map" ? (
        <div className="mt-4">
          <MapMock
            results={results}
            days={days}
            center={{ lat: city.lat, lng: city.lng }}
            radiusKm={radius}
            onSearchArea={() => runSearch(text)}
          />
        </div>
      ) : isLoading ? (
        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-96 rounded-3xl" />
          ))}
        </div>
      ) : (
        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((r) => (
            <ListingCard
              key={r.id}
              result={r}
              days={days}
              distanceKm={distanceKm(city.lat, city.lng, r.lat, r.lng)}
              badges={badges.get(r.id) ?? []}
            />
          ))}
        </div>
      )}

      {!isLoading && results.length === 0 && (
        <p className="mt-10 text-center text-muted-foreground">
          Inga träffar. Prova en större radie eller färre filter.
        </p>
      )}

      <p className="mt-10 rounded-3xl bg-muted/60 p-4 text-xs text-muted-foreground">
        Transparens: resultat märkta “Från extern webbplats” är demodata från mock-connectors och kräver
        avtal, officiellt API eller affiliate-integration innan de blir skarpa. Inget innehåll hämtas genom
        skrapning.
      </p>
    </div>
  );
}
