import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Baby, Camera, Flower2, HardHat, Package, PartyPopper, Plus, Tent, Truck, Wrench, type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { ListingRow } from "@/components/ListingRow";
import { supabase } from "@/integrations/supabase/client";
import { photoUrl } from "@/lib/photos";
import { rowToUnified } from "@/lib/providers/internal";
import { interpretQuery } from "@/lib/search/parse-query";
import { pushRecentSearch } from "@/lib/search/suggest";
import { LOCATIONS } from "@/lib/search/useSearchResults";
import { DEFAULTS, cleanParams } from "@/lib/search/params";
import { CITIES, REGION } from "@/lib/geo";
import { ACTIVE_CATEGORIES } from "@/lib/categories";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hyrkoll – hyr och hyr ut saker i Stockholm" },
      {
        name: "description",
        content:
          "Hyr saker av privatpersoner och företag i Stockholms län, eller hyr ut det du sällan använder. Sök på vanlig svenska – verktyg, släpvagnar, barnsaker och mycket mer.",
      },
      { property: "og:title", content: "Hyrkoll – hyr och hyr ut saker i Stockholm" },
      { property: "og:description", content: "Hyr saker av privatpersoner och företag i Stockholms län." },
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

const WHEN = [
  { value: "", label: "när som helst" },
  { value: "today", label: "i dag" },
  { value: "weekend", label: "i helgen" },
  { value: "week", label: "i veckan" },
] as const;
type When = (typeof WHEN)[number]["value"];

const TRY = ["släpvagn i helgen", "högtryckstvätt", "partytält", "barnstol till bilen"];

/** Från/till-datum (ÅÅÅÅ-MM-DD) för valet i "när"-listan. */
function dateRange(when: When): { from: string; to: string } {
  if (!when) return { from: "", to: "" };
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const start = new Date();
  if (when === "weekend" && start.getDay() !== 0) start.setDate(start.getDate() + ((6 - start.getDay() + 7) % 7));
  const end = new Date(start);
  if (when === "weekend") end.setDate(start.getDate() + (start.getDay() === 0 ? 0 : 1));
  if (when === "week") end.setDate(start.getDate() + 6);
  return { from: iso(start), to: iso(end) };
}

function Index() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [location, setLocation] = useState(REGION.slug);
  const [when, setWhen] = useState<When>("");

  const { data: latest, isPending: latestPending, isError: latestFailed } = useQuery({
    queryKey: ["home-latest"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("*")
        .eq("status", "published")
        .eq("listing_type", "rent")
        .in("city", CITIES.map((c) => c.name))
        .order("published_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []).map(rowToUnified);
    },
  });

  // Antal annonser och en bild per kategori till kategorirutorna.
  const { data: categories, isPending: categoriesPending } = useQuery({
    queryKey: ["home-categories"],
    queryFn: async () => {
      const { data } = await supabase
        .from("listings")
        .select("category_slug, images")
        .eq("status", "published")
        .eq("listing_type", "rent")
        .in("city", CITIES.map((c) => c.name))
        .order("published_at", { ascending: false })
        .limit(1000);
      const byCategory = new Map<string, { count: number; image: string | undefined }>();
      for (const row of data ?? []) {
        // images innehåller sökvägar i Storage för egna annonser, inte färdiga adresser.
        const first = row.images?.[0];
        const c = byCategory.get(row.category_slug) ?? { count: 0, image: first ? photoUrl(first) : undefined };
        c.count += 1;
        byCategory.set(row.category_slug, c);
      }
      return byCategory;
    },
  });

  function search(next: { q: string; location?: string; category?: string }) {
    const intent = interpretQuery(next.q);
    pushRecentSearch(next.q);
    const loc = next.location ?? REGION.slug;
    void navigate({
      to: "/sok",
      search: cleanParams({
        ...DEFAULTS,
        ...intent.patch,
        q: next.q,
        location: loc !== REGION.slug ? loc : (intent.patch.location ?? loc),
        // "när som helst" ska inte sudda ut datum som står i sökningen ("i helgen").
        ...(next.location && when ? dateRange(when) : {}),
        ...(next.category ? { category: next.category, sub: "all" } : {}),
      }) as never,
    });
  }

  const inline =
    "min-w-0 rounded-none border-b-[3px] border-primary bg-transparent text-primary outline-none placeholder:text-primary/45 focus-visible:border-foreground";

  return (
    <div>
      <section className="mx-auto max-w-6xl px-4 pb-12 pt-12 sm:px-6 sm:pt-20">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            search({ q, location });
          }}
        >
          <h1 className="font-display text-[34px] font-bold leading-[1.25] tracking-tight sm:text-6xl sm:leading-[1.2]">
            <span>Jag vill hyra </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="en släpvagn"
              aria-label="Vad vill du hyra?"
              size={11}
              className={inline}
            />
            <br className="hidden sm:block" />
            <span> i </span>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              aria-label="Var"
              className={`${inline} max-w-full cursor-pointer appearance-none`}
            >
              {LOCATIONS.filter((l) => l.slug !== "nara-mig").map((l) => (
                <option key={l.slug} value={l.slug}>
                  {l.slug === REGION.slug ? "hela Stockholm" : l.name}
                </option>
              ))}
            </select>{" "}
            <select
              value={when}
              onChange={(e) => setWhen(e.target.value as When)}
              aria-label="När"
              className={`${inline} cursor-pointer appearance-none`}
            >
              {WHEN.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </select>
            <span>.</span>
          </h1>
          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
            <button
              type="submit"
              className="rounded-full bg-primary px-7 py-3.5 font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Visa vad som finns
            </button>
            <span className="text-muted-foreground">Prova:</span>
            {TRY.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => search({ q: t })}
                className="text-sm underline decoration-border underline-offset-4 hover:decoration-primary"
              >
                {t}
              </button>
            ))}
          </div>
        </form>
      </section>

      <section aria-labelledby="kategorier" className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 id="kategorier" className="font-display text-2xl font-bold">
          Kategorier
        </h2>
        <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ACTIVE_CATEGORIES.map(({ slug, name }) => {
            const info = categories?.get(slug);
            const Icon = CATEGORY_ICONS[slug] ?? Package;
            return (
              <li key={slug}>
                <Link
                  to="/sok"
                  search={{ ...DEFAULTS, category: slug }}
                  className="group relative flex aspect-[5/4] w-full flex-col justify-end overflow-hidden rounded-2xl bg-muted p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {info?.image ? (
                    <>
                      <img
                        src={info.image}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                    </>
                  ) : (
                    <Icon className="absolute right-4 top-4 h-10 w-10 text-primary" strokeWidth={1.5} />
                  )}
                  <span className={`relative font-display text-lg font-bold leading-tight ${info?.image ? "text-white" : ""}`}>
                    {name}
                  </span>
                  <span className={`relative text-sm ${info?.image ? "text-white/80" : "text-muted-foreground"}`}>
                    {categoriesPending ? " " : info ? `${info.count} att hyra` : "Bli först att hyra ut"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="senast" className="mx-auto mt-16 max-w-6xl px-4 sm:px-6">
        <div className="flex items-baseline justify-between">
          <h2 id="senast" className="font-display text-2xl font-bold">
            Senast upplagt
          </h2>
          <Link to="/sok" search={{ ...DEFAULTS, sort: "newest" }} className="text-sm font-semibold text-primary">
            Visa alla
          </Link>
        </div>
        {latestPending ? (
          <ul className="mt-4 grid gap-x-6 gap-y-2 md:grid-cols-2" aria-busy="true">
            {Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="flex gap-4 p-2">
                <div className="h-24 w-24 animate-pulse rounded-xl bg-muted sm:h-28 sm:w-32" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                </div>
              </li>
            ))}
          </ul>
        ) : latestFailed ? (
          <p className="mt-4 rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
            Annonserna kunde inte hämtas just nu. Ladda om sidan om en stund.
          </p>
        ) : latest?.length ? (
          <ul className="mt-4 grid gap-x-6 gap-y-2 md:grid-cols-2">
            {latest.map((r) => (
              <li key={r.id}>
                <ListingRow result={r} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
            <p className="font-semibold">Inga annonser än</p>
            <p className="mt-1 text-sm text-muted-foreground">Lägg upp det första du vill hyra ut.</p>
            <Link
              to="/ny-annons"
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              <Plus className="h-4 w-4" /> Lägg upp annons
            </Link>
          </div>
        )}
      </section>

      <section className="mx-auto mt-16 max-w-6xl px-4 sm:px-6">
        <div className="grid gap-8 rounded-3xl bg-foreground px-6 py-10 text-background sm:px-10 md:grid-cols-[1fr_2fr]">
          <div>
            <h2 className="font-display text-3xl font-bold leading-tight">Hyr ut det du sällan använder</h2>
            <Link
              to="/ny-annons"
              className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
            >
              <Plus className="h-4 w-4" /> Lägg upp annons
            </Link>
          </div>
          <ol className="grid gap-6 sm:grid-cols-3">
            {[
              ["Fota och beskriv", "Några bilder, ett pris per dygn och vad som ingår."],
              ["Svara på förfrågningar", "Du väljer vem som får hyra och vilka dagar."],
              ["Lämna över", "Ni möts, tar bilder på skicket och ger varandra betyg."],
            ].map(([title, text], i) => (
              <li key={title}>
                <span className="font-display text-4xl font-extrabold text-primary">{i + 1}</span>
                <span className="mt-1 block font-semibold">{title}</span>
                <span className="text-sm opacity-70">{text}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
}
