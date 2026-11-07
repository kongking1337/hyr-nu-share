import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { sv } from "react-day-picker/locale";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  MAX_BOOKING_DAYS,
  addDays,
  bookingPrice,
  daysBetween,
  formatDates,
  fromISODate,
  overlapsTaken,
  takenRanges,
  toISODate,
  todayISO,
} from "@/lib/bookings";
import { userMessage } from "@/lib/db-errors";
import { notifyNewMessage } from "@/lib/notify.functions";
import { kr } from "@/lib/pricing";
import type { UnifiedResult } from "@/lib/providers/types";
import { cn } from "@/lib/utils";

/** Upptagna dagar för en annons (bokade eller blockerade), utan vem som bokat. */
export function useTakenDates(listingId: string) {
  return useQuery({
    queryKey: ["booked-dates", listingId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("booked_dates", { _listing_id: listingId });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Välj datum och skicka en bokningsförfrågan. Uthyraren godkänner eller nekar. */
export function BookingRequest({ listing }: { listing: UnifiedResult }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: taken } = useTakenDates(listing.id);
  const [range, setRange] = useState<DateRange | undefined>();
  const [delivery, setDelivery] = useState(!listing.pickupAvailable && listing.deliveryAvailable);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading || (user && user.id === listing.ownerId)) return null;

  const today = todayISO();
  const start = range?.from ? toISODate(range.from) : null;
  const end = range?.to ? toISODate(range.to) : start;
  const days = start && end ? daysBetween(start, end) : 0;
  const rent = bookingPrice(listing, days);
  const deliveryFee = delivery ? listing.deliveryFee : 0;

  // Med en minsta hyrtid väntar vi på slutdatumet innan något visas som fel.
  const needsEnd = !!start && !range?.to && listing.minDays > 1;
  const problem =
    !start || needsEnd
      ? null
      : days < listing.minDays
        ? `Minst ${listing.minDays} dygn. Välj ett senare slutdatum.`
        : days > MAX_BOOKING_DAYS
          ? `Högst ${MAX_BOOKING_DAYS} dygn åt gången.`
          : overlapsTaken(start, end!, taken)
            ? "Några av dagarna är redan upptagna."
            : null;

  async function send() {
    if (!user) return;
    if (!start || !end || problem) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("request_booking", {
      _listing_id: listing.id,
      _start: start,
      _end: end,
      _delivery: delivery,
      // Databasen räknar priset själv; stämmer det inte med det kunden ser stoppas förfrågan.
      // Avrundat till ören, så att flyttalsfel (199,9 × 9) inte ser ut som ett nytt pris.
      _expected_total: Math.round((rent + deliveryFee) * 100) / 100,
      ...(message.trim() ? { _message: message.trim() } : {}),
    });
    setBusy(false);
    if (error) {
      toast.error(userMessage(error, "Förfrågan kunde inte skickas. Försök igen."));
      void queryClient.invalidateQueries({ queryKey: ["booked-dates", listing.id] });
      void queryClient.invalidateQueries({ queryKey: ["listing", listing.id] });
      return;
    }
    const conversationId = (data as { conversation_id?: string } | null)?.conversation_id;
    if (conversationId) void notifyNewMessage({ data: { conversationId } }).catch(() => undefined);
    toast.success("Förfrågan är skickad! Du får svar under Bokningar.");
    navigate({ to: "/bokningar" });
  }

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold">Välj datum</h2>
      <Calendar
        mode="range"
        locale={sv}
        weekStartsOn={1}
        selected={range}
        onSelect={setRange}
        resetOnSelect
        excludeDisabled
        disabled={[
          { before: fromISODate(today) },
          { after: fromISODate(addDays(today, 365)) },
          ...takenRanges(taken),
        ]}
        modifiers={{ taken: takenRanges(taken) }}
        modifiersClassNames={{ taken: "line-through opacity-50" }}
        className="mx-auto rounded-2xl border border-border p-2 [--cell-size:2.5rem] lg:[--cell-size:2.25rem]"
      />
      <p className="text-xs text-muted-foreground">
        Tryck på första och sista dagen. Överstrukna dagar är upptagna.
        {listing.minDays > 1 && ` Minst ${listing.minDays} dygn.`}
        {range && (
          <>
            {" "}
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => setRange(undefined)}
            >
              Rensa datum
            </button>
          </>
        )}
      </p>

      {listing.deliveryAvailable && listing.pickupAvailable && (
        <div
          className="grid grid-cols-2 gap-2"
          role="radiogroup"
          aria-label="Upphämtning eller leverans"
        >
          {[false, true].map((d) => (
            <button
              key={String(d)}
              type="button"
              role="radio"
              aria-checked={delivery === d}
              onClick={() => setDelivery(d)}
              className={cn(
                "rounded-xl border border-input bg-card px-3 py-2.5 text-left text-sm font-medium transition-colors hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                delivery === d &&
                  "border-foreground ring-1 ring-foreground hover:border-foreground",
              )}
            >
              {d ? "Leverans" : "Hämtar själv"}
              {d && (
                <span className="block text-xs font-normal text-muted-foreground">
                  {listing.deliveryFee > 0 ? `+${kr(listing.deliveryFee)}` : "Ingår"}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {start && (
        <div className="space-y-1.5 rounded-xl bg-muted p-4 text-sm" aria-live="polite">
          <p className="font-medium">
            {formatDates(start, end!)} · {days} dygn
          </p>
          {needsEnd ? (
            <p className="text-muted-foreground">Välj sista dagen. Minst {listing.minDays} dygn.</p>
          ) : problem ? (
            <p className="font-medium text-destructive">{problem}</p>
          ) : (
            <>
              <Row label="Hyra" value={kr(rent)} />
              {delivery && (
                <Row label="Leverans" value={deliveryFee > 0 ? kr(deliveryFee) : "Ingår"} />
              )}
              <div className="my-1 border-t border-border" />
              <Row label="Totalt" value={kr(rent + deliveryFee)} strong />
              {listing.deposit > 0 && (
                <p className="pt-1 text-xs text-muted-foreground">
                  Plus deposition {kr(listing.deposit)}, som du får tillbaka när saken lämnas
                  tillbaka.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {user ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="booking-message" className="text-sm font-medium">
              Hälsning till uthyraren (valfritt)
            </Label>
            <Textarea
              id="booking-message"
              rows={3}
              maxLength={1000}
              value={message}
              placeholder="T.ex. vad du ska använda den till och när du vill hämta"
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <Button
            size="lg"
            className="w-full"
            onClick={send}
            disabled={busy || !start || needsEnd || !!problem}
          >
            <CalendarCheck aria-hidden />{" "}
            {busy ? "Skickar …" : start ? "Skicka förfrågan" : "Välj datum först"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Inget är bokat förrän uthyraren godkänt. Hyran betalar ni direkt till varandra.
          </p>
        </>
      ) : (
        <Button asChild size="lg" className="w-full">
          <Link to="/auth" search={{ redirect: `/annons/${listing.id}` }}>
            <CalendarCheck aria-hidden /> Logga in för att boka
          </Link>
        </Button>
      )}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <p className={cn("flex justify-between gap-4", strong && "text-base font-semibold")}>
      <span>{label}</span>
      <span>{value}</span>
    </p>
  );
}
