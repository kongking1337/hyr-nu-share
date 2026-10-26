import { Link } from "@tanstack/react-router";
import { ExternalLink, Heart, MapPin, Scale, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ExampleBadge } from "@/components/ExampleBadge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompare } from "@/hooks/useCompare";
import { kr, quote } from "@/lib/pricing";
import type { UnifiedResult } from "@/lib/providers/types";
import { cn } from "@/lib/utils";

export function ListingCard({
  result,
  days,
  distanceKm,
  badges = [],
}: {
  result: UnifiedResult;
  days: number;
  distanceKm?: number;
  badges?: string[];
}) {
  const q = quote(result, days);
  const { user } = useAuth();
  const { toggle, has } = useCompare();
  const internal = result.source.kind === "internal";

  async function favorite() {
    if (!internal) {
      toast.info("Externa demoresultat kan inte sparas som favorit ännu.");
      return;
    }
    if (!user) {
      toast.info("Logga in för att spara favoriter.");
      return;
    }
    const { error } = await supabase
      .from("favorites")
      .insert({ user_id: user.id, listing_id: result.id });
    toast[error ? "error" : "success"](
      error ? "Kunde inte spara (kanske redan sparad)" : "Sparad i favoriter",
    );
  }

  return (
    <article className="group overflow-hidden rounded-3xl border border-border bg-card transition-shadow hover:shadow-lg">
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <img
          src={result.images[0]}
          alt={result.title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {result.example && <ExampleBadge />}
          {badges.map((b) => (
            <span
              key={b}
              className="rounded-full bg-foreground px-2.5 py-1 text-[11px] font-semibold text-background"
            >
              {b}
            </span>
          ))}
        </div>
        <button
          onClick={favorite}
          aria-label="Spara som favorit"
          className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-background/90 backdrop-blur transition-colors hover:bg-background"
        >
          <Heart className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-base font-semibold leading-tight">{result.title}</h3>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {result.area ? `${result.area}, ` : ""}
            {result.city}
            {distanceKm != null && ` · ${distanceKm} km`}
          </span>
          <span>{result.ownerType === "company" ? "Företag" : "Privatperson"}</span>
          {result.instantBook && (
            <span className="flex items-center gap-1 text-primary">
              <Zap className="h-3.5 w-3.5" /> Direktbokning
            </span>
          )}
        </div>

        <div className="flex items-end justify-between gap-3 rounded-2xl bg-muted/60 p-3">
          <div>
            <p className="text-xs text-muted-foreground">Jämförbart dagspris</p>
            <p className="font-display text-lg font-semibold">{kr(q.comparableDayPrice)}/dygn</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Totalt {days} dygn</p>
            <p className="font-display text-lg font-semibold text-primary">{kr(q.total)}</p>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Grundpris {kr(q.base)} ({q.breakdownLabel})
          {q.deposit > 0 && ` · deposition ${kr(q.deposit)}`}
        </p>

        <div className="flex gap-2">
          {internal ? (
            <Button asChild className="flex-1 rounded-full">
              <Link to="/annons/$id" params={{ id: result.id }}>
                Visa annons
              </Link>
            </Button>
          ) : (
            <Button asChild variant="secondary" className="flex-1 rounded-full">
              <a href={result.externalUrl} target="_blank" rel="noopener noreferrer">
                Visa erbjudande <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </a>
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            className={cn("rounded-full", has(result.id) && "border-primary text-primary")}
            aria-label="Lägg till i jämförelse"
            onClick={() => toggle(result)}
          >
            <Scale className="h-4 w-4" />
          </Button>
        </div>
        {!internal && (
          <p className="text-[11px] text-muted-foreground">
            Demodata från extern källa. Kräver avtal innan skarp integration.
          </p>
        )}
      </div>
    </article>
  );
}
