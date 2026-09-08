import { Button } from "@/components/ui/button";
import { kr, quote } from "@/lib/pricing";
import type { UnifiedResult } from "@/lib/providers/types";

/** Enkel mock-karta: positionerar priser relativt sökcentrum. Ingen extern karttjänst. */
export function MapMock({
  results,
  days,
  center,
  radiusKm,
  onSearchArea,
}: {
  results: UnifiedResult[];
  days: number;
  center: { lat: number; lng: number };
  radiusKm: number;
  onSearchArea: () => void;
}) {
  const spread = Math.max(radiusKm / 60, 0.15);
  return (
    <div className="relative h-[520px] overflow-hidden rounded-3xl border border-border bg-secondary">
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "linear-gradient(var(--color-border) 1px, transparent 1px), linear-gradient(90deg, var(--color-border) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-primary/50 bg-primary/5" />
      {results.slice(0, 24).map((r) => {
        const x = 50 + ((r.lng - center.lng) / spread) * 40;
        const y = 50 - ((r.lat - center.lat) / spread) * 40;
        const q = quote(r, days);
        return (
          <span
            key={r.id}
            style={{ left: `${Math.min(94, Math.max(4, x))}%`, top: `${Math.min(92, Math.max(6, y))}%` }}
            className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold shadow-sm"
          >
            {kr(q.total)}
          </span>
        );
      })}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
        <Button size="sm" className="rounded-full shadow-lg" onClick={onSearchArea}>
          Sök i detta område
        </Button>
      </div>
      <span className="absolute right-3 top-3 rounded-full bg-background/90 px-2.5 py-1 text-[11px] text-muted-foreground">
        Demokarta
      </span>
    </div>
  );
}
