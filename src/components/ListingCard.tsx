import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Heart, MapPin } from "lucide-react";
import { toast } from "sonner";
import { ExampleBadge } from "@/components/ExampleBadge";
import { PriceTag } from "@/components/ListingRow";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Sparar annonsen, eller tar bort den om den redan är sparad.
  async function favorite() {
    if (!user) {
      toast.info("Logga in för att spara favoriter.");
      return;
    }
    const { error } = await supabase.from("favorites").insert({ user_id: user.id, listing_id: r.id });
    if (error?.code === "23505") {
      const { error: removeError } = await supabase
        .from("favorites")
        .delete()
        .eq("user_id", user.id)
        .eq("listing_id", r.id);
      toast[removeError ? "error" : "success"](removeError ? "Kunde inte ta bort favoriten" : "Borttagen från favoriter");
    } else {
      toast[error ? "error" : "success"](error ? "Kunde inte spara favoriten" : "Sparad i favoriter");
    }
    void queryClient.invalidateQueries({ queryKey: ["favorites"] });
  }

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
        <h3 className="line-clamp-2 font-sans text-[15px] font-semibold leading-snug tracking-normal">
          <Link to="/annons/$id" params={{ id: r.id }} className="outline-none after:absolute after:inset-0 after:rounded-2xl">
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

      <button
        type="button"
        onClick={favorite}
        aria-label={`Spara eller ta bort ${r.title} som favorit`}
        className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-background/90 backdrop-blur transition-colors hover:bg-background hover:text-primary"
      >
        <Heart className="h-4 w-4" />
      </button>
    </article>
  );
}
