import { Link } from "@tanstack/react-router";
import { ExternalLink, Gavel, Heart, Layers, MapPin, Sparkles, Star, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { kr, quote } from "@/lib/pricing";
import { advertisedPrice, priceBaseLabel } from "@/lib/search/filter-sort";
import type { PriceBase } from "@/lib/search/params";
import type { ResultGroup } from "@/lib/search/dedupe";
import type { UnifiedResult } from "@/lib/providers/types";
import { marketIndicator } from "@/lib/price-insights";
import { cn } from "@/lib/utils";
import { useState } from "react";

function specLine(r: UnifiedResult): string {
  const parts = [
    r.ownerType === "company" ? "Företag" : "Privat",
    r.deposit > 0 ? `Deposition ${kr(r.deposit)}` : "Ingen deposition",
    r.deliveryAvailable ? "Leverans" : "Upphämtning",
  ];
  return parts.join(" · ");
}

function SourceTag({ r }: { r: UnifiedResult }) {
  const internal = r.source.kind === "internal";
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-[11px] font-semibold",
        internal ? "bg-primary text-primary-foreground" : "bg-foreground/85 text-background",
      )}
    >
      {internal ? `På ${r.source.name}` : `Från ${r.source.name}`}
    </span>
  );
}

export function ResultCard({
  group,
  days,
  distance,
  priceBase,
  layout,
  marketDay,
  marketSample,
}: {
  group: ResultGroup;
  days: number;
  distance: number | null;
  priceBase: PriceBase;
  layout: "grid" | "list";
  /** Medianpris per dygn bland jämförbara träffar – underlag för marknadsindikatorn */
  marketDay?: number | null;
  marketSample?: number;
}) {
  const r = group.primary;
  const [openOffers, setOpenOffers] = useState(false);
  const { user } = useAuth();
  const q = quote(r, days);
  const ads = advertisedPrice(r, priceBase, days);
  const internal = r.source.kind === "internal";

  const indicator = marketIndicator(r.priceDay, marketDay, marketSample ?? 0);

  const cheapest = [...group.offers].sort((a, b) => quote(a, days).total - quote(b, days).total)[0]!;

  async function favorite() {
    if (!internal) {
      toast.info("Externa demoresultat kan inte sparas ännu.");
      return;
    }
    if (!user) {
      toast.info("Logga in för att spara favoriter.");
      return;
    }
    const { error } = await supabase.from("favorites").insert({ user_id: user.id, listing_id: r.id });
    toast[error ? "error" : "success"](error ? "Kunde inte spara" : "Sparad i favoriter");
  }

  const image = (
    <div className={cn("relative overflow-hidden bg-muted", layout === "grid" ? "aspect-[4/3]" : "h-full min-h-44")}>
      <img
        src={r.images[0]}
        alt={r.title}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
      />
      <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
        <SourceTag r={r} />
        {r.allowOffers && (
          <span className="flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-foreground">
            <Gavel className="h-3 w-3" /> Bud välkomna
          </span>
        )}
        {group.sources > 1 && (
          <span className="flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-semibold backdrop-blur">
            <Layers className="h-3 w-3" /> Finns på {group.sources} plattformar
          </span>
        )}
      </div>
      <button
        onClick={favorite}
        aria-label="Spara som favorit"
        className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-background/90 backdrop-blur hover:bg-background"
      >
        <Heart className="h-4 w-4" />
      </button>
    </div>
  );

  const body = (
    <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-base font-semibold leading-tight">{r.title}</h3>
        <span className="flex shrink-0 items-center gap-1 text-sm">
          <Star className="h-3.5 w-3.5 fill-accent text-accent" />
          {r.rating.toFixed(1)}
          <span className="text-muted-foreground">({r.reviewCount})</span>
        </span>
      </div>

      <p className="text-xs text-muted-foreground">{specLine(r)}</p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" />
          {r.area ? `${r.area}, ` : ""}
          {r.city}
          {distance != null && ` · ${distance} km`}
        </span>
        {r.instantBook ? (
          <span className="flex items-center gap-1 text-primary">
            <Zap className="h-3.5 w-3.5" /> Direktbokning
          </span>
        ) : (
          <span>Bokningsförfrågan</span>
        )}
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 rounded-2xl bg-muted/60 px-3 py-2.5">
        <div>
          <p className="text-[11px] text-muted-foreground">Annonserat pris</p>
          <p className="font-display text-lg font-semibold">
            {kr(ads)}
            <span className="text-sm font-normal text-muted-foreground">{priceBaseLabel(priceBase)}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-muted-foreground">Totalt {days} dygn</p>
          <p className="font-display text-lg font-semibold text-primary">{kr(q.total)}</p>
        </div>
      </div>

      {indicator && (
        <p
          className={cn(
            "flex items-center gap-1 text-[11px] font-medium",
            indicator.tone === "good" && "text-emerald-600 dark:text-emerald-400",
            indicator.tone === "high" && "text-amber-600 dark:text-amber-400",
            indicator.tone === "neutral" && "text-muted-foreground",
          )}
          title="AI-uppskattning baserad på jämförbara egna annonser och märkta demokällor."
        >
          <Sparkles className="h-3 w-3" /> {indicator.label}
          {indicator.estimate && <span className="text-muted-foreground"> · uppskattning</span>}
        </p>
      )}

      {group.sources > 1 && (
        <div className="rounded-2xl border border-dashed border-border p-2.5">
          <button
            type="button"
            onClick={() => setOpenOffers((o) => !o)}
            className="text-xs font-semibold text-primary"
          >
            {openOffers ? "Dölj erbjudanden" : `Jämför ${group.offers.length} erbjudanden`}
          </button>
          {openOffers && (
            <ul className="mt-2 space-y-1.5">
              {[...group.offers]
                .sort((a, b) => quote(a, days).total - quote(b, days).total)
                .map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate">
                      {o.source.kind === "internal" ? `På ${o.source.name}` : `Från ${o.source.name}`}
                    </span>
                    <span className={cn("shrink-0 font-semibold", o.id === cheapest.id && "text-primary")}>
                      {kr(quote(o, days).total)}
                      {o.id === cheapest.id && " · billigast"}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex gap-2">
        {internal ? (
          <Button asChild className="flex-1 rounded-full">
            <Link to="/annons/$id" params={{ id: r.id }}>
              Visa & boka
            </Link>
          </Button>
        ) : null}
        {internal && r.allowOffers ? (
          <Button asChild variant="outline" className="rounded-full">
            <Link to="/annons/$id" params={{ id: r.id }}>
              Lägg bud
            </Link>
          </Button>
        ) : null}
        {!internal && (
          <Button asChild variant="secondary" className="flex-1 rounded-full">
            <a href={r.externalUrl} target="_blank" rel="noopener noreferrer">
              Visa erbjudande <ExternalLink className="ml-1 h-3.5 w-3.5" />
            </a>
          </Button>
        )}
      </div>
      {!internal && (
        <p className="text-[11px] text-muted-foreground">
          Demodata från extern källa – kräver avtal/API innan skarp integration.
        </p>
      )}
    </div>
  );

  return (
    <article
      className={cn(
        "group overflow-hidden rounded-3xl border border-border bg-card transition-shadow hover:shadow-lg",
        layout === "list" && "grid sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)]",
      )}
    >
      {image}
      {body}
    </article>
  );
}
