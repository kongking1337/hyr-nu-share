// PROTOTYP B – "Tunnelbana": platsen först. Delad hero med sökformulär + områden som en T-banelinje,
// kategorier i linjefärger, karuseller per tema.
import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, MapPin, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { ExampleBadge } from "@/components/ExampleBadge";
import { ACTIVE_CATEGORIES } from "@/lib/categories";
import { REGION } from "@/lib/geo";
import { LOCATIONS } from "@/lib/search/useSearchResults";
import type { UnifiedResult } from "@/lib/providers/types";
import { AccountMenu, BottomTabs, iconFor, kr, useBodyClass, useHomeData } from "./shared";
import "./prototype.css";

export const name = "Tunnelbana";

const LINE_COLORS = ["var(--line-green)", "var(--line-red)", "var(--line-blue)"];

function Card({ r }: { r: UnifiedResult }) {
  return (
    <Link
      to="/annons/$id"
      params={{ id: r.id }}
      className="group block w-[260px] shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-[300px]"
    >
      <div className="relative aspect-[3/2] overflow-hidden bg-muted">
        <img src={r.images[0]} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        {r.example && <div className="absolute left-3 top-3"><ExampleBadge /></div>}
      </div>
      <div className="flex items-end justify-between gap-3 p-4">
        <div className="min-w-0">
          <h3 className="line-clamp-1 font-semibold">{r.title}</h3>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" /> {r.area ?? r.city}
          </p>
        </div>
        <p className="shrink-0 text-right leading-tight">
          <span className="block text-lg font-bold">{kr(r.priceDay)}</span>
          <span className="text-xs text-muted-foreground">per dygn</span>
        </p>
      </div>
    </Link>
  );
}

function Row({ title, items, onMore }: { title: string; items: UnifiedResult[]; onMore: () => void }) {
  if (!items.length) return null;
  return (
    <section className="mt-14">
      <div className="mb-4 flex items-baseline justify-between px-4 sm:px-6">
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        <button onClick={onMore} className="flex items-center gap-1 text-sm font-semibold text-primary">
          Se fler <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      <div className="flex snap-x scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:scroll-px-6 sm:px-6">
        {items.map((r) => <Card key={r.id} r={r} />)}
      </div>
    </section>
  );
}

export function VariantB() {
  useBodyClass("proto-b");
  const { listings, go } = useHomeData();
  const [q, setQ] = useState("");
  const [loc, setLoc] = useState(REGION.slug);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const areas = useMemo(() => {
    const m = new Map<string, UnifiedResult[]>();
    for (const r of listings) {
      const a = r.area ?? r.city;
      m.set(a, [...(m.get(a) ?? []), r]);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 6);
  }, [listings]);

  const pick = (cats: string[]) => listings.filter((r) => cats.includes(r.category));

  return (
    <div className="proto-b min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 bg-primary text-primary-foreground dark:border-b dark:border-border dark:bg-card dark:text-foreground">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-primary-foreground text-sm font-extrabold text-primary">H</span>
            <span className="text-lg font-extrabold tracking-tight">Hyrkoll</span>
          </Link>
          <nav className="hidden gap-1 text-sm font-medium md:flex">
            <Link to="/sok" search={{} as never} className="rounded-full px-3 py-1.5 hover:bg-white/10">Hyra</Link>
            <Link to="/ny-annons" className="rounded-full px-3 py-1.5 hover:bg-white/10">Hyr ut</Link>
          </nav>
          <AccountMenu className="ml-auto border-transparent text-foreground" />
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-6 pt-10 sm:px-6 lg:grid-cols-[7fr_5fr] lg:pt-16">
        <div>
          <h1 className="max-w-[14ch] text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Hyr av någon i ditt område.
          </h1>
          <p className="mt-4 max-w-md text-lg text-muted-foreground">
            Släpvagnar, verktyg och partytält från grannar och företag i Stockholms län.
          </p>

          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              go({ q, location: loc, from, to });
            }}
            className="mt-8 rounded-2xl border border-border bg-card p-3 shadow-[0_10px_30px_-12px_rgb(15_40_90/0.25)]"
          >
            <div className="flex items-center gap-2">
              <label className="flex flex-1 items-center gap-3 rounded-xl px-3 py-2 focus-within:bg-muted">
                <Search className="h-5 w-5 text-primary" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Vad vill du hyra?"
                  className="w-full bg-transparent py-1.5 text-lg outline-none placeholder:text-muted-foreground"
                />
              </label>
              <button type="submit" className="hidden rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground hover:opacity-90 sm:block">
                Visa saker
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[1.3fr_1fr_1fr]">
              <label className="col-span-2 flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5 text-sm sm:col-span-1">
                <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="sr-only">Var</span>
                <select value={loc} onChange={(e) => setLoc(e.target.value)} className="w-full bg-transparent outline-none">
                  {LOCATIONS.filter((l) => l.slug !== "nara-mig").map((l) => <option key={l.slug} value={l.slug}>{l.name}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5 text-sm">
                <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="sr-only">Från</span>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full min-w-0 bg-transparent outline-none" />
              </label>
              <label className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5 text-sm">
                <span className="text-muted-foreground">till</span>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full min-w-0 bg-transparent outline-none" />
              </label>
              <button type="submit" className="col-span-2 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground sm:hidden">
                Visa saker
              </button>
            </div>
          </form>
        </div>

        <aside aria-label="Områden" className="rounded-3xl border border-border bg-card p-6">
          <h2 className="font-bold">Nära dig</h2>
          <p className="text-sm text-muted-foreground">Flest saker att hyra just nu</p>
          <ol className="relative mt-5">
            <span aria-hidden className="absolute bottom-3 left-[9px] top-3 w-1.5 rounded-full" style={{ background: "var(--line-green)" }} />
            {areas.map(([area, items]) => (
              <li key={area}>
                <button
                  onClick={() => go({ q: area })}
                  className="group relative flex w-full items-center gap-4 rounded-xl py-2 pr-2 text-left hover:bg-muted"
                >
                  <span className="relative z-10 h-6 w-6 shrink-0 rounded-full border-[5px] bg-card" style={{ borderColor: "var(--line-green)" }} />
                  <span className="flex-1">
                    <span className="block font-semibold">{area}</span>
                    <span className="text-sm text-muted-foreground">{items.length} {items.length === 1 ? "sak" : "saker"}</span>
                  </span>
                  <span className="flex -space-x-2">
                    {items.slice(0, 3).map((r) => (
                      <img key={r.id} src={r.images[0]} alt="" className="h-9 w-9 rounded-full border-2 border-card object-cover" />
                    ))}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </aside>
      </section>

      <section aria-label="Kategorier" className="mx-auto mt-6 max-w-6xl px-4 sm:px-6">
        <ul className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none]">
          {ACTIVE_CATEGORIES.map(({ slug, name }, i) => {
            const Icon = iconFor(slug);
            return (
              <li key={slug}>
                <button
                  onClick={() => go({ q: "", category: slug })}
                  className="flex items-center gap-2.5 whitespace-nowrap rounded-full border border-border bg-card py-1.5 pl-1.5 pr-4 text-sm font-semibold hover:border-primary"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-full text-white" style={{ background: LINE_COLORS[i % 3] }}>
                    <Icon className="h-4 w-4" />
                  </span>
                  {name}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="mx-auto max-w-6xl">
        <Row title="Nytt den här veckan" items={listings.slice(0, 8)} onMore={() => go({ q: "" })} />
        <Row title="Till helgen: fest och fritid" items={pick(["fest", "fritid", "kamera"])} onMore={() => go({ q: "", category: "fest" })} />
        <Row title="För bygget och trädgården" items={pick(["verktyg", "bygg", "tradgard", "slapvagn"])} onMore={() => go({ q: "", category: "verktyg" })} />

        <section className="mx-4 mt-16 rounded-3xl bg-primary px-6 py-10 text-primary-foreground sm:mx-6 sm:px-10">
          <h2 className="text-2xl font-extrabold tracking-tight">Så hyr du</h2>
          <ol className="mt-6 grid gap-6 sm:grid-cols-3">
            {[
              ["Hitta något nära", "Sök på vanlig svenska och välj dagar i kalendern."],
              ["Skicka en förfrågan", "Uthyraren svarar, och ni bestämmer tid för hämtning."],
              ["Hämta och lämna tillbaka", "Ta bilder vid hämtning och återlämning. Betyg efteråt."],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-4">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-foreground font-extrabold text-primary">{i + 1}</span>
                <span>
                  <span className="block font-bold">{t}</span>
                  <span className="text-sm opacity-80">{d}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <div className="h-24" />
      <BottomTabs />
    </div>
  );
}
