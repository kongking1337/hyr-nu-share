import { Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { ExampleBadge } from "@/components/ExampleBadge";
import type { UnifiedResult } from "@/lib/providers/types";
import { cn } from "@/lib/utils";

const kr = (n: number) => `${Math.round(n).toLocaleString("sv-SE")} kr`;

/** Priset som en hyrlapp: orange etikett med hål. Sajtens kännetecken, använd för pris per dygn. */
export function PriceTag({ value, unit = "/dygn", className }: { value: number; unit?: string; className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex items-center rounded-r-md bg-primary py-1.5 pl-6 pr-3 text-primary-foreground [clip-path:polygon(14px_0,100%_0,100%_100%,14px_100%,0_50%)]",
        className,
      )}
    >
      <span aria-hidden className="absolute left-[9px] h-1.5 w-1.5 rounded-full bg-background" />
      <span className="font-display text-base font-bold leading-none">{kr(value)}</span>
      {unit && <span className="ml-1 text-xs opacity-85">{unit}</span>}
    </span>
  );
}

/** En annons som en rad: bild, titel, plats och hyrlapp. */
export function ListingRow({ result: r }: { result: UnifiedResult }) {
  return (
    <Link
      to="/annons/$id"
      params={{ id: r.id }}
      className="group flex gap-4 rounded-2xl p-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-muted sm:h-28 sm:w-32">
        <img src={r.images[0]} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col py-1">
        <h3 className="line-clamp-2 font-sans font-semibold leading-snug tracking-normal">{r.title}</h3>
        <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {r.area ?? r.city}, {r.ownerType === "company" ? "företag" : "privatperson"}
          </span>
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          <PriceTag value={r.priceDay} />
          {r.example && <ExampleBadge />}
        </div>
      </div>
    </Link>
  );
}
