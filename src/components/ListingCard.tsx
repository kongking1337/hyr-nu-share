import { Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExampleBadge } from "@/components/ExampleBadge";
import { FavoriteButton } from "@/components/FavoriteButton";
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
  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-3xl border border-border bg-card transition-shadow focus-within:ring-2 focus-within:ring-ring hover:shadow-lg",
        layout === "list" && "grid sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)]",
      )}
    >
      <div
        className={cn(
          "relative overflow-hidden bg-muted",
          layout === "grid" ? "aspect-[4/3]" : "h-full min-h-44",
        )}
      >
        <img
          src={r.images[0]}
          alt={r.title}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
        {r.example && (
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            <ExampleBadge />
          </div>
        )}
        <FavoriteButton listingId={r.id} className="absolute right-3 top-3 z-10" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
        {/* Hela kortet går att trycka på: länken täcker kortet (hjärtat ligger ovanpå). */}
        <h3 className="font-display text-base font-semibold leading-tight">
          <Link
            to="/annons/$id"
            params={{ id: r.id }}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            {r.title}
          </Link>
        </h3>
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
        <Button asChild className="relative z-10 rounded-full">
          <Link to="/annons/$id" params={{ id: r.id }} tabIndex={-1}>
            Visa annons
          </Link>
        </Button>
      </div>
    </article>
  );
}
