import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Grid2x2, LayoutList, Plus, SearchX, SlidersHorizontal, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { EmptyState, LoadingCards, LoadingRows, Page, PageHeader } from "@/components/layout";
import { SearchBar } from "@/components/search/SearchBar";
import { FilterPanel } from "@/components/search/FilterPanel";
import { ActiveFilterChips, activeChips } from "@/components/search/ActiveFilterChips";
import { ListingCard } from "@/components/ListingCard";
import { SaveSearchButton } from "@/components/SaveSearchButton";
import { REGION, distanceKm } from "@/lib/geo";
import { dedupe } from "@/lib/search/dedupe";
import { filterResults, sortResults } from "@/lib/search/filter-sort";
import { DEFAULTS, SORT_OPTIONS, type SearchParams } from "@/lib/search/params";
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
  pinned = [],
}: {
  params: SearchParams;
  patch: (p: Partial<SearchParams>) => void;
  reset: () => void;
  heading?: string;
  intro?: string;
  /** Filter som sidans adress bestämmer (t.ex. kategorin på /hyra/verktyg) och som inte går att ta bort här. */
  pinned?: Array<keyof SearchParams>;
}) {
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [draft, setDraft] = useState<SearchParams>(params);

  useEffect(() => setDraft(params), [params]);

  useEffect(() => {
    if (params.location !== "nara-mig" || myPos || typeof navigator === "undefined") return;
    navigator.geolocation?.getCurrentPosition(
      (pos) => setMyPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        // Utan position kan "Nära mig" inte användas; säg det i stället för att tyst visa allt.
        toast.info("Vi fick inte veta var du är. Sök i hela Stockholm eller välj en kommun.");
        patch({ location: REGION.slug });
      },
    );
    // patch ändras vid varje rendering; positionen ska bara frågas efter när platsen ändras.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.location, myPos]);

  const center = resolveCenter(params.location, myPos);

  const { results, sources, internalLoading, externalLoading } = useSearchResults(params, center);

  const groups = useMemo(() => {
    const filtered = filterResults(results, params, center);
    const sorted = sortResults(filtered, params, center);
    return dedupe(sorted);
  }, [results, params, center]);

  const visible = groups.slice(0, params.page * PAGE_SIZE);
  const chips = activeChips(params).filter((c) => !pinned.includes(c.key as keyof SearchParams));
  const chipCount = chips.length;
  // Filter utöver sökordet, som "Rensa filter" tar bort (sökordet ligger kvar).
  const filterCount = chips.filter((c) => c.key !== "q").length;

  function submitSearch(next: {
    q: string;
    location: string;
    radius: number;
    category?: string;
    sub?: string;
  }) {
    const intent = interpretQuery(next.q);
    setNotes(intent.notes);
    pushRecentSearch(next.q);
    patch({
      ...intent.patch,
      q: next.q,
      location:
        next.location !== params.location
          ? next.location
          : (intent.patch.location ?? next.location),
      radius: next.radius,
      ...(next.category ? { category: next.category, sub: next.sub ?? "all" } : {}),
    });
  }

  const resultCount = groups.length;
  const list = params.view === "list";
  const loading = internalLoading || (externalLoading && !visible.length);
  const failed = sources.some((s) => s.status === "error");
  const draftChanged = JSON.stringify(draft) !== JSON.stringify(params);
  const empty = !internalLoading && !externalLoading && !failed && groups.length === 0;
  const wideArea = !pinned.includes("location") && params.location !== DEFAULTS.location;

  return (
    <Page width="wide" className="pt-6 sm:pt-8">
      {heading ? (
        <PageHeader title={heading} description={intro} className="mb-6" />
      ) : (
        <h1 className="sr-only">Sök saker att hyra</h1>
      )}

      <SearchBar
        q={params.q}
        location={params.location}
        radius={params.radius}
        size="md"
        onSubmit={submitSearch}
      />

      {notes.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Sparkles aria-hidden className="h-3.5 w-3.5" /> Vi tolkade sökningen som:
          </span>
          {notes.map((n) => (
            <span key={n} className="rounded-full bg-muted px-2.5 py-1">
              {n}
            </span>
          ))}
        </div>
      )}

      <div className="mt-8 grid gap-10 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="hidden lg:block" aria-labelledby="filter-rubrik">
          <div className="sticky top-24 -mx-1 max-h-[calc(100vh-7rem)] overflow-y-auto px-1 pb-4">
            <div className="flex items-baseline justify-between">
              <h2 id="filter-rubrik" className="font-display text-lg font-bold">
                Filter
              </h2>
              {chipCount > 0 && (
                <button
                  type="button"
                  onClick={reset}
                  className="rounded text-xs font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Rensa alla
                </button>
              )}
            </div>
            <FilterPanel params={params} patch={patch} />
          </div>
        </aside>

        <section aria-labelledby="antal-traffar" className="min-w-0">
          {/* Mobil: antal och vy-växlare på första raden, filter och sortering på andra. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
            <p
              id="antal-traffar"
              aria-live="polite"
              className="mr-auto font-display text-lg font-bold"
            >
              {internalLoading
                ? "Söker …"
                : resultCount === 1
                  ? "1 träff"
                  : `${resultCount} träffar`}
            </p>

            <div className="order-last flex w-full items-center gap-2 sm:order-none sm:w-auto">
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" className="lg:hidden">
                    <SlidersHorizontal aria-hidden /> Filter{chipCount ? ` (${chipCount})` : ""}
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="bottom"
                  className="flex h-[90dvh] flex-col gap-0 rounded-t-3xl p-0"
                >
                  <SheetHeader className="border-b border-border px-5 py-4 text-left">
                    <SheetTitle className="font-display text-lg font-bold">Filter</SheetTitle>
                    <SheetDescription className="sr-only">
                      Välj filter och tryck på Visa träffar.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
                    <FilterPanel params={draft} patch={(p) => setDraft((d) => ({ ...d, ...p }))} />
                  </div>
                  <div className="flex items-center gap-2 border-t border-border bg-background px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                    <Button variant="ghost" onClick={reset}>
                      Rensa
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={() => {
                        patch(draft);
                        setMobileOpen(false);
                      }}
                    >
                      {draftChanged ? "Visa resultat" : `Visa ${resultCount} resultat`}
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>

              <Select
                value={params.sort}
                onValueChange={(v) => patch({ sort: v as SearchParams["sort"] })}
              >
                <SelectTrigger
                  className="h-10 min-w-0 flex-1 rounded-full px-4 sm:w-[170px] sm:flex-none"
                  aria-label="Sortera"
                >
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
            </div>

            <div
              role="group"
              aria-label="Visning"
              className="flex shrink-0 rounded-full border border-input bg-card p-0.5 sm:order-last"
            >
              {(
                [
                  ["grid", Grid2x2, "Rutnät"],
                  ["list", LayoutList, "Lista"],
                ] as const
              ).map(([v, Icon, label]) => (
                <button
                  key={v}
                  type="button"
                  aria-label={label}
                  aria-pressed={params.view === v}
                  onClick={() => patch({ view: v })}
                  className={cn(
                    "grid h-[34px] w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    params.view === v && "bg-foreground text-background hover:text-background",
                  )}
                >
                  <Icon aria-hidden className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <ActiveFilterChips params={params} onPatch={patch} onClearAll={reset} hide={pinned} />
            <SaveSearchButton
              label={params.q || "Min sökning"}
              filters={params as unknown as Record<string, unknown>}
            />
          </div>

          {failed && (
            <p
              role="alert"
              className="mt-4 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              Sökningen kunde inte genomföras just nu. Ladda om sidan och försök igen.
            </p>
          )}

          {visible.length > 0 && (
            <ul
              className={cn(
                "mt-6 grid",
                list ? "grid-cols-1 gap-3" : "gap-x-5 gap-y-8 sm:grid-cols-2 xl:grid-cols-3",
              )}
            >
              {visible.map((g) => (
                <li key={g.key}>
                  <ListingCard
                    result={g.primary}
                    layout={list ? "list" : "grid"}
                    distanceKm={
                      center.wholeRegion
                        ? null
                        : distanceKm(center.lat, center.lng, g.primary.lat, g.primary.lng)
                    }
                  />
                </li>
              ))}
            </ul>
          )}

          {loading &&
            (list ? (
              <LoadingRows rows={4} className="mt-6" />
            ) : (
              <LoadingCards className="mt-6 lg:grid-cols-2 xl:grid-cols-3" />
            ))}

          {visible.length < groups.length && (
            <div className="mt-10 flex justify-center">
              <Button variant="outline" onClick={() => patch({ page: params.page + 1 })}>
                Visa fler ({groups.length - visible.length} kvar)
              </Button>
            </div>
          )}

          {empty && (
            <EmptyState
              icon={SearchX}
              title="Inga träffar"
              className="mt-6"
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  {filterCount > 0 ? (
                    <Button onClick={reset}>Rensa filter</Button>
                  ) : params.q ? (
                    <Button onClick={() => patch({ q: "" })}>Sök utan sökord</Button>
                  ) : heading ? (
                    <Button asChild>
                      <Link to="/sok" search={DEFAULTS}>
                        Se allt som går att hyra
                      </Link>
                    </Button>
                  ) : (
                    <Button asChild>
                      <Link to="/ny-annons">
                        <Plus aria-hidden /> Lägg upp annons
                      </Link>
                    </Button>
                  )}
                  {wideArea && filterCount > 1 && (
                    <Button
                      variant="outline"
                      onClick={() => patch({ location: DEFAULTS.location })}
                    >
                      Sök i hela Stockholm
                    </Button>
                  )}
                </div>
              }
            >
              {filterCount > 0
                ? "Inget passar alla filter just nu. Ta bort några filter eller sök i ett större område."
                : params.q
                  ? `Inget matchar ”${params.q}”. Prova ett annat eller bredare sökord.`
                  : heading
                    ? "Här finns inget att hyra just nu. Kolla igen snart, eller se vad som finns i andra kategorier."
                    : "Det finns inga annonser än. Lägg upp det första du vill hyra ut."}
            </EmptyState>
          )}
        </section>
      </div>
    </Page>
  );
}
