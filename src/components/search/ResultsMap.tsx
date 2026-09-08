import { useState } from "react";
import { Button } from "@/components/ui/button";
import { kr, quote } from "@/lib/pricing";
import type { UnifiedResult } from "@/lib/providers/types";
import type { Center } from "@/lib/search/useSearchResults";
import { cn } from "@/lib/utils";

/** Mock-karta med geografiska prisnålar. Ingen extern karttjänst används. */
export function ResultsMap({
  results,
  days,
  center,
  radiusKm,
  onSearchArea,
}: {
  results: UnifiedResult[];
  days: number;
  center: Center;
  radiusKm: number;
  onSearchArea: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const spread = center.nationwide ? 8 : Math.max(radiusKm / 60, 0.15);
  const active = results.find((r) => r.id === selected);

  return (
    <div className="relative h-[600px] overflow-hidden rounded-3xl border border-border bg-secondary">
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "linear-gradient(var(--color-border) 1px, transparent 1px), linear-gradient(90deg, var(--color-border) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      {!center.nationwide && (
        <div className="absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-primary/50 bg-primary/5" />
      )}

      {results.slice(0, 40).map((r) => {
        const x = 50 + ((r.lng - center.lng) / spread) * 40;
        const y = 50 - ((r.lat - center.lat) / spread) * 40;
        const q = quote(r, days);
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => setSelected(r.id)}
            style={{ left: `${Math.min(94, Math.max(4, x))}%`, top: `${Math.min(90, Math.max(6, y))}%` }}
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold shadow-sm transition-colors",
              selected === r.id && "border-primary bg-primary text-primary-foreground",
            )}
          >
            {kr(q.total)}
          </button>
        );
      })}

      <div className="absolute left-1/2 top-4 -translate-x-1/2">
        <Button size="sm" className="rounded-full shadow-lg" onClick={onSearchArea}>
          Sök i detta område
        </Button>
      </div>

      {active && (
        <div className="absolute bottom-4 left-1/2 w-[min(420px,92%)] -translate-x-1/2 rounded-2xl border border-border bg-card p-3 shadow-xl">
          <div className="flex gap-3">
            <img src={active.images[0]} alt={active.title} loading="lazy" className="h-16 w-20 rounded-xl object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{active.title}</p>
              <p className="text-xs text-muted-foreground">
                {active.city} · {active.source.kind === "internal" ? `På ${active.source.name}` : `Från ${active.source.name}`}
              </p>
              <p className="text-sm font-semibold text-primary">{kr(quote(active, days).total)} totalt</p>
            </div>
            <button className="text-xs text-muted-foreground" onClick={() => setSelected(null)}>
              Stäng
            </button>
          </div>
        </div>
      )}

      <p className="absolute bottom-2 right-3 text-[11px] text-muted-foreground">Demokarta – ingen karttjänst kopplad</p>
    </div>
  );
}
