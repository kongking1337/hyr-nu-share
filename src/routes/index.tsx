import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Baby, Camera, Flower2, HardHat, Package, PartyPopper, Plus, Tent, Truck, Wrench, type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { ListingCard } from "@/components/ListingCard";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/search/SearchBar";
import { supabase } from "@/integrations/supabase/client";
import { rowToUnified } from "@/lib/providers/internal";
import { EXAMPLE_QUERIES } from "@/lib/search-parse";
import { interpretQuery } from "@/lib/search/parse-query";
import { pushRecentSearch } from "@/lib/search/suggest";
import { DEFAULTS, cleanParams } from "@/lib/search/params";
import { CITIES, REGION } from "@/lib/geo";
import { ACTIVE_CATEGORIES } from "@/lib/categories";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hyrkoll – köp, sälj och hyr i Stockholm" },
      {
        name: "description",
        content:
          "Köp, sälj och hyr av privatpersoner och företag i Stockholms län. Sök på vanlig svenska – verktyg, släpvagnar, barnsaker och mycket mer.",
      },
      { property: "og:title", content: "Hyrkoll – köp, sälj och hyr i Stockholm" },
      { property: "og:description", content: "Annonser från privatpersoner och företag i Stockholms län." },
    ],
  }),
  component: Index,
});

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  slapvagn: Truck,
  verktyg: Wrench,
  kamera: Camera,
  fest: PartyPopper,
  tradgard: Flower2,
  fritid: Tent,
  bygg: HardHat,
  barn: Baby,
};

function Index() {
  const navigate = useNavigate();
  const [location, setLocation] = useState(REGION.slug);

  const { data: featured } = useQuery({
    queryKey: ["featured"],
    queryFn: async () => {
      const { data } = await supabase
        .from("listings")
        .select("*")
        .eq("status", "published")
        .in("city", CITIES.map((c) => c.name))
        .order("published_at", { ascending: false })
        .limit(6);
      return (data ?? []).map(rowToUnified);
    },
  });

  function go(next: { q: string; location: string; radius: number; category?: string; sub?: string }) {
    const intent = interpretQuery(next.q);
    pushRecentSearch(next.q);
    setLocation(next.location);
    void navigate({
      to: "/sok",
      search: cleanParams({
        ...DEFAULTS,
        ...intent.patch,
        q: next.q,
        location: next.location !== REGION.slug ? next.location : (intent.patch.location ?? next.location),
        radius: next.radius,
        ...(next.category ? { category: next.category, sub: next.sub ?? "all" } : {}),
      }) as never,
    });
  }

  return (
    <div>
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-primary/8 to-transparent">
        <div className="mx-auto max-w-4xl px-4 py-14 text-center sm:py-20">
          <p className="mb-3 inline-flex rounded-full bg-primary/12 px-3 py-1 text-xs font-medium text-primary">
            Köp, sälj och hyr i Stockholm
          </p>
          <h1 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">
            Vad letar du efter?
          </h1>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            Skriv precis som du tänker. Vi visar vad grannar och företag i Stockholms län säljer och hyr ut.
          </p>

          <div className="mt-7 text-left">
            <SearchBar q="" location={location} radius={25} onSubmit={go} />
          </div>

          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {EXAMPLE_QUERIES.map((e) => (
              <button
                key={e}
                onClick={() => go({ q: e, location, radius: 25 })}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
              >
                {e}
              </button>
            ))}
          </div>

          <Button asChild variant="outline" className="mt-8 rounded-full">
            <Link to="/ny-annons">
              <Plus className="mr-1 h-4 w-4" /> Har du något att sälja eller hyra ut?
            </Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="font-display text-2xl font-semibold">Kategorier</h2>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ACTIVE_CATEGORIES.map(({ slug, name }) => {
            const Icon = CATEGORY_ICONS[slug] ?? Package;
            return (
              <Link
                key={slug}
                to="/sok"
                search={{ ...DEFAULTS, category: slug }}
                className="group flex flex-col gap-3 rounded-3xl border border-border bg-card p-5 transition-colors hover:border-primary"
              >
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/12 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="font-medium">{name}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-2xl font-semibold">Senaste annonserna</h2>
          <Link to="/sok" search={DEFAULTS} className="text-sm text-primary hover:underline">
            Visa alla
          </Link>
        </div>
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {(featured ?? []).map((r) => (
            <ListingCard key={r.id} result={r} />
          ))}
        </div>
      </section>
    </div>
  );
}
