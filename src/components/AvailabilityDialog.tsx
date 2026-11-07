import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CalendarDays, Trash2 } from "lucide-react";
import { sv } from "react-day-picker/locale";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { formatDates, takenRanges, toISODate, todayISO } from "@/lib/bookings";
import { userMessage } from "@/lib/db-errors";

/** Uthyrarens kalender för en annons: se bokade dagar, blockera och avblockera dagar. */
export function AvailabilityDialog({ listingId, title }: { listingId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>();
  const [busy, setBusy] = useState(false);
  const wide = useWide();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["availability", listingId],
    enabled: open,
    queryFn: async () => {
      const today = todayISO();
      const [booked, blocked] = await Promise.all([
        supabase
          .from("bookings")
          .select("start_date, end_date, status, returned_at")
          .eq("listing_id", listingId)
          .in("status", ["confirmed", "completed"])
          .gte("end_date", today),
        supabase
          .from("listing_blocked_dates")
          .select("id, start_date, end_date")
          .eq("listing_id", listingId)
          .gte("end_date", today)
          .order("start_date"),
      ]);
      if (booked.error) throw booked.error;
      if (blocked.error) throw blocked.error;
      // Lämnas saken tillbaka tidigt blir resten av dagarna lediga (som i databasens booked_dates).
      const bookedRanges = (booked.data ?? [])
        .map((b) => {
          const returned =
            b.status === "completed" && b.returned_at ? toISODate(new Date(b.returned_at)) : null;
          return {
            start_date: b.start_date,
            end_date: returned && returned < b.end_date ? returned : b.end_date,
          };
        })
        .filter((b) => b.end_date >= today);
      return { booked: bookedRanges, blocked: blocked.data ?? [] };
    },
  });

  async function block() {
    if (!range?.from) return;
    setBusy(true);
    const { error } = await supabase.from("listing_blocked_dates").insert({
      listing_id: listingId,
      start_date: toISODate(range.from),
      end_date: toISODate(range.to ?? range.from),
    });
    setBusy(false);
    if (error) {
      toast.error(userMessage(error, "Kunde inte blockera dagarna."));
      return;
    }
    setRange(undefined);
    toast.success("Dagarna är blockerade.");
    void refetch();
  }

  async function unblock(id: string) {
    const { error } = await supabase.from("listing_blocked_dates").delete().eq("id", id);
    if (error) {
      toast.error("Kunde inte ta bort blockeringen.");
      return;
    }
    void refetch();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="rounded-full">
          <CalendarDays className="mr-1 h-4 w-4" /> Kalender
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Kalender – {title}</DialogTitle>
          <DialogDescription>
            Blockerade dagar går inte att boka. Bokningar du godkänt blockeras automatiskt.
          </DialogDescription>
        </DialogHeader>

        <Calendar
          mode="range"
          locale={sv}
          weekStartsOn={1}
          numberOfMonths={wide ? 2 : 1}
          selected={range}
          onSelect={setRange}
          disabled={{ before: new Date() }}
          modifiers={{ booked: takenRanges(data?.booked), blocked: takenRanges(data?.blocked) }}
          modifiersClassNames={{
            booked: "[&>button]:bg-primary/20 [&>button]:text-primary",
            blocked: "[&>button]:bg-muted [&>button]:text-muted-foreground [&>button]:line-through",
          }}
          className="mx-auto rounded-2xl border border-border"
        />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-primary/20" /> Bokad
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm border border-border bg-muted" /> Blockerad av dig
          </span>
        </div>

        <Button className="rounded-full" disabled={!range?.from || busy} onClick={block}>
          {range?.from
            ? `Blockera ${formatDates(toISODate(range.from), toISODate(range.to ?? range.from))}`
            : "Välj dagar att blockera"}
        </Button>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Blockerade perioder</h3>
          {isLoading && <p className="text-sm text-muted-foreground">Hämtar kalendern …</p>}
          {isError && (
            <p className="text-sm text-muted-foreground">
              Kalendern kunde inte hämtas.{" "}
              <button className="text-primary hover:underline" onClick={() => void refetch()}>
                Försök igen
              </button>
            </p>
          )}
          {data && !data.blocked.length && (
            <p className="text-sm text-muted-foreground">Inga blockerade dagar framåt.</p>
          )}
          {data?.blocked.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between rounded-2xl border border-border px-3 py-2 text-sm"
            >
              {formatDates(b.start_date, b.end_date)}
              <Button
                size="sm"
                variant="ghost"
                className="rounded-full"
                onClick={() => unblock(b.id)}
              >
                <Trash2 className="mr-1 h-4 w-4" /> Ta bort
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Två månader bredvid varandra från sm-bredd. */
function useWide(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return wide;
}
