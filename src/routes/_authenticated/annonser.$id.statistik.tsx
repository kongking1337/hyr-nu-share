import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { kr } from "@/lib/pricing";
import { KpiCard, DemoNote } from "@/components/dashboard/KpiCard";
import { Bars, FunnelChart, Sparkline } from "@/components/dashboard/Charts";
import { RANGES, funnel, searchRank, seriesFor, totals, type RangeKey } from "@/lib/listing-analytics";
import { qualityLabel, scoreListing } from "@/lib/listing-quality";
import { getPriceAdvice } from "@/lib/price-advice";
import { DATA_WEIGHT_NOTE, offerStats, type OfferRow } from "@/lib/offers";
import { DEMO_ALL_OFFERS } from "@/lib/demo-offers";

export const Route = createFileRoute("/_authenticated/annonser/$id/statistik")({
  // Siffrorna på sidan är genererade demodata tills riktig besöksmätning finns.
  beforeLoad: () => {
    throw redirect({ to: "/mina-annonser" });
  },
  head: () => ({
    meta: [
      { title: "Annonsstatistik – Hyrkoll" },
      { name: "description", content: "Visningar, klick, favoriter, konvertering, prisjämförelse och kvalitetsbetyg för din annons." },
      { property: "og:title", content: "Annonsstatistik – Hyrkoll" },
      { property: "og:description", content: "Detaljerad statistik och rekommendationer för din annons." },
    ],
  }),
  component: ListingStats,
});

function ListingStats() {
  const { id } = Route.useParams();
  const [range, setRange] = useState<RangeKey>("30d");

  const { data: listing } = useQuery({
    queryKey: ["listing-stats", id],
    queryFn: async () => {
      const { data } = await supabase.from("listings").select("*").eq("id", id).maybeSingle();
      return data;
    },
  });

  const { data: advice } = useQuery({
    queryKey: ["price-advice", id, listing?.category_slug],
    enabled: !!listing,
    queryFn: () =>
      getPriceAdvice({
        category: listing!.category_slug,
        city: listing!.city,
        lat: listing!.lat,
        lng: listing!.lng,
        priceDay: listing!.price_day,
      }),
  });

  const days = RANGES.find((r) => r.key === range)!.days;
  const points = useMemo(() => (listing ? seriesFor(listing, days) : []), [listing, days]);
  const t = useMemo(() => totals(points), [points]);

  if (!listing) return <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-muted-foreground">Hämtar annons …</div>;

  const bidStats = offerStats(DEMO_ALL_OFFERS as unknown as OfferRow[]);

  const q = scoreListing({
    images: listing.images ?? [],
    title: listing.title,
    description: listing.description ?? "",
    price_day: listing.price_day,
    price_week: listing.price_week,
    price_hour: listing.price_hour,
    deposit: listing.deposit,
    city: listing.city,
    area: listing.area,
    category_slug: listing.category_slug,
    attributes: (listing.attributes as Record<string, unknown>) ?? {},
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link to="/mina-annonser" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Mina annonser
      </Link>
      <h1 className="mt-2 font-display text-3xl font-semibold">{listing.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {kr(listing.price_day)}/dygn · {listing.city} · ungefärlig placering i sökresultat: #{searchRank(listing)}
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <Button
            key={r.key}
            size="sm"
            variant={range === r.key ? "default" : "outline"}
            className="rounded-full"
            onClick={() => setRange(r.key)}
          >
            {r.label}
          </Button>
        ))}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Visningar" value={String(t.views)} />
        <KpiCard label="Unika besökare" value={String(t.visitors)} />
        <KpiCard label="Klick från sökresultat" value={String(t.clicks)} />
        <KpiCard label="Favoriter" value={String(t.favorites)} />
        <KpiCard label="Delningar" value={String(t.shares)} />
        <KpiCard label="Bokningsförfrågningar" value={String(t.requests)} />
        <KpiCard label="Bekräftade bokningar" value={String(t.bookings)} />
        <KpiCard label="Avbokningar" value={String(t.cancellations)} />
        <KpiCard label="Intäkter" value={kr(t.revenue)} />
        <KpiCard label="Snittperiod" value={`${t.avgPeriodDays.toFixed(1)} dygn`} />
        <KpiCard label="Snittbokningsvärde" value={kr(t.avgBookingValue)} />
        <KpiCard label="Konvertering" value={`${t.conversion.toFixed(2)} %`} />
      </div>

      <div className="mt-4">
        <DemoNote>
          Trafik- och konverteringssiffror är demodata. Betyg, pris och annonsinnehåll är dina riktiga uppgifter.
        </DemoNote>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-border p-5">
          <h2 className="font-display text-lg font-semibold">Visningar över tid</h2>
          <Sparkline points={points} metric="views" />
        </div>
        <div className="rounded-3xl border border-border p-5">
          <h2 className="font-display text-lg font-semibold">Intäkter per dag</h2>
          <Bars points={points} metric="revenue" />
        </div>
      </div>

      <div className="mt-4 rounded-3xl border border-border p-5">
        <h2 className="font-display text-lg font-semibold">Från visning till bokning</h2>
        <div className="mt-3"><FunnelChart steps={funnel(t)} /></div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-border p-5">
          <h2 className="font-display text-lg font-semibold">Jämför med liknande annonser</h2>
          {!advice && <p className="mt-2 text-sm text-muted-foreground">För få liknande annonser för en jämförelse just nu.</p>}
          {advice && (
            <>
              <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                <Fact label="Ditt pris" value={kr(listing.price_day)} />
                <Fact label="Median" value={kr(advice.median)} />
                <Fact label="Billigast" value={kr(advice.cheapest)} />
              </div>
              <p className="mt-3 text-sm">
                Ditt pris ligger{" "}
                <span className="font-medium">
                  {advice.vsMedianPct >= 0 ? "+" : ""}{advice.vsMedianPct.toFixed(0)} %
                </span>{" "}
                mot medianen bland {advice.sample} liknande annonser.
              </p>
              <p className="mt-2 flex items-center gap-1 font-display text-lg font-semibold">
                <Sparkles className="h-4 w-4 text-primary" /> Rekommenderat pris {kr(advice.recommended.min)}–{kr(advice.recommended.max)}
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {advice.reasons.map((r) => <li key={r}>{r}</li>)}
              </ul>
              <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                {advice.comparables.map((c) => (
                  <li key={`${c.source}-${c.title}`} className="flex justify-between gap-2">
                    <span className="truncate">{c.title} · {c.source}{c.demo ? " (demo)" : ""}</span>
                    <span className="shrink-0">{kr(c.priceDay)}/dygn</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="rounded-3xl border border-border p-5">
          <h2 className="font-display text-lg font-semibold">Annonskvalitet</h2>
          <p className="mt-1 font-display text-3xl font-semibold">
            {q.total}<span className="text-base text-muted-foreground">/100 · {qualityLabel(q.total)}</span>
          </p>
          <div className="mt-3 space-y-2">
            {q.parts.map((p) => (
              <div key={p.key}>
                <div className="flex justify-between text-sm">
                  <span>{p.label}</span>
                  <span className="text-muted-foreground">{p.score}/{p.max}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(p.score / p.max) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <h3 className="mt-4 flex items-center gap-1 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" /> Rekommendationer
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {(q.tips.length ? q.tips : ["Annonsen är komplett – håll bilderna uppdaterade."]).map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
            {t.clicks / Math.max(t.views, 1) < 0.3 && <li>Få klick per visning – testa en tydligare huvudbild.</li>}
            {advice && advice.vsMedianPct > 15 && <li>Priset ligger över median – ett lägre dygnspris kan ge fler bokningar.</li>}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Rekommendationerna är beräknade lokalt utifrån annonsens innehåll och demostatistik – de är förslag, inte fakta.
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-border p-5">
        <h2 className="font-display text-lg font-semibold">Budstatistik (aggregerad och anonymiserad)</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Fact label="Snitt accepterat pris" value={kr(bidStats.avgAccepted)} />
          <Fact label="Snitt utgångsbud" value={kr(bidStats.avgStart)} />
          <Fact label="Snittrabatt" value={`${bidStats.avgDiscountPct} %`} />
          <Fact label="Andel accepterade bud" value={`${bidStats.acceptRate} %`} />
          <Fact label="Accepterade motbud" value={`${bidStats.counterAcceptRate} %`} />
          <Fact label="Underlag" value={`${bidStats.sample} bud`} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{DATA_WEIGHT_NOTE}</p>
      </div>
    </div>
  );
}

const Fact = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-2xl bg-muted/60 px-3 py-2">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="font-medium">{value}</p>
  </div>
);
