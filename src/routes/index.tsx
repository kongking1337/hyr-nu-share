import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Baby, Camera, Flower2, HardHat, PartyPopper, Tent, Truck, Wrench } from "lucide-react";
import { useState } from "react";
import { ListingCard } from "@/components/ListingCard";
import { SearchBar } from "@/components/search/SearchBar";
import { supabase } from "@/integrations/supabase/client";
import { rowToUnified } from "@/lib/providers/internal";
import { EXAMPLE_QUERIES } from "@/lib/search-parse";
import { interpretQuery } from "@/lib/search/parse-query";
import { pushRecentSearch } from "@/lib/search/suggest";
import { DEFAULTS, cleanParams } from "@/lib/search/params";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hyrkoll – hyr det du behöver, jämför lägsta totalpris" },
      {
        name: "description",
        content:
          "Sök på vanlig svenska och hyr av privatpersoner och företag nära dig. Släpvagn, verktyg, kamera och mycket mer.",
      },
      { property: "og:title", content: "Hyrkoll – jämför uthyrning i hela Sverige" },
      { property: "og:description", content: "Hitta lägsta totalpris för det du vill hyra." },
    ],
  }),
  component: Index,
});

const CATEGORIES = [
  { slug: "slapvagn", name: "Släpvagn", Icon: Truck },
  { slug: "verktyg", name: "Verktyg", Icon: Wrench },
  { slug: "kamera", name: "Kamera & Foto", Icon: Camera },
  { slug: "fest", name: "Fest & Event", Icon: PartyPopper },
  { slug: "tradgard", name: "Trädgård", Icon: Flower2 },
  { slug: "fritid", name: "Fritid & Sport", Icon: Tent },
  { slug: "bygg", name: "Bygg & Maskiner", Icon: HardHat },
  { slug: "barn", name: "Barn & Familj", Icon: Baby },
];

function Index() {
  const navigate = useNavigate();
  const [location, setLocation] = useState("hela-sverige");

  const { data: featured } = useQuery({
    queryKey: ["featured"],
    queryFn: async () => {
      const { data } = await supabase
        .from("listings")
        .select("*")
        .eq("status", "published")
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
        location: next.location !== "hela-sverige" ? next.location : (intent.patch.location ?? next.location),
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
            Hyr av grannar och företag nära dig
          </p>
          <h1 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">
            Vad vill du hyra?
          </h1>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            Skriv precis som du tänker. Vi visar vad som finns nära dig och vad det kostar för hela
            perioden.
          </p>

          <div className="mt-7 text-left">
            <SearchBar q="" location={location} radius={25} onSubmit={go} />
          </div>

          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {["Billig släpvagn nära mig", "PS5 i Stockholm under helgen", "Partytält för 50 personer", ...EXAMPLE_QUERIES].map((e) => (
              <button
                key={e}
                onClick={() => go({ q: e, location, radius: 25 })}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="font-display text-2xl font-semibold">Populära kategorier</h2>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CATEGORIES.map(({ slug, name, Icon }) => (
            <Link
              key={slug}
              to="/hyra/$kategori" search={DEFAULTS}
              params={{ kategori: slug }}
              className="group flex flex-col gap-3 rounded-3xl border border-border bg-card p-5 transition-colors hover:border-primary"
            >
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/12 text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <span className="font-medium">{name}</span>
            </Link>
          ))}
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
            <ListingCard key={r.id} result={r} days={2} />
          ))}
        </div>
      </section>
    </div>
  );
}
