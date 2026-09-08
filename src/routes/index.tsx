import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Baby, Camera, Flower2, HardHat, MapPin, PartyPopper, Search, Tent, Truck, Wrench } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListingCard } from "@/components/ListingCard";
import { supabase } from "@/integrations/supabase/client";
import { rowToUnified } from "@/lib/providers/internal";
import { EXAMPLE_QUERIES } from "@/lib/search-parse";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hyrkoll – hyr det du behöver, jämför lägsta totalpris" },
      {
        name: "description",
        content:
          "Sök på vanlig svenska, jämför totalpris från privatpersoner och företag och boka direkt. Släpvagn, verktyg, kamera och mycket mer.",
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
  const [q, setQ] = useState("");
  const [place, setPlace] = useState("");

  const { data: featured } = useQuery({
    queryKey: ["featured"],
    queryFn: async () => {
      const { data } = await supabase
        .from("listings")
        .select("*")
        .eq("status", "published")
        .order("booking_count", { ascending: false })
        .limit(6);
      return (data ?? []).map(rowToUnified);
    },
  });

  const go = (text: string) =>
    navigate({ to: "/sok", search: { q: `${text} ${place}`.trim() } as never });

  return (
    <div>
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-primary/8 to-transparent">
        <div className="mx-auto max-w-3xl px-4 py-14 text-center sm:py-20">
          <p className="mb-3 inline-flex rounded-full bg-primary/12 px-3 py-1 text-xs font-medium text-primary">
            Sveriges jämförelsesökmotor för uthyrning
          </p>
          <h1 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">
            Vad vill du hyra?
          </h1>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            Skriv precis som du tänker. Vi jämför pris, avgifter och avstånd – och visar verklig
            totalkostnad.
          </p>

          <form
            className="mt-7 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              go(q);
            }}
          >
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="T.ex. högtryckstvätt nära Solna över helgen"
                className="h-16 rounded-3xl border-2 pl-12 text-base shadow-sm"
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <MapPin className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={place}
                  onChange={(e) => setPlace(e.target.value)}
                  placeholder="Plats"
                  className="h-12 rounded-2xl pl-11"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-12 rounded-2xl"
                onClick={() => setPlace("Stockholm")}
              >
                Nära mig
              </Button>
              <Button type="submit" className="h-12 rounded-2xl px-8">
                Sök & jämför
              </Button>
            </div>
          </form>

          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {EXAMPLE_QUERIES.map((e) => (
              <button
                key={e}
                onClick={() => go(e)}
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
              to="/hyra/$kategori"
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
          <h2 className="font-display text-2xl font-semibold">Rekommenderat just nu</h2>
          <Link to="/sok" className="text-sm text-primary hover:underline">
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
