import { useState } from "react";
import { Clock, Gavel, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { kr } from "@/lib/pricing";
import {
  DATA_WEIGHT_NOTE,
  OFFER_STATUS_LABEL,
  OFFER_STATUS_TONE,
  assessOffer,
  discountPct,
  effectiveStatus,
  num,
  timeLeft,
  type OfferRow,
} from "@/lib/offers";
import { cn } from "@/lib/utils";

export type OfferAction = "accept" | "decline" | "counter" | "withdraw";

export type OfferView = OfferRow & {
  demo?: boolean;
  listingTitle?: string;
  listingImage?: string;
  counterpartName?: string;
  counterpartRating?: number;
  counterpartReviews?: number;
};

export function OfferStatusBadge({ offer }: { offer: Pick<OfferRow, "status" | "expires_at"> }) {
  const s = effectiveStatus(offer);
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", OFFER_STATUS_TONE[s])}>
      {OFFER_STATUS_LABEL[s]}
    </span>
  );
}

export function OfferCard({
  offer,
  role,
  onAction,
  showAssessment,
  marketTotal,
  compact,
}: {
  offer: OfferView;
  /** Vilken roll den inloggade användaren har i affären */
  role: "owner" | "renter";
  onAction?: (action: OfferAction, amount?: number) => void | Promise<void>;
  showAssessment?: boolean;
  marketTotal?: number | null;
  compact?: boolean;
}) {
  const status = effectiveStatus(offer);
  const amount = num(offer.amount);
  const list = num(offer.list_total);
  const diff = list - amount;
  const pct = discountPct(amount, list);
  const [countering, setCountering] = useState(false);
  const [counter, setCounter] = useState(String(Math.round((amount + list) / 2)));

  const mine = (offer.actor === "owner") === (role === "owner");
  const open = status === "active";
  const canRespond = open && !mine && !!onAction;
  const canWithdraw = open && mine && !!onAction;

  const assessment = showAssessment
    ? assessOffer({ amount, listTotal: list, marketTotal: marketTotal ?? null })
    : null;

  return (
    <div className="rounded-3xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start gap-3">
        {offer.listingImage && !compact && (
          <img src={offer.listingImage} alt="" loading="lazy" className="h-16 w-20 rounded-2xl object-cover" />
        )}
        <div className="min-w-40 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <Gavel className="h-4 w-4 text-primary" />
            {offer.actor === "owner" ? "Motbud från uthyraren" : "Bud från hyrestagaren"}
            <OfferStatusBadge offer={offer} />
            {offer.demo && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase text-muted-foreground">Demo</span>
            )}
          </p>
          {offer.listingTitle && <p className="mt-0.5 text-sm">{offer.listingTitle}</p>}
          <p className="text-xs text-muted-foreground">
            {offer.start_date} – {offer.end_date} · {offer.days} dygn
            {offer.counterpartName && ` · ${offer.counterpartName}`}
            {offer.counterpartRating != null && (
              <span className="ml-1 inline-flex items-center gap-0.5">
                <Star className="h-3 w-3 fill-accent text-accent" />
                {offer.counterpartRating} ({offer.counterpartReviews ?? 0})
              </span>
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-muted-foreground">Ordinarie {kr(list)}</p>
          <p className="font-display text-xl font-semibold">{kr(amount)}</p>
          <p className="text-[11px] text-muted-foreground">
            {diff >= 0 ? "−" : "+"}
            {kr(Math.abs(diff))} · {Math.abs(Math.round(pct))} % {diff >= 0 ? "rabatt" : "över"}
          </p>
        </div>
      </div>

      {offer.message && <p className="mt-3 rounded-2xl bg-muted/60 px-3 py-2 text-sm">{offer.message}</p>}

      <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
        <Clock className="h-3 w-3" /> {open ? timeLeft(offer.expires_at) : OFFER_STATUS_LABEL[status]}
      </p>

      {assessment && open && (
        <div className="mt-3 rounded-2xl border border-dashed border-border p-3 text-xs">
          <p className="flex items-center gap-1 font-semibold">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> AI-budbedömning: {assessment.label}
          </p>
          <p className="mt-1 text-muted-foreground">{assessment.reason}</p>
          <p className="mt-1 text-muted-foreground">{assessment.demandNote}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Icke-bindande rekommendation. {DATA_WEIGHT_NOTE}
          </p>
        </div>
      )}

      {(canRespond || canWithdraw) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {canRespond && (
            <>
              <Button size="sm" className="rounded-full" onClick={() => onAction!("accept")}>
                Acceptera
              </Button>
              <Button size="sm" variant="outline" className="rounded-full" onClick={() => setCountering((v) => !v)}>
                Motbud
              </Button>
              <Button size="sm" variant="ghost" className="rounded-full" onClick={() => onAction!("decline")}>
                Neka
              </Button>
            </>
          )}
          {canWithdraw && (
            <Button size="sm" variant="ghost" className="rounded-full" onClick={() => onAction!("withdraw")}>
              Återkalla bud
            </Button>
          )}
        </div>
      )}

      {countering && (
        <div className="mt-2 flex gap-2">
          <Input
            inputMode="numeric"
            value={counter}
            onChange={(e) => setCounter(e.target.value)}
            placeholder="Motbud, totalt för perioden"
          />
          <Button
            size="sm"
            className="rounded-full"
            onClick={() => {
              const v = Number(counter);
              if (!v) return;
              setCountering(false);
              onAction!("counter", v);
            }}
          >
            Skicka
          </Button>
        </div>
      )}
    </div>
  );
}
