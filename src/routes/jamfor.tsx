import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SourceBadge } from "@/components/SourceBadge";
import { useCompare } from "@/hooks/useCompare";
import { kr, quote } from "@/lib/pricing";

export const Route = createFileRoute("/jamfor")({
  head: () => ({
    meta: [
      { title: "Jämför flera uthyrningar – Hyrkoll" },
      { name: "description", content: "Ställ upp till fyra alternativ mot varandra: totalpris, betyg, avstånd och bäst värde." },
      { property: "og:title", content: "Jämför uthyrningar – Hyrkoll" },
      { property: "og:description", content: "Se billigast, bäst betyg och bäst värde." },
    ],
  }),
  component: ComparePage,
});

function ComparePage() {
  const { items, clear, toggle } = useCompare();
  const [days, setDays] = useState(2);

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="font-display text-3xl font-semibold">Jämförelse</h1>
        <p className="mt-3 text-muted-foreground">
          Lägg till produkter från sökresultaten med jämför-ikonen så visas de här.
        </p>
        <Button asChild className="mt-6 rounded-full"><Link to="/sok" search={{}}>Till sökningen</Link></Button>
      </div>
    );
  }

  const quotes = items.map((i) => ({ item: i, q: quote(i, days) }));
  const cheapest = [...quotes].sort((a, b) => a.q.total - b.q.total)[0]!.item.id;
  const bestRated = [...items].sort((a, b) => b.rating - a.rating)[0]!.id;
  const bestValue = [...quotes].sort((a, b) => a.q.total / (a.item.rating || 1) - b.q.total / (b.item.rating || 1))[0]!.item.id;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-3xl font-semibold">Jämför {items.length} alternativ</h1>
        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Antal dygn</Label>
            <Input
              type="number"
              min={1}
              value={days}
              onChange={(e) => setDays(Math.max(1, Number(e.target.value)))}
              className="w-24"
            />
          </div>
          <Button variant="outline" className="rounded-full" onClick={clear}>Rensa</Button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {quotes.map(({ item, q }) => (
          <div key={item.id} className="space-y-3 rounded-3xl border border-border bg-card p-4">
            <img src={item.images[0]} alt={item.title} className="aspect-[4/3] w-full rounded-2xl object-cover" />
            <div className="flex flex-wrap gap-1.5">
              {item.id === cheapest && <Tag>Billigast</Tag>}
              {item.id === bestRated && <Tag>Bäst betyg</Tag>}
              {item.id === bestValue && <Tag>Bäst värde</Tag>}
            </div>
            <SourceBadge source={item.source} />
            <h2 className="font-display text-base font-semibold">{item.title}</h2>
            <dl className="space-y-1 text-sm">
              <Row l="Totalpris" v={kr(q.total)} strong />
              <Row l="Per dygn" v={`${kr(q.comparableDayPrice)}`} />
              <Row l="Grundpris" v={kr(q.base)} />
              <Row l="Avgifter" v={kr(q.serviceFee + q.insuranceFee)} />
              <Row l="Deposition" v={kr(q.deposit)} />
              <Row l="Betyg" v={`${item.rating.toFixed(1)} (${item.reviewCount})`} />
              <Row l="Plats" v={item.city} />
              <Row l="Kontoform" v={item.ownerType === "company" ? "Företag" : "Privat"} />
              <Row l="Leverans" v={item.deliveryAvailable ? kr(item.deliveryFee) : "Nej"} />
              <Row l="Direktbokning" v={item.instantBook ? "Ja" : "Nej"} />
            </dl>
            <div className="flex gap-2">
              {item.source.kind === "internal" ? (
                <Button asChild size="sm" className="flex-1 rounded-full">
                  <Link to="/annons/$id" params={{ id: item.id }}>Boka</Link>
                </Button>
              ) : (
                <Button asChild size="sm" variant="secondary" className="flex-1 rounded-full">
                  <a href={item.externalUrl} target="_blank" rel="noopener noreferrer">Visa erbjudande</a>
                </Button>
              )}
              <Button size="sm" variant="outline" className="rounded-full" onClick={() => toggle(item)}>Ta bort</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const Tag = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded-full bg-foreground px-2.5 py-1 text-[11px] font-semibold text-background">{children}</span>
);

const Row = ({ l, v, strong }: { l: string; v: string; strong?: boolean }) => (
  <div className="flex justify-between">
    <dt className="text-muted-foreground">{l}</dt>
    <dd className={strong ? "font-display font-semibold text-primary" : ""}>{v}</dd>
  </div>
);
