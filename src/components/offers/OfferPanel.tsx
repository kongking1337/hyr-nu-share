import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Gavel, Info, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OfferCard, type OfferAction } from "@/components/offers/OfferCard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { kr } from "@/lib/pricing";
import { discountPct, num, type OfferRow } from "@/lib/offers";

/**
 * Budruta på annonssidan. Budet gäller alltid totalpriset för den valda perioden.
 */
export function OfferPanel({
  listingId,
  listTotal,
  days,
  start,
  end,
  validityHours,
  disabled,
}: {
  listingId: string;
  listTotal: number;
  days: number;
  start: string;
  end: string;
  validityHours: number;
  disabled?: boolean;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [tooLow, setTooLow] = useState(false);

  const { data: myOffers, refetch } = useQuery({
    queryKey: ["my-offers", listingId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("offers")
        .select("*")
        .eq("listing_id", listingId)
        .order("created_at", { ascending: false });
      return (data ?? []) as OfferRow[];
    },
  });

  const value = Number(amount || 0);
  const diff = listTotal - value;
  const pct = discountPct(value, listTotal);

  async function submit() {
    if (!user) {
      toast.info("Logga in för att lägga ett bud.");
      return;
    }
    if (!value || value <= 0) {
      toast.error("Ange ett belopp.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("place_offer", {
      _listing_id: listingId,
      _start: start,
      _end: end,
      _days: days,
      _list_total: listTotal,
      _amount: value,
      ...(message ? { _message: message } : {}),
    });
    setBusy(false);
    if (error) {
      toast.error("Budet kunde inte skickas.");
      return;
    }
    const res = (data ?? {}) as { auto_accepted?: boolean; below_minimum?: boolean };
    setTooLow(!!res.below_minimum);
    if (res.auto_accepted) {
      toast.success("Budet accepterades direkt enligt uthyrarens privata villkor. Bokningen är skapad och datumen blockerade.");
    } else if (res.below_minimum) {
      toast.warning("Budet är skickat men ligger under uthyrarens privata gräns – ett högre bud har större chans.");
    } else {
      toast.success("Budet är skickat till uthyraren.");
    }
    setAmount("");
    setMessage("");
    refetch();
  }

  async function respond(offerId: string, action: OfferAction, counterAmount?: number) {
    const { error } = await supabase.rpc("respond_offer", {
      _offer_id: offerId,
      _action: action,
      ...(counterAmount ? { _amount: counterAmount } : {}),
    });
    if (error) {
      toast.error("Åtgärden kunde inte genomföras.");
      return;
    }
    if (action === "accept") toast.success("Priset är låst och bokningen skapad – datumen är blockerade.");
    else toast.success("Uppdaterat.");
    refetch();
  }

  return (
    <div className="rounded-3xl border border-border p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Gavel className="h-4 w-4 text-primary" /> Bud välkomna – priset kan förhandlas
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Ordinarie totalpris för {days} dygn: <strong>{kr(listTotal)}</strong>.
        {validityHours > 0
          ? ` Ditt bud gäller i ${validityHours} timmar.`
          : " Budet har ingen tidsgräns."}
      </p>

      {!open ? (
        <Button variant="outline" className="mt-3 w-full rounded-full" onClick={() => setOpen(true)} disabled={disabled}>
          Lägg ett bud
        </Button>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">Ditt bud – totalt för perioden (kr)</Label>
            <Input aria-label="Ditt bud totalt" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(Math.round(listTotal * 0.9))} />
          </div>
          {value > 0 && (
            <div className="rounded-2xl bg-muted/60 px-3 py-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Ordinarie</span><span>{kr(listTotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Ditt bud</span><span className="font-semibold">{kr(value)}</span></div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Skillnad</span>
                <span>{diff >= 0 ? "−" : "+"}{kr(Math.abs(diff))} ({Math.abs(Math.round(pct))} %)</span>
              </div>
            </div>
          )}
          {value > 0 && pct > 40 && (
            <p className="text-xs text-destructive">
              Budet är mycket lägre än annonserat pris och accepteras sällan. Uthyrarens eventuella minimigräns är privat.
            </p>
          )}
          <Textarea placeholder="Meddelande till uthyraren (valfritt)" value={message} onChange={(e) => setMessage(e.target.value)} />
          <Button className="w-full rounded-full" onClick={submit} disabled={busy || disabled}>
            Skicka bud
          </Button>
        </div>
      )}

      {tooLow && (
        <p className="mt-2 flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
          <Info className="mt-0.5 h-3.5 w-3.5" /> Ditt senaste bud ligger under uthyrarens privata gräns. Beloppet på gränsen
          visas aldrig.
        </p>
      )}

      {(myOffers ?? []).length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold">Din budhistorik för den här annonsen</p>
          {(myOffers ?? []).map((o) => (
            <OfferCard
              key={o.id}
              offer={o}
              role={user?.id === o.owner_id ? "owner" : "renter"}
              compact
              onAction={(a, amt) => respond(o.id, a, amt)}
            />
          ))}
          <p className="flex items-start gap-1 text-[11px] text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3 w-3" /> Budhistoriken är privat mellan dig och uthyraren. Enskilda bud visas
            aldrig publikt.
          </p>
        </div>
      )}
      {num(listTotal) === 0 && <p className="mt-2 text-xs text-muted-foreground">Välj datum för att lägga bud.</p>}
    </div>
  );
}
