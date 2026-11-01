// PROTOTYP C – "Hyrlapp": sökningen är en mening i stor stil, kategorier som bildrutor,
// annonser som en lista med priset på en hyrlapp.
import { Link } from "@tanstack/react-router";
import { MapPin, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { ExampleBadge } from "@/components/ExampleBadge";
import { ACTIVE_CATEGORIES } from "@/lib/categories";
import { REGION } from "@/lib/geo";
import { LOCATIONS } from "@/lib/search/useSearchResults";
import type { UnifiedResult } from "@/lib/providers/types";
import { AccountMenu, BottomTabs, dateRange, iconFor, kr, useBodyClass, useHomeData } from "./shared";
import "./prototype.css";

export const name = "Hyrlapp";

const WHEN = [
  { v: "", label: "när som helst" },
  { v: "today", label: "i dag" },
  { v: "weekend", label: "i helgen" },
  { v: "week", label: "i veckan" },
] as const;

const TRY = ["släpvagn i helgen", "högtryckstvätt", "partytält", "barnstol till bilen"];

function PriceTag({ value }: { value: number }) {
  return (
    <span className="relative inline-flex items-center rounded-r-md bg-primary py-1.5 pl-6 pr-3 text-primary-foreground [clip-path:polygon(14px_0,100%_0,100%_100%,14px_100%,0_50%)]">
      <span aria-hidden className="absolute left-[9px] h-1.5 w-1.5 rounded-full bg-background" />
      <span className="font-display text-base font-bold leading-none">{kr(value)}</span>
      <span className="ml-1 text-xs opacity-85">/dygn</span>
    </span>
  );
}

function ListRow({ r }: { r: UnifiedResult }) {
  return (
    <li>
      <Link
        to="/annons/$id"
        params={{ id: r.id }}
        className="group flex gap-4 rounded-2xl p-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-muted sm:h-28 sm:w-32">
          <img src={r.images[0]} alt="" loading="lazy" className="h-full w-full object-cover" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col py-1">
          <h3 className="line-clamp-2 font-semibold leading-snug">{r.title}</h3>
          <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" /> {r.area ?? r.city}, {r.ownerType === "company" ? "företag" : "privatperson"}
          </p>
          <div className="mt-auto flex items-center gap-2 pt-2">
            <PriceTag value={r.priceDay} />
            {r.example && <ExampleBadge />}
          </div>
        </div>
      </Link>
    </li>
  );
}

export function VariantC() {
  useBodyClass("proto-c");
  const { listings, loading, go } = useHomeData();
  const [q, setQ] = useState("");
  const [loc, setLoc] = useState(REGION.slug);
  const [when, setWhen] = useState<(typeof WHEN)[number]["v"]>("");

  const byCat = useMemo(() => {
    const m = new Map<string, UnifiedResult[]>();
    for (const r of listings) m.set(r.category, [...(m.get(r.category) ?? []), r]);
    return m;
  }, [listings]);

  const inline =
    "min-w-0 border-b-[3px] border-primary bg-transparent text-primary outline-none placeholder:text-primary/45 focus:border-foreground";

  return (
    <div className="proto-c min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link to="/" className="font-display text-2xl font-extrabold tracking-tight">
            hyrkoll<span className="text-primary">.</span>
          </Link>
          <Link
            to="/ny-annons"
            className="ml-auto hidden items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background sm:flex"
          >
            <Plus className="h-4 w-4" /> Hyr ut
          </Link>
          <AccountMenu className="ml-auto sm:ml-0" />
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-10 pt-12 sm:px-6 sm:pt-20">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            go({ q, location: loc, ...dateRange(when) });
          }}
          className="font-display text-[34px] font-bold leading-[1.25] tracking-tight sm:text-6xl sm:leading-[1.2]"
        >
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
          <select value={loc} onChange={(e) => setLoc(e.target.value)} aria-label="Var" className={`${inline} cursor-pointer appearance-none`}>
            {LOCATIONS.filter((l) => l.slug !== "nara-mig").map((l) => (
              <option key={l.slug} value={l.slug}>{l.slug === REGION.slug ? "hela Stockholm" : l.name}</option>
            ))}
          </select>{" "}
          <select value={when} onChange={(e) => setWhen(e.target.value as never)} aria-label="När" className={`${inline} cursor-pointer appearance-none`}>
            {WHEN.map((w) => <option key={w.v} value={w.v}>{w.label}</option>)}
          </select>
          <span>.</span>
          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3 font-sans text-base font-normal tracking-normal">
            <button type="submit" className="rounded-full bg-primary px-7 py-3.5 text-base font-semibold text-primary-foreground hover:opacity-90">
              Visa vad som finns
            </button>
            <span className="text-muted-foreground">Prova:</span>
            {TRY.map((t) => (
              <button key={t} type="button" onClick={() => go({ q: t })} className="text-sm underline decoration-border underline-offset-4 hover:decoration-primary">
                {t}
              </button>
            ))}
          </div>
        </form>
      </section>

      <section aria-labelledby="kat" className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 id="kat" className="font-display text-2xl font-bold tracking-tight">Kategorier</h2>
        <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ACTIVE_CATEGORIES.map(({ slug, name }) => {
            const items = byCat.get(slug) ?? [];
            const Icon = iconFor(slug);
            const img = items[0]?.images[0];
            return (
              <li key={slug}>
                <button
                  onClick={() => go({ q: "", category: slug })}
                  className="group relative flex aspect-[5/4] w-full flex-col justify-end overflow-hidden rounded-2xl bg-muted p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {img ? (
                    <>
                      <img src={img} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                    </>
                  ) : (
                    <Icon className="absolute right-4 top-4 h-10 w-10 text-primary" strokeWidth={1.5} />
                  )}
                  <span className={`relative font-display text-lg font-bold leading-tight ${img ? "text-white" : ""}`}>{name}</span>
                  <span className={`relative text-sm ${img ? "text-white/80" : "text-muted-foreground"}`}>
                    {loading ? "\u00a0" : items.length ? `${items.length} att hyra` : "Bli först att hyra ut"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="nytt" className="mx-auto mt-16 max-w-6xl px-4 sm:px-6">
        <div className="flex items-baseline justify-between">
          <h2 id="nytt" className="font-display text-2xl font-bold tracking-tight">Senast upplagt</h2>
          <button onClick={() => go({ q: "" })} className="text-sm font-semibold text-primary">Visa alla</button>
        </div>
        <ul className="mt-4 grid gap-x-6 gap-y-2 md:grid-cols-2">
          {listings.slice(0, 8).map((r) => <ListRow key={r.id} r={r} />)}
        </ul>
      </section>

      <section className="mx-auto mt-16 max-w-6xl px-4 sm:px-6">
        <div className="grid gap-8 rounded-3xl bg-foreground px-6 py-10 text-background sm:px-10 md:grid-cols-[1fr_2fr]">
          <div>
            <h2 className="font-display text-3xl font-bold leading-tight tracking-tight">Hyr ut det du sällan använder</h2>
            <Link to="/ny-annons" className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">
              <Plus className="h-4 w-4" /> Lägg upp annons
            </Link>
          </div>
          <ol className="grid gap-6 sm:grid-cols-3">
            {[
              ["Fota och beskriv", "Några bilder, ett pris per dygn och vad som ingår."],
              ["Svara på förfrågningar", "Du väljer vem som får hyra och vilka dagar."],
              ["Lämna över", "Ni möts, tar bilder på skicket och ger varandra betyg."],
            ].map(([t, d], i) => (
              <li key={t}>
                <span className="font-display text-4xl font-extrabold text-primary">{i + 1}</span>
                <span className="mt-1 block font-semibold">{t}</span>
                <span className="text-sm opacity-70">{d}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <div className="h-24" />
      <BottomTabs />
    </div>
  );
}
