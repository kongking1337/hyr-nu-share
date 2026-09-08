import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { kr } from "@/lib/pricing";
import { ESTIMATE_DISCLAIMER, priceLevels } from "@/lib/price-insights";
import type { PriceAdvice } from "@/lib/price-advice";

export function PriceInsightsCard({
  advice,
  currentDayPrice,
  onApply,
}: {
  advice: PriceAdvice;
  currentDayPrice?: number;
  onApply?: (price: number) => void;
}) {
  const l = priceLevels(advice);
  const marks = [
    { label: "Låg", value: l.low },
    { label: "Marknad", value: l.market },
    { label: "Hög", value: l.high },
    { label: "Rekommenderat", value: l.recommended, strong: true },
  ];

  return (
    <div className="rounded-3xl border border-border p-5">
      <h3 className="flex items-center gap-2 font-display text-base font-semibold">
        <Sparkles className="h-4 w-4 text-primary" /> AI-rekommenderat uthyrningspris
      </h3>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {marks.map((m) => (
          <div
            key={m.label}
            className={`rounded-2xl px-3 py-2 ${m.strong ? "bg-primary/12 text-primary" : "bg-muted/60"}`}
          >
            <p className="text-[11px] opacity-80">{m.label}</p>
            <p className="font-display text-lg font-semibold">{m.value} kr</p>
            <p className="text-[10px] opacity-70">per dygn</p>
          </div>
        ))}
      </div>

      <p className="mt-3 text-sm text-muted-foreground">{l.explanation}</p>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {l.strategies.map((s) => (
          <div key={s.key} className="rounded-2xl border border-border p-3">
            <p className="text-xs font-semibold">{s.label}</p>
            <p className="font-display text-lg font-semibold">{s.price} kr/dygn</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{s.note}</p>
            {onApply && (
              <Button size="sm" variant="outline" className="mt-2 w-full rounded-full" onClick={() => onApply(s.price)}>
                Använd
              </Button>
            )}
          </div>
        ))}
      </div>

      <dl className="mt-4 space-y-1 text-sm">
        <Row label="Medianpris bland jämförbara" value={`${l.market} kr/dygn`} />
        <Row label="Rekommenderat utgångspris" value={`${l.recommended} kr/dygn`} />
        <Row label="Rekommenderat minimum (privat)" value={`${l.minimumSuggestion} kr/dygn`} />
        <Row label="Förväntat accepterat bud" value={`${l.expectedAcceptedOffer} kr/dygn`} />
        {currentDayPrice ? (
          <Row
            label="Ditt pris mot marknadsnivå"
            value={`${currentDayPrice} kr/dygn · ${Math.round(advice.vsMedianPct)} %`}
          />
        ) : null}
      </dl>

      {advice.comparables.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold">Liknande produkter</p>
          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
            {advice.comparables.map((c) => (
              <li key={`${c.title}-${c.source}`} className="flex justify-between gap-2">
                <span className="min-w-0 truncate">
                  {c.title} · {c.source}
                  {c.demo && " (demo)"}
                </span>
                <span className="shrink-0">{kr(c.priceDay)}/dygn</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-3 text-[11px] text-muted-foreground">{ESTIMATE_DISCLAIMER}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-muted-foreground">
      <dt>{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}
