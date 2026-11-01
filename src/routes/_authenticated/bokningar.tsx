import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, MessageSquare, PackageCheck, PackageOpen, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { BookingPhotos } from "@/components/BookingPhotos";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  BOOKING_STATUS,
  CANCELLATION_POLICIES,
  addDays,
  asPolicy,
  formatDates,
  lateCancellation,
  todayISO,
  type BookingStatus,
} from "@/lib/bookings";
import { userMessage } from "@/lib/db-errors";
import { notifyNewMessage } from "@/lib/notify.functions";
import { photoUrl } from "@/lib/photos";
import { kr } from "@/lib/pricing";
import { DEFAULTS } from "@/lib/search/params";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/bokningar")({
  head: () => ({
    meta: [
      { title: "Bokningar – Hyrkoll" },
      { name: "description", content: "Dina bokningar och förfrågningar på Hyrkoll." },
      { property: "og:title", content: "Bokningar – Hyrkoll" },
      { property: "og:description", content: "Dina bokningar och förfrågningar på Hyrkoll." },
    ],
  }),
  component: BookingsPage,
});

type Booking = Database["public"]["Functions"]["my_bookings"]["Returns"][number];
type Action = "accept" | "decline" | "cancel" | "picked_up" | "returned";

const DONE: Record<Action, string> = {
  accept: "Bokningen är godkänd.",
  decline: "Förfrågan är nekad.",
  cancel: "Bokningen är avbokad.",
  picked_up: "Markerad som utlämnad.",
  returned: "Markerad som återlämnad. Hyran är avslutad.",
};

function BookingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const { data: bookings = [], isLoading, refetch } = useQuery({
    queryKey: ["my-bookings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_bookings");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function act(b: Booking, action: Action) {
    setBusy(b.id);
    const { data, error } = await supabase.rpc("respond_booking", {
      _booking_id: b.id,
      _action: action,
    });
    setBusy(null);
    if (error) {
      toast.error(userMessage(error, "Det gick inte. Försök igen."));
      return;
    }
    toast.success(action === "cancel" && b.status === "requested" ? "Förfrågan är återkallad." : DONE[action]);
    const conversationId = (data as { conversation_id?: string } | null)?.conversation_id;
    // Mejla den andra (om e-post är uppsatt). Misslyckas det syns meddelandet ändå på sajten.
    if (conversationId) {
      notifyNewMessage({ data: { conversationId } }).catch((e) => console.error("[notify]", e));
    }
    void refetch();
    void queryClient.invalidateQueries({ queryKey: ["pending-bookings"] });
    void queryClient.invalidateQueries({ queryKey: ["conversations"] });
  }

  const today = todayISO();
  const toAnswer = bookings.filter((b) => b.i_am_owner && b.status === "requested" && b.start_date >= today);
  const upcoming = bookings
    .filter((b) => b.status === "confirmed")
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const waiting = bookings.filter((b) => !b.i_am_owner && b.status === "requested" && b.start_date >= today);
  const earlier = bookings.filter(
    (b) => !toAnswer.includes(b) && !upcoming.includes(b) && !waiting.includes(b),
  );

  const sections = [
    { title: "Att svara på", items: toAnswer },
    { title: "Kommande och pågående", items: upcoming },
    { title: "Väntar på svar", items: waiting },
    { title: "Tidigare", items: earlier },
  ].filter((s) => s.items.length > 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="font-display text-3xl font-semibold">Bokningar</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Förfrågningar du har skickat och fått. Hyrkoll förmedlar inga betalningar: pris, deposition
        och upphämtning gör ni upp direkt med varandra.
      </p>

      {isLoading && <p className="mt-6 text-sm text-muted-foreground">Hämtar dina bokningar …</p>}

      {!isLoading && bookings.length === 0 && (
        <div className="mt-6 rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Du har inga bokningar än.{" "}
          <Link to="/sok" search={DEFAULTS} className="text-primary hover:underline">
            Hitta något att hyra
          </Link>
          .
        </div>
      )}

      {sections.map((s) => (
        <section key={s.title} className="mt-8">
          <h2 className="font-display text-xl font-semibold">
            {s.title} <span className="text-base font-normal text-muted-foreground">({s.items.length})</span>
          </h2>
          <div className="mt-3 space-y-3">
            {s.items.map((b) => (
              <BookingCard
                key={b.id}
                b={b}
                userId={user!.id}
                busy={busy === b.id}
                onAction={(a) => void act(b, a)}
                onPhotosSaved={() => void refetch()}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function BookingCard({
  b,
  userId,
  busy,
  onAction,
  onPhotosSaved,
}: {
  b: Booking;
  userId: string;
  busy: boolean;
  onAction: (a: Action) => void;
  onPhotosSaved: () => void;
}) {
  const today = todayISO();
  const status = (b.status in BOOKING_STATUS ? b.status : "requested") as BookingStatus;
  const expired = status === "requested" && b.start_date < today;
  const meta = expired ? { label: "Utgången", className: "bg-muted text-muted-foreground" } : BOOKING_STATUS[status];
  const policy = asPolicy(b.cancellation_policy);
  const confirmed = status === "confirmed";

  return (
    <div className="rounded-3xl border border-border p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row">
        <img
          src={photoUrl(b.listing_image)}
          alt={b.listing_title}
          loading="lazy"
          className="h-40 w-full rounded-2xl object-cover sm:h-28 sm:w-40"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={`rounded-full border-0 ${meta.className}`}>{meta.label}</Badge>
            {confirmed && b.picked_up_at && (
              <span className="text-xs text-muted-foreground">Utlämnad</span>
            )}
          </div>
          <h3 className="truncate font-display text-lg font-semibold">
            <Link to="/annons/$id" params={{ id: b.listing_id }} className="hover:underline">
              {b.listing_title}
            </Link>
          </h3>
          <p className="text-sm text-muted-foreground">
            {b.i_am_owner ? `${b.counterpart_name} vill hyra` : `Du hyr av ${b.counterpart_name}`} ·{" "}
            {formatDates(b.start_date, b.end_date)} ({b.days} dygn)
          </p>
          <p className="text-sm">
            <span className="font-semibold">{kr(Number(b.total_price))}</span>
            {b.delivery && <span className="text-muted-foreground"> inkl. leverans</span>}
          </p>
          {Number(b.deposit) > 0 && (
            <p className="text-sm text-muted-foreground">
              Deposition {kr(Number(b.deposit))}, betalas direkt till uthyraren
            </p>
          )}
          {confirmed && (
            <p className="text-xs text-muted-foreground">
              Avbokning ({CANCELLATION_POLICIES[policy].label.toLowerCase()}): {CANCELLATION_POLICIES[policy].text}
            </p>
          )}
          {b.message && (
            <p className="mt-2 whitespace-pre-line rounded-2xl bg-muted/60 px-3 py-2 text-sm">{b.message}</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {status === "requested" && !expired && b.i_am_owner && (
          <>
            <Button size="sm" className="rounded-full" disabled={busy} onClick={() => onAction("accept")}>
              <Check className="mr-1 h-4 w-4" /> Godkänn
            </Button>
            <Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={() => onAction("decline")}>
              <X className="mr-1 h-4 w-4" /> Neka
            </Button>
          </>
        )}
        {status === "requested" && !b.i_am_owner && (
          <Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={() => onAction("cancel")}>
            <Undo2 className="mr-1 h-4 w-4" /> Återkalla
          </Button>
        )}
        {confirmed && !b.picked_up_at && b.start_date <= addDays(today, 1) && (
          <Button size="sm" className="rounded-full" disabled={busy} onClick={() => onAction("picked_up")}>
            <PackageOpen className="mr-1 h-4 w-4" /> Markera som utlämnad
          </Button>
        )}
        {confirmed && b.picked_up_at && b.i_am_owner && (
          <Button size="sm" className="rounded-full" disabled={busy} onClick={() => onAction("returned")}>
            <PackageCheck className="mr-1 h-4 w-4" /> Markera som återlämnad
          </Button>
        )}
        {confirmed && b.picked_up_at && !b.i_am_owner && (
          <p className="self-center text-xs text-muted-foreground">
            Uthyraren markerar när saken är tillbaka.
          </p>
        )}
        {b.conversation_id && (
          <Button size="sm" variant="outline" className="rounded-full" asChild>
            <Link to="/meddelanden" search={{ c: b.conversation_id }}>
              <MessageSquare className="mr-1 h-4 w-4" /> Öppna konversation
            </Link>
          </Button>
        )}
        {confirmed && !b.picked_up_at && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost" className="rounded-full text-destructive" disabled={busy}>
                <X className="mr-1 h-4 w-4" /> Avboka
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Avboka {formatDates(b.start_date, b.end_date)}?</AlertDialogTitle>
                <AlertDialogDescription>
                  {lateCancellation(policy, b.start_date)
                    ? `Det är senare än uthyrarens regel: ${CANCELLATION_POLICIES[policy].text} Avboka bara om det verkligen behövs, och förklara gärna varför i konversationen.`
                    : `${b.counterpart_name} får ett meddelande om att bokningen är avbokad.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Behåll bokningen</AlertDialogCancel>
                <AlertDialogAction onClick={() => onAction("cancel")}>Avboka</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {(confirmed || status === "completed") && (
        <div className="mt-4">
          <BookingPhotos
            bookingId={b.id}
            userId={userId}
            pickupPhotos={b.pickup_photos ?? []}
            returnPhotos={b.return_photos ?? []}
            showReturn={!!b.picked_up_at}
            onSaved={onPhotosSaved}
          />
        </div>
      )}
    </div>
  );
}
