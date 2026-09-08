import { useEffect, useMemo, useState } from "react";
import { Grid2x2, LayoutList, Map as MapIcon, SlidersHorizontal, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchBar } from "@/components/search/SearchBar";
import { FilterPanel } from "@/components/search/FilterPanel";
import { ActiveFilterChips, activeChips } from "@/components/search/ActiveFilterChips";
import { ResultCard } from "@/components/search/ResultCard";
import { ResultsMap } from "@/components/search/ResultsMap";
import { SaveSearchButton } from "@/components/SaveSearchButton";
import { distanceKm } from "@/lib/geo";
import { dedupe } from "@/lib/search/dedupe";
import { daysBetween, filterResults, sortResults } from "@/lib/search/filter-sort";
import { SORT_OPTIONS, type SearchParams } from "@/lib/search/params";
import { interpretQuery } from "@/lib/search/parse-query";
import { pushRecentSearch } from "@/lib/search/suggest";
import { resolveCenter, useSearchResults } from "@/lib/search/useSearchResults";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;

export function SearchResultsPage({
  params,
  patch,
  reset,
  heading,
  intro,
}: {
  params: SearchParams;
  patch: (p: Partial<SearchParams>) => void;
  reset: () => void;
  heading?: string;
  intro?: string;
}) {
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [draft, setDraft] = useState<SearchParams>(params);

  useEffect(() => setDraft(params), [params]);

  useEffect(() => {
    if (params.location !== "nara-mig" || myPos || typeof navigator === "undefined") return;
    navigator.geolocation?.getCurrentPosition((pos) =>
      setMyPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    );
  }, [params.location, myPos]);

  const center = resolveCenter(params.location, myPos);
  const days = daysBetween(params.from, params.to);

  const { results, sources, internalLoading, externalLoading } = useSearchResults(params, center);

  const groups = useMemo(() => {
    const filtered = filterResults(results, params, center, days);
    const sorted = sortResults(filtered, params, center, days);
    return dedupe(sorted);
  }, [results, params, center, days]);

  const visible = groups.slice(0, params.page * PAGE_SIZE);
  const chipCount = activeChips(params).length;

  function submitSearch(next: { q: string; location: string; radius: number; category?: string; sub?: string }) {
    const intent = interpretQuery(next.q);
    setNotes(intent.notes);
    pushRecentSearch(next.q);
    patch({
      ...intent.patch,
      q: next.q,
      location: next.location !== params.location ? next.location : (intent.patch.location ?? next.location),
      radius: next.radius,
      ...(next.category ? { category: next.category, sub: next.sub ?? "all" } : {}),
    });
  }

  const resultCount = groups.length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {heading && <h1 className="mb-2 font-display text-3xl font-semibold">{heading}</h1>}
      {intro && <p className="mb-4 max-w-2xl text-sm text-muted-foreground">{intro}</p>}

      <SearchBar q={params.q} location={params.location} radius={params.radius} size="md" onSubmit={submitSearch} />

      {notes.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" /> Tolkning:
          </span>
          {notes.map((n) => (
            <span key={n} className="rounded-full bg-muted px-2.5 py-1">
              {n}
            </span>
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-3xl border border-border bg-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-display text-sm font-semibold">Filter</p>
              {chipCount > 0 && (
                <button onClick={reset} className="text-xs text-muted-foreground hover:underline">
                  Rensa alla
                </button>
              )}
            </div>
            <FilterPanel params={params} patch={patch} />
          </div>
        </aside>

        <div className="min-w-0">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
            <p className="min-w-0 truncate text-sm text-muted-foreground">
              {internalLoading ? "Söker…" : `${resultCount} träffar`}
              {externalLoading && " · hämtar externa källor…"}
              {` · period ${days} dygn`}
            </p>

            <div className="flex shrink-0 items-center gap-2">
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="rounded-full lg:hidden">
                    <SlidersHorizontal className="mr-1 h-4 w-4" /> Filter{chipCount ? ` (${chipCount})` : ""}
                  </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="h-[92vh] rounded-t-3xl p-0">
                  <SheetHeader className="border-b border-border px-4 py-3">
                    <SheetTitle>Filter</SheetTitle>
                  </SheetHeader>
                  <div className="h-[calc(92vh-9.5rem)] overflow-y-auto px-4 pb-4">
                    <FilterPanel params={draft} patch={(p) => setDraft((d) => ({ ...d, ...p }))} />
                  </div>
                  <div className="sticky bottom-0 flex items-center gap-2 border-t border-border bg-background px-4 py-3">
                    <Button variant="ghost" className="rounded-full" onClick={reset}>
                      Rensa
                    </Button>
                    <Button
                      className="flex-1 rounded-full"
                      onClick={() => {
                        patch(draft);
                        setMobileOpen(false);
                      }}
                    >
                      Visa resultat
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>

              <Select value={params.sort} onValueChange={(v) => patch({ sort: v as SearchParams["sort"] })}>
                <SelectTrigger className="h-9 w-[170px] rounded-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex rounded-full border border-border p-0.5">
                {([
                  ["grid", Grid2x2, "Rutnät"],
                  ["list", LayoutList, "Lista"],
                  ["map", MapIcon, "Karta"],
                ] as const).map(([v, Icon, label]) => (
                  <button
                    key={v}
                    type="button"
                    aria-label={label}
                    onClick={() => patch({ view: v })}
                    className={cn(
                      "grid h-8 w-9 place-items-center rounded-full",
                      params.view === v && "bg-foreground text-background",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ActiveFilterChips params={params} onPatch={patch} onClearAll={reset} />
            <SaveSearchButton label={params.q || "Min sökning"} filters={params as unknown as Record<string, unknown>} />
          </div>

          {sources.some((s) => s.status === "error") && (
            <p className="mt-3 text-xs text-destructive">
              Källa svarade inte: {sources.filter((s) => s.status === "error").map((s) => s.name).join(", ")}
            </p>
          )}

          {params.view === "map" ? (
            <div className="mt-4">
              <ResultsMap
                results={groups.map((g) => g.primary)}
                days={days}
                center={center}
                radiusKm={params.radius}
                onSearchArea={() => patch({ page: 1 })}
              />
            </div>
          ) : (
            <>
              <div
                className={cn(
                  "mt-4 grid gap-4",
                  params.view === "grid" ? "sm:grid-cols-2 xl:grid-cols-3" : "grid-cols-1",
                )}
              >
                {visible.map((g) => (
                  <ResultCard
                    key={g.key}
                    group={g}
                    days={days}
                    priceBase={params.priceBase}
                    layout={params.view === "grid" ? "grid" : "list"}
                    distance={
                      center.nationwide ? null : distanceKm(center.lat, center.lng, g.primary.lat, g.primary.lng)
                    }
                  />
                ))}
                {(internalLoading || (externalLoading && !visible.length)) &&
                  [0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-96 rounded-3xl" />)}
              </div>

              {visible.length < groups.length && (
                <div className="mt-6 flex justify-center">
                  <Button variant="outline" className="rounded-full" onClick={() => patch({ page: params.page + 1 })}>
                    Visa fler ({groups.length - visible.length} kvar)
                  </Button>
                </div>
              )}

              {!internalLoading && !externalLoading && groups.length === 0 && (
                <p className="mt-12 text-center text-muted-foreground">
                  Inga träffar. Prova större radie, färre filter eller ett bredare sökord.
                </p>
              )}
            </>
          )}

          <div className="mt-8 rounded-3xl bg-muted/60 p-4 text-xs text-muted-foreground">
            <p className="mb-2 font-semibold text-foreground">Källornas status</p>
            <ul className="grid gap-1 sm:grid-cols-2">
              {sources.map((s) => (
                <li key={s.slug} className="flex items-center justify-between gap-2">
                  <span>
                    {s.name} {s.demo && <em className="not-italic">(demo/mock)</em>}
                  </span>
                  <span>
                    {s.status === "loading" ? "hämtar…" : s.status === "error" ? "fel" : `${s.count} träffar`}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3">
              Externa resultat är demodata tills officiella API:er, feeds eller affiliateavtal är på plats. Ingen
              skrapning sker.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
