import { DEFAULTS } from "@/lib/search/params";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExampleBadge } from "@/components/ExampleBadge";
import { EmptyState, Page, PageHeader } from "@/components/layout";
import { Scale } from "lucide-react";
import { useCompare } from "@/hooks/useCompare";
import { kr, quote } from "@/lib/pricing";

export const Route = createFileRoute("/jamfor")({
  // Jämförelsen är dold (den räknar priser på det gamla sättet och nås inte från sökningen).
  beforeLoad: () => {
    throw redirect({ to: "/sok", search: DEFAULTS });
  },
  head: () => ({
    meta: [
      { title: "Jämför flera uthyrningar – Hyrkoll" },
      {
        name: "description",
        content:
          "Ställ upp till fyra alternativ mot varandra och se vilket som är billigast för din period.",
      },
      { property: "og:title", content: "Jämför uthyrningar – Hyrkoll" },
      {
        property: "og:description",
        content: "Se vilket alternativ som är billigast för din period.",
      },
    ],
  }),
  component: ComparePage,
});

function ComparePage() {
  const { items, clear, toggle } = useCompare();
  const [days, setDays] = useState(2);

  if (items.length === 0) {
    return (
      <Page width="text">
        <PageHeader title="Jämförelse" />
        <EmptyState
          icon={Scale}
          title="Inget att jämföra än"
          action={
            <Button asChild>
              <Link to="/sok" search={DEFAULTS}>
                Till sökningen
              </Link>
            </Button>
          }
        >
          Lägg till annonser från sökresultaten med jämför-ikonen så visas de här.
        </EmptyState>
      </Page>
    );
  }

  const quotes = items.map((i) => ({ item: i, q: quote(i, days) }));
  const cheapest = [...quotes].sort((a, b) => a.q.total - b.q.total)[0]!.item.id;

  return (
    <Page width="wide">
      <PageHeader
        title={`Jämför ${items.length} alternativ`}
        className="mb-6"
        actions={
          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="compare-days" className="text-xs">
                Antal dygn
              </Label>
              <Input
                id="compare-days"
                type="number"
                min={1}
                value={days}
                onChange={(e) => setDays(Math.max(1, Number(e.target.value)))}
                className="w-24"
              />
            </div>
            <Button variant="outline" onClick={clear}>
              Rensa
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {quotes.map(({ item, q }) => (
          <div key={item.id} className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <img
              src={item.images[0]}
              alt={item.title}
              className="aspect-[4/3] w-full rounded-2xl object-cover"
            />
            <div className="flex flex-wrap gap-1.5">
              {item.id === cheapest && <Tag>Billigast</Tag>}
              {item.example && <ExampleBadge />}
            </div>
            <h2 className="font-display text-base font-bold leading-snug">{item.title}</h2>
            <dl className="space-y-1 text-sm">
              <Row l="Totalpris" v={kr(q.total)} strong />
              <Row l="Per dygn" v={`${kr(q.comparableDayPrice)}`} />
              <Row l="Grundpris" v={kr(q.base)} />
              <Row l="Deposition" v={kr(q.deposit)} />
              <Row l="Plats" v={item.city} />
              <Row l="Kontoform" v={item.ownerType === "company" ? "Företag" : "Privat"} />
              <Row l="Leverans" v={item.deliveryAvailable ? kr(item.deliveryFee) : "Nej"} />
              <Row l="Direktbokning" v={item.instantBook ? "Ja" : "Nej"} />
            </dl>
            <div className="flex gap-2">
              {item.source.kind === "internal" ? (
                <Button asChild size="sm" className="flex-1">
                  <Link to="/annons/$id" params={{ id: item.id }}>
                    Boka
                  </Link>
                </Button>
              ) : (
                <Button asChild size="sm" variant="secondary" className="flex-1">
                  <a href={item.externalUrl} target="_blank" rel="noopener noreferrer">
                    Visa erbjudande
                  </a>
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => toggle(item)}>
                Ta bort
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Page>
  );
}

const Tag = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded-full bg-foreground px-2.5 py-1 text-[11px] font-semibold text-background">
    {children}
  </span>
);

const Row = ({ l, v, strong }: { l: string; v: string; strong?: boolean }) => (
  <div className="flex justify-between">
    <dt className="text-muted-foreground">{l}</dt>
    <dd className={strong ? "font-display font-bold" : ""}>{v}</dd>
  </div>
);
