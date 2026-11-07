import { Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { ExampleBadge } from "@/components/ExampleBadge";
import { FavoriteButton } from "@/components/FavoriteButton";
import { PriceTag } from "@/components/ListingRow";
import type { UnifiedResult } from "@/lib/providers/types";
import { cn } from "@/lib/utils";

/**
 * Annonskort: bilden först, sedan titel, plats och hyrlapp. Hela kortet är en länk
 * (sträckt över kortet), favoritknappen ligger ovanpå.
 */
export function ListingCard({
  result: r,
  distanceKm,
  layout = "grid",
}: {
  result: UnifiedResult;
  distanceKm?: number | null;
  layout?: "grid" | "list";
}) {
  const list = layout === "list";

  return (
    <article
      className={cn(
        "group relative rounded-2xl focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-4 focus-within:ring-offset-background",
        list && "flex gap-4 border border-border bg-card p-3 sm:gap-5",
      )}
    >
      <div
        className={cn(
          "relative shrink-0 overflow-hidden rounded-2xl bg-muted",
          list ? "h-28 w-28 rounded-xl sm:h-36 sm:w-48" : "aspect-[4/3]",
        )}
      >
        <img
          src={r.images[0]}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
        {r.example && !list && (
          <div className="absolute left-3 top-3">
            <ExampleBadge />
          </div>
        )}
      </div>

      <div className={cn("flex min-w-0 flex-1 flex-col", list ? "py-1 pr-10" : "mt-3 px-0.5")}>
        {/* Hela kortet går att trycka på: länken täcker kortet (hjärtat ligger ovanpå). */}
        <h3 className="line-clamp-2 font-sans text-[15px] font-semibold leading-snug tracking-normal">
          <Link
            to="/annons/$id"
            params={{ id: r.id }}
            className="outline-none after:absolute after:inset-0 after:rounded-2xl after:content-['']"
          >
            {r.title}
          </Link>
        </h3>
        <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {r.area ? `${r.area}, ` : ""}
            {r.city}
            {distanceKm != null && ` · ${distanceKm} km`}
            {" · "}
            {r.ownerType === "company" ? "Företag" : "Privatperson"}
          </span>
        </p>
        <div className={cn("flex flex-wrap items-center gap-2", list ? "mt-auto pt-2" : "mt-2.5")}>
          <PriceTag value={r.priceDay} />
          {r.example && list && <ExampleBadge />}
        </div>
      </div>

      <FavoriteButton listingId={r.id} className="absolute right-3 top-3 z-10" />
    </article>
  );
}
