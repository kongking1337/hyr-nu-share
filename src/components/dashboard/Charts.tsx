/** Enkla, beroendefria diagram i SVG som följer temats färger. */
import type { DayPoint } from "@/lib/listing-analytics";

export function Sparkline({
  points,
  metric,
  height = 120,
}: {
  points: DayPoint[];
  metric: keyof Omit<DayPoint, "date">;
  height?: number;
}) {
  const values = points.map((p) => Number(p[metric]));
  const max = Math.max(1, ...values);
  const w = Math.max(points.length - 1, 1);
  const path = values
    .map((v, i) => `${i === 0 ? "M" : "L"} ${(i / w) * 100} ${100 - (v / max) * 100}`)
    .join(" ");
  const area = `${path} L 100 100 L 0 100 Z`;

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ height }} className="w-full">
      <path d={area} className="fill-primary/15" />
      <path d={path} className="stroke-primary" strokeWidth={1.4} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Bars({
  points,
  metric,
  height = 120,
}: {
  points: DayPoint[];
  metric: keyof Omit<DayPoint, "date">;
  height?: number;
}) {
  const values = points.map((p) => Number(p[metric]));
  const max = Math.max(1, ...values);
  return (
    <div className="flex items-end gap-[2px]" style={{ height }}>
      {values.map((v, i) => (
        <div
          key={i}
          title={`${points[i]!.date}: ${v}`}
          className="flex-1 rounded-t-sm bg-primary/70"
          style={{ height: `${Math.max(2, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

export function FunnelChart({ steps }: { steps: { label: string; value: number; rate: number }[] }) {
  return (
    <div className="space-y-2">
      {steps.map((s) => (
        <div key={s.label}>
          <div className="flex items-baseline justify-between text-sm">
            <span>{s.label}</span>
            <span className="font-medium">
              {s.value} <span className="text-xs text-muted-foreground">({s.rate.toFixed(1)} %)</span>
            </span>
          </div>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(1, s.rate)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
