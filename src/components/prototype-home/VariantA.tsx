// PROTOTYP A – "Grannskap": utbudet är startsidan. Sökfält i sidhuvudet, kategoriremsa, bildrutnät.
import { Link } from "@tanstack/react-router";
import { Heart, LayoutGrid, Search } from "lucide-react";
import { useState } from "react";
import { ExampleBadge } from "@/components/ExampleBadge";
import { ACTIVE_CATEGORIES } from "@/lib/categories";
import { REGION } from "@/lib/geo";
import { LOCATIONS } from "@/lib/search/useSearchResults";
import type { UnifiedResult } from "@/lib/providers/types";
import { cn } from "@/lib/utils";
import {
  AccountMenu, BottomTabs, dateRange, iconFor, kr, useBodyClass, useHomeData, type SearchInput,
} from "./shared";
import "./prototype.css";

export const name = "Grannskap";

const WHEN = [
  { v: "", label: "När som helst" },
  { v: "today", label: "I dag" },
  { v: "weekend", label: "I helgen" },
  { v: "week", label: "Kommande 7 dagar" },
] as const;

function HeaderSearch({ onSubmit, className }: { onSubmit: (s: SearchInput) => void; className?: string }) {
  const [q, setQ] = useState("");
  const [loc, setLoc] = useState(REGION.slug);
  const [when, setWhen] = useState<(typeof WHEN)[number]["v"]>("");
  const field = "flex min-w-0 flex-col justify-center rounded-full px-5 py-2 text-left hover:bg-muted focus-within:bg-muted";
  const label = "text-[11px] font-semibold text-foreground";
  const input = "w-full bg-transparent text-sm text-muted-foreground outline-none placeholder:text-muted-foreground";
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ q, location: loc, ...dateRange(when) });
      }}
      className={cn(
        "flex items-stretch rounded-full border border-border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.06),0_4px_16px_rgb(0_0_0/0.05)]",
        className,
      )}
    >
      <label className={cn(field, "flex-[1.4]")}>
        <span className={label}>Vad</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Släpvagn, borrmaskin…" className={input} />
      </label>
      <span className="my-3 w-px bg-border" />
      <label className={cn(field, "flex-1")}>
        <span className={label}>Var</span>
        <select value={loc} onChange={(e) => setLoc(e.target.value)} className={cn(input, "appearance-none")}>
          {LOCATIONS.filter((l) => l.slug !== "nara-mig").map((l) => (
            <option key={l.slug} value={l.slug}>{l.name}</option>
          ))}
        </select>
      </label>
      <span className="my-3 w-px bg-border" />
      <label className={cn(field, "flex-1")}>
        <span className={label}>När</span>
        <select value={when} onChange={(e) => setWhen(e.target.value as never)} className={cn(input, "appearance-none")}>
          {WHEN.map((w) => <option key={w.v} value={w.v}>{w.label}</option>)}
        </select>
      </label>
      <button
        type="submit"
        aria-label="Sök"
        className="m-1.5 grid h-11 w-11 shrink-0 place-items-center self-center rounded-full bg-primary text-primary-foreground hover:opacity-90"
      >
        <Search className="h-[18px] w-[18px]" />
      </button>
    </form>
  );
}

function Tile({ r }: { r: UnifiedResult }) {
  return (
    <Link to="/annons/$id" params={{ id: r.id }} className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-muted">
        <img src={r.images[0]} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        {r.example && <div className="absolute left-3 top-3"><ExampleBadge /></div>}
        <span className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/25 text-white backdrop-blur-sm">
          <Heart className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-2.5 space-y-0.5 px-0.5">
        <h3 className="line-clamp-1 text-[15px] font-semibold">{r.title}</h3>
        <p className="text-sm text-muted-foreground">
          {r.area ?? r.city} · {r.ownerType === "company" ? "Företag" : "Privatperson"}
        </p>
        <p className="pt-0.5 text-[15px]">
          <span className="font-semibold">{kr(r.priceDay)}</span> <span className="text-muted-foreground">per dygn</span>
        </p>
      </div>
    </Link>
  );
}

export function VariantA() {
  useBodyClass("proto-a");
  const { listings, loading, go } = useHomeData();
  const [cat, setCat] = useState<string>("all");
  const shown = cat === "all" ? listings : listings.filter((r) => r.category === cat);

  return (
    <div className="proto-a min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-20 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">H</span>
            <span className="text-lg font-semibold tracking-tight">Hyrkoll</span>
          </Link>
          <HeaderSearch onSubmit={go} className="mx-auto hidden w-full max-w-[620px] md:flex" />
          <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">
            <Link to="/ny-annons" className="hidden rounded-full px-4 py-2 text-sm font-medium hover:bg-muted lg:block">
              Hyr ut något
            </Link>
            <AccountMenu />
          </div>
        </div>

        <div className="px-4 pb-3 md:hidden">
          <button
            onClick={() => go({ q: "" })}
            className="flex w-full items-center gap-3 rounded-full border border-border bg-card px-4 py-3 text-left shadow-sm"
          >
            <Search className="h-4 w-4" />
            <span>
              <span className="block text-sm font-semibold">Vad vill du hyra?</span>
              <span className="block text-xs text-muted-foreground">Hela Stockholm · När som helst</span>
            </span>
          </button>
        </div>

        <nav aria-label="Kategorier" className="mx-auto max-w-7xl px-4 sm:px-6">
          <ul className="-mb-px flex gap-7 overflow-x-auto [scrollbar-width:none]">
            {[{ slug: "all", name: "Allt" }, ...ACTIVE_CATEGORIES].map(({ slug, name }) => {
              const Icon = slug === "all" ? LayoutGrid : iconFor(slug);
              const active = cat === slug;
              return (
                <li key={slug}>
                  <button
                    onClick={() => setCat(slug)}
                    aria-pressed={active}
                    className={cn(
                      "flex flex-col items-center gap-1.5 whitespace-nowrap border-b-2 pb-3 pt-2 text-xs transition-colors",
                      active
                        ? "border-foreground font-semibold text-foreground"
                        : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                    )}
                  >
                    <Icon className="h-6 w-6" strokeWidth={1.6} />
                    {name}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6">
        <div className="mb-6 flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">
            {cat === "all" ? "Att hyra i Stockholm just nu" : ACTIVE_CATEGORIES.find((c) => c.slug === cat)?.name}
          </h1>
          <button onClick={() => go({ q: "", category: cat === "all" ? undefined : cat })} className="shrink-0 text-sm font-medium underline underline-offset-4">
            Visa alla
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4" aria-busy="true">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i}>
                <div className="aspect-square animate-pulse rounded-2xl bg-muted" />
                <div className="mt-3 h-4 w-3/4 animate-pulse rounded bg-muted" />
                <div className="mt-2 h-4 w-1/3 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : shown.length ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
            {shown.map((r) => <Tile key={r.id} r={r} />)}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
            <p className="font-semibold">Inget uthyrt i den här kategorin än</p>
            <p className="mt-1 text-sm text-muted-foreground">Har du något som passar? Bli först att hyra ut.</p>
            <Link to="/ny-annons" className="mt-4 inline-block rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground">
              Lägg upp annons
            </Link>
          </div>
        )}

        <section className="mt-16 grid items-center gap-6 rounded-3xl bg-accent px-6 py-10 text-accent-foreground sm:grid-cols-[1fr_auto] sm:px-10">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Står borrmaskinen still i förrådet?</h2>
            <p className="mt-1 max-w-lg text-sm opacity-80">
              Lägg upp den på några minuter. Du bestämmer pris, dagar och vem som får hyra.
            </p>
          </div>
          <Link to="/ny-annons" className="justify-self-start rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground">
            Hyr ut något
          </Link>
        </section>
      </main>
      <BottomTabs />
    </div>
  );
}
