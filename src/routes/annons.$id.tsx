import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  BadgeCheck, CalendarDays, Flag, MapPin, Shield, Star, Truck, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { SourceBadge } from "@/components/SourceBadge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { rowToUnified } from "@/lib/providers/internal";
import { kr, quote } from "@/lib/pricing";
import { OfferPanel } from "@/components/offers/OfferPanel";

export const Route = createFileRoute("/annons/$id")({
  head: () => ({
    meta: [
      { title: "Annons – hyr på Hyrkoll" },
      { name: "description", content: "Se pris, totalkostnad, tillgänglighet och boka direkt på Hyrkoll." },
      { property: "og:title", content: "Annons – hyr på Hyrkoll" },
      { property: "og:description", content: "Se pris, totalkostnad och boka direkt." },
    ],
  }),
  component: ListingPage,
});

const todayIso = () => new Date().toISOString().slice(0, 10);

function ListingPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const [start, setStart] = useState(todayIso());
  const [end, setEnd] = useState(todayIso());
  const [delivery, setDelivery] = useState(false);
  const [message, setMessage] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["listing", id],
    queryFn: async () => {
      const { data: row, error } = await supabase.from("listings").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!row) return null;
      const [{ data: reviews }, { data: booked }] = await Promise.all([
        supabase.from("reviews").select("*").eq("listing_id", id).order("created_at", { ascending: false }),
        supabase.rpc("booked_dates", { _listing_id: id }),
      ]);
      return {
        listing: rowToUnified(row),
        reviews: reviews ?? [],
        booked: (booked ?? []) as Array<{ start_date: string; end_date: string }>,
      };
    },
  });

  if (isLoading) return <div className="mx-auto max-w-5xl p-4"><Skeleton className="h-[520px] rounded-3xl" /></div>;
  if (!data) return <div className="mx-auto max-w-5xl p-10 text-center">Annonsen kunde inte hittas.</div>;

  const { listing, reviews, booked } = data;
  const days = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1);
  const q = quote(listing, days, { delivery });

  const overlaps = booked.some((b) => start <= b.end_date && end >= b.start_date);

  async function book() {
    if (!user) {
      toast.info("Logga in för att boka.");
      return;
    }
    if (overlaps) {
      toast.error("Valda datum är redan bokade.");
      return;
    }
    const { error } = await supabase.from("bookings").insert({
      listing_id: listing.id,
      renter_id: user.id,
      owner_id: null,
      start_date: start,
      end_date: end,
      days,
      base_price: q.base,
      service_fee: q.serviceFee,
      delivery_fee: q.deliveryFee,
      insurance_fee: q.insuranceFee,
      deposit: q.deposit,
      total_price: q.total,
      delivery,
      message,
      status: listing.instantBook ? "confirmed" : "requested",
    });
    if (error) {
      toast.error("Bokningen kunde inte skapas");
      return;
    }
    toast.success(
      listing.instantBook ? "Bokad! Datumen är nu blockerade." : "Bokningsförfrågan skickad.",
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="grid gap-3 sm:grid-cols-2">
        <img
          src={listing.images[0]}
          alt={listing.title}
          className="aspect-[4/3] w-full rounded-3xl object-cover sm:col-span-2"
        />
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <div className="space-y-3">
            <SourceBadge source={listing.source} />
            <h1 className="font-display text-3xl font-semibold">{listing.title}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Star className="h-4 w-4 fill-accent text-accent" /> {listing.rating.toFixed(1)} ({listing.reviewCount} recensioner)
              </span>
              <span className="flex items-center gap-1"><MapPin className="h-4 w-4" /> {listing.area}, {listing.city}</span>
              <span className="flex items-center gap-1">
                <BadgeCheck className="h-4 w-4" /> {listing.ownerType === "company" ? "Företag" : "Privatperson"} · {listing.ownerName}
              </span>
              {listing.allowOffers && (
                <span className="flex items-center gap-1 rounded-full bg-accent/20 px-2.5 py-0.5 text-xs font-semibold text-foreground">
                  Bud välkomna
                </span>
              )}
              {listing.instantBook && <span className="flex items-center gap-1 text-primary"><Zap className="h-4 w-4" /> Direktbokning</span>}
              {listing.deliveryAvailable && <span className="flex items-center gap-1"><Truck className="h-4 w-4" /> Leverans {kr(listing.deliveryFee)}</span>}
            </div>
          </div>

          <p className="leading-relaxed text-muted-foreground">{listing.description}</p>

          <div className="rounded-3xl border border-border p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
              <CalendarDays className="h-5 w-5" /> Tillgänglighet
            </h2>
            {booked.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Inga bokade datum just nu.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {booked.map((b, i) => (
                  <li key={i}>Bokad {b.start_date} – {b.end_date}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-3xl border border-border p-5">
            <h2 className="font-display text-lg font-semibold">Villkor</h2>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li>Deposition {kr(listing.deposit)} reserveras och återbetalas efter återlämning.</li>
              <li>Fri avbokning fram till 48 timmar före start, därefter 50 % av grundpriset.</li>
              <li>Försäkring {listing.insuranceFee > 0 ? `${kr(listing.insuranceFee)}/dygn` : "ingår ej"}.</li>
              <li className="flex items-center gap-1"><Shield className="h-4 w-4" /> Kontaktuppgifter delas först när bokningen är bekräftad.</li>
            </ul>
          </div>

          <div>
            <h2 className="font-display text-lg font-semibold">Verifierade recensioner</h2>
            <div className="mt-3 space-y-3">
              {reviews.map((r) => (
                <div key={r.id} className="rounded-3xl border border-border p-4">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {r.author_name}
                    <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                      <Star className="h-3 w-3 fill-accent text-accent" /> {r.rating}
                    </span>
                    {r.verified && <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[11px] text-primary">Verifierad hyra</span>}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{r.body}</p>
                </div>
              ))}
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={async () => {
              if (!user) { toast.info("Logga in för att rapportera."); return; }
              await supabase.from("reports").insert({
                reporter_id: user.id,
                target_type: "listing",
                target_id: listing.id,
                reason: "Rapporterad från annonssidan",
              });
              toast.success("Tack, rapporten är skickad till moderering.");
            }}
          >
            <Flag className="mr-1 h-4 w-4" /> Rapportera annons
          </Button>
        </div>

        <aside className="h-fit space-y-4 rounded-3xl border border-border bg-card p-5 lg:sticky lg:top-24">
          <div>
            <p className="font-display text-2xl font-semibold">{kr(listing.priceDay)}<span className="text-base font-normal text-muted-foreground">/dygn</span></p>
            <p className="text-xs text-muted-foreground">
              Vecka {listing.priceWeek ? kr(listing.priceWeek) : "—"} · Månad {listing.priceMonth ? kr(listing.priceMonth) : "—"}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Från</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Till</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          {listing.deliveryAvailable && (
            <div className="flex items-center justify-between rounded-2xl bg-muted/60 px-4 py-3">
              <Label htmlFor="lev" className="text-sm">Leverans (+{kr(listing.deliveryFee)})</Label>
              <Switch id="lev" checked={delivery} onCheckedChange={setDelivery} />
            </div>
          )}
          <dl className="space-y-1 text-sm">
            <Row label={`Grundpris (${q.breakdownLabel})`} value={kr(q.base)} />
            <Row label="Serviceavgift" value={kr(q.serviceFee)} />
            <Row label="Försäkring" value={kr(q.insuranceFee)} />
            <Row label="Leverans" value={kr(q.deliveryFee)} />
            <Row label="Deposition (reserveras)" value={kr(q.deposit)} />
            <div className="flex justify-between border-t border-border pt-2 font-display text-base font-semibold">
              <span>Totalt {days} dygn</span>
              <span>{kr(q.total)}</span>
            </div>
          </dl>
          <Textarea
            placeholder="Meddelande till uthyraren (valfritt)"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          {overlaps && <p className="text-xs text-destructive">Valda datum är redan bokade.</p>}
          <Button className="w-full rounded-full" onClick={book} disabled={overlaps}>
            {listing.instantBook ? "Boka direkt" : "Skicka bokningsförfrågan"}
          </Button>
          {listing.allowOffers && (
            <OfferPanel
              listingId={listing.id}
              listTotal={q.total}
              days={days}
              start={start}
              end={end}
              validityHours={listing.offerValidityHours ?? 24}
              disabled={overlaps}
            />
          )}
          <p className="text-[11px] text-muted-foreground">
            Betalning sker i nästa steg via Stripe Connect (serviceavgift, utbetalning, deposition och
            återbetalning). Betalningar är inte aktiverade i denna demo.
          </p>
          <Link to="/meddelanden" className="block text-center text-xs text-primary hover:underline">
            Kontakta uthyraren
          </Link>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <dt>{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}
