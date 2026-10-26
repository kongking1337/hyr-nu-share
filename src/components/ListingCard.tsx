import { Link } from "@tanstack/react-router";
import { Heart, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ExampleBadge } from "@/components/ExampleBadge";
import { ListingTypeBadge } from "@/components/ListingTypeBadge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { priceLabel } from "@/lib/pricing";
import type { UnifiedResult } from "@/lib/providers/types";
import { cn } from "@/lib/utils";

export function ListingCard({
  result: r,
  distanceKm,
  layout = "grid",
}: {
  result: UnifiedResult;
  distanceKm?: number | null;
  layout?: "grid" | "list";
}) {
  const { user } = useAuth();

  async function favorite() {
    if (!user) {
      toast.info("Logga in för att spara favoriter.");
      return;
    }
    const { error } = await supabase.from("favorites").insert({ user_id: user.id, listing_id: r.id });
    toast[error ? "error" : "success"](error ? "Kunde inte spara (kanske redan sparad)" : "Sparad i favoriter");
  }

  return (
    <article
      className={cn(
        "group overflow-hidden rounded-3xl border border-border bg-card transition-shadow hover:shadow-lg",
        layout === "list" && "grid sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)]",
      )}
    >
      <div className={cn("relative overflow-hidden bg-muted", layout === "grid" ? "aspect-[4/3]" : "h-full min-h-44")}>
        <img
          src={r.images[0]}
          alt={r.title}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <ListingTypeBadge type={r.listingType} />
          {r.example && <ExampleBadge />}
        </div>
        <button
          onClick={favorite}
          aria-label="Spara som favorit"
          className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-background/90 backdrop-blur hover:bg-background"
        >
          <Heart className="h-4 w-4" />
        </button>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
        <h3 className="font-display text-base font-semibold leading-tight">{r.title}</h3>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {r.area ? `${r.area}, ` : ""}
            {r.city}
            {distanceKm != null && ` · ${distanceKm} km`}
          </span>
          <span>{r.ownerType === "company" ? "Företag" : "Privatperson"}</span>
        </div>
        <p className="mt-auto font-display text-lg font-semibold">{priceLabel(r)}</p>
        <Button asChild className="rounded-full">
          <Link to="/annons/$id" params={{ id: r.id }}>
            Visa annons
          </Link>
        </Button>
      </div>
    </article>
  );
}
