/**
 * PROTOTYP – slängkod. Tre varianter av startsidan, växla med ?variant=A|B|C på "/".
 * Frågan den besvarar: vilket utseende ska omdesignen använda?
 * Tas bort från main när en variant valts (sparas på grenen prototype/home-redesign).
 */
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Baby, Camera, ChevronLeft, ChevronRight, Flower2, HardHat, Heart, MessageSquare, Moon, Package,
  PartyPopper, Plus, Search, Sun, Tent, Truck, User, Wrench, type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { rowToUnified } from "@/lib/providers/internal";
import { interpretQuery } from "@/lib/search/parse-query";
import { DEFAULTS, cleanParams } from "@/lib/search/params";
import { CITIES, REGION } from "@/lib/geo";
import { cn } from "@/lib/utils";

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  slapvagn: Truck,
  verktyg: Wrench,
  kamera: Camera,
  fest: PartyPopper,
  tradgard: Flower2,
  fritid: Tent,
  bygg: HardHat,
  barn: Baby,
};
export const iconFor = (slug: string) => CATEGORY_ICONS[slug] ?? Package;

export type SearchInput = { q: string; location?: string; from?: string; to?: string; category?: string | undefined };

export function useHomeData() {
  const navigate = useNavigate();
  const { data: listings = [], isPending: loading } = useQuery({
    queryKey: ["prototype-home-listings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("listings")
        .select("*")
        .eq("status", "published")
        .eq("listing_type", "rent")
        .in("city", CITIES.map((c) => c.name))
        .order("published_at", { ascending: false })
        .limit(24);
      return (data ?? []).map(rowToUnified);
    },
  });

  function go(s: SearchInput) {
    const intent = interpretQuery(s.q);
    void navigate({
      to: "/sok",
      search: cleanParams({
        ...DEFAULTS,
        ...intent.patch,
        q: s.q,
        location: s.location && s.location !== REGION.slug ? s.location : (intent.patch.location ?? REGION.slug),
        from: s.from ?? "",
        to: s.to ?? "",
        ...(s.category ? { category: s.category, sub: "all" } : {}),
      }) as never,
    });
  }

  return { listings, loading, go };
}

/** Datum för "i helgen" / "i dag" som ISO-strängar. */
export function dateRange(kind: "today" | "weekend" | "week" | "") {
  if (!kind) return { from: "", to: "" };
  const d = new Date();
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  if (kind === "today") return { from: iso(d), to: iso(d) };
  if (kind === "week") {
    const e = new Date(d);
    e.setDate(d.getDate() + 6);
    return { from: iso(d), to: iso(e) };
  }
  const sat = new Date(d);
  sat.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
  const sun = new Date(sat);
  sun.setDate(sat.getDate() + 1);
  return { from: iso(sat), to: iso(sun) };
}

export function kr(n: number) {
  return `${Math.round(n).toLocaleString("sv-SE")} kr`;
}

/** Kontomenyn som ersätter raden av ikoner och knappar i dagens sidhuvud. */
export function AccountMenu({ className }: { className?: string }) {
  const { user } = useAuth();
  const { dark, toggle } = useTheme();
  const initial = (user?.email ?? "?").slice(0, 1).toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex h-10 items-center gap-2 rounded-full border border-border bg-card pl-3 pr-1 text-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        aria-label="Kontomeny"
      >
        <span className="hidden sm:inline">{user ? "Konto" : "Logga in"}</span>
        <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {user ? initial : <User className="h-4 w-4" />}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {user ? (
          <>
            <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{user.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link to="/bokningar">Bokningar</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/meddelanden" search={{}}>Meddelanden</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/mina-annonser">Mina annonser</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/favoriter">Favoriter och sparade sökningar</Link></DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link to="/konto">Mitt konto</Link></DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem asChild><Link to="/auth">Logga in</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/auth">Skapa konto</Link></DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link to="/ny-annons">Hyr ut något</Link></DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); toggle(); }}>
          {dark ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
          {dark ? "Ljust läge" : "Mörkt läge"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Flikrad längst ner på mobilen. */
export function BottomTabs({ className }: { className?: string }) {
  const tabs = [
    { to: "/sok", label: "Sök", icon: Search, search: DEFAULTS },
    { to: "/favoriter", label: "Favoriter", icon: Heart },
    { to: "/ny-annons", label: "Hyr ut", icon: Plus, primary: true },
    { to: "/meddelanden", label: "Meddelanden", icon: MessageSquare, search: {} },
    { to: "/konto", label: "Konto", icon: User },
  ];
  return (
    <nav
      aria-label="Huvudmeny"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden",
        className,
      )}
    >
      <ul className="grid grid-cols-5">
        {tabs.map(({ to, label, icon: Icon, search, primary }) => (
          <li key={to}>
            <Link
              to={to}
              search={search as never}
              className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground"
            >
              <span
                className={cn(
                  "grid h-7 w-7 place-items-center rounded-full",
                  primary && "bg-primary text-primary-foreground",
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
              </span>
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const NAMES: Record<string, string> = {
  A: "Grannskap – förfinad grön",
  B: "Tunnelbana – Stockholmsblå",
  C: "Hyrlapp – signalorange",
};

/** Flytande växlare för prototypen. Syns bara när ?variant= finns i adressen. */
export function PrototypeSwitcher({ current }: { current: string }) {
  const navigate = useNavigate();
  const { dark, toggle } = useTheme();
  const keys = Object.keys(NAMES);
  const i = Math.max(0, keys.indexOf(current));
  const to = (k: string) => void navigate({ to: "/", search: { variant: k } as never, replace: true });
  const step = (d: number) => to(keys[(i + d + keys.length) % keys.length]!);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="fixed bottom-20 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#202124] p-1 text-sm text-white shadow-2xl ring-1 ring-white/20 md:bottom-5">
      <button onClick={() => step(-1)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/15" aria-label="Föregående variant">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="whitespace-nowrap px-2 font-sans">
        <b>{keys[i]}</b> <span className="opacity-75">({NAMES[keys[i]!]})</span>
      </span>
      <button onClick={() => step(1)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/15" aria-label="Nästa variant">
        <ChevronRight className="h-4 w-4" />
      </button>
      <button onClick={toggle} className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/15" aria-label="Växla mörkt läge">
        {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
    </div>
  );
}

/** Läser ?variant= ur adressen ("" när den saknas). */
export function usePrototypeVariant(): string {
  return useRouterState({
    select: (s) =>
      s.location.pathname === "/" ? String((s.location.search as { variant?: string }).variant ?? "") : "",
  });
}

/** Sätter variantens klass på <body> så att menyer (som renderas utanför sidan) får rätt färger. */
export function useBodyClass(cls: string) {
  useEffect(() => {
    document.body.classList.add(cls);
    return () => document.body.classList.remove(cls);
  }, [cls]);
}
