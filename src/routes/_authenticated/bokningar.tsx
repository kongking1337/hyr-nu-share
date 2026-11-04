import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Check,
  FileText,
  MessageSquare,
  PackageCheck,
  PackageOpen,
  Star,
  Undo2,
  X,
} from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { BookingPhotos } from "@/components/BookingPhotos";
import { Stars } from "@/components/Stars";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  addDays,
  asPolicy,
  BOOKING_STATUS,
  CANCELLATION_POLICIES,
  formatDates,
  fromISODate,
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

  const {
    data: bookings = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["my-bookings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_bookings");
      if (error) throw error;
      return data ?? [];
    },
  });

  // my_bookings visar bara namn; id:n behövs för länken till den andras profil.
  const { data: counterparts = {} } = useQuery({
    queryKey: ["booking-parties", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("bookings").select("id, owner_id, renter_id");
      if (error) throw error;
      return Object.fromEntries(
        (data ?? []).map((r) => [r.id, r.owner_id === user!.id ? r.renter_id : r.owner_id]),
      ) as Record<string, string | null>;
    },
  });

  const { data: myReviews, refetch: refetchReviews } = useQuery({
    queryKey: ["my-reviews", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("booking_id, rating")
        .eq("author_id", user!.id);
      if (error) throw error;
      return Object.fromEntries(
        (data ?? []).filter((r) => r.booking_id).map((r) => [r.booking_id!, r.rating]),
      ) as Record<string, number>;
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
    toast.success(
      action === "cancel" && b.status === "requested" ? "Förfrågan är återkallad." : DONE[action],
    );
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
  const toAnswer = bookings.filter(
    (b) => b.i_am_owner && b.status === "requested" && b.start_date >= today,
  );
  const upcoming = bookings
    .filter((b) => b.status === "confirmed")
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const waiting = bookings.filter(
    (b) => !b.i_am_owner && b.status === "requested" && b.start_date >= today,
  );
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

      {isError && (
        <p className="mt-6 text-sm text-muted-foreground">
          Bokningarna kunde inte hämtas.{" "}
          <button className="text-primary hover:underline" onClick={() => void refetch()}>
            Försök igen
          </button>
        </p>
      )}

      {!isLoading && !isError && bookings.length === 0 && (
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
            {s.title}{" "}
            <span className="text-base font-normal text-muted-foreground">({s.items.length})</span>
          </h2>
          <div className="mt-3 space-y-3">
            {s.items.map((b) => (
              <BookingCard
                key={b.id}
                b={b}
                userId={user!.id}
                busy={busy === b.id}
                counterpartId={counterparts[b.id] ?? null}
                myRating={myReviews ? (myReviews[b.id] ?? null) : undefined}
                onAction={(a) => void act(b, a)}
                onPhotosSaved={() => void refetch()}
                onReviewed={() => void refetchReviews()}
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
  counterpartId,
  myRating,
  onAction,
  onPhotosSaved,
  onReviewed,
}: {
  b: Booking;
  userId: string;
  busy: boolean;
  counterpartId: string | null;
  /** undefined medan omdömena hämtas */
  myRating: number | null | undefined;
  onAction: (a: Action) => void;
  onPhotosSaved: () => void;
  onReviewed: () => void;
}) {
  const today = todayISO();
  const status = (b.status in BOOKING_STATUS ? b.status : "requested") as BookingStatus;
  const expired = status === "requested" && b.start_date < today;
  const meta = expired
    ? { label: "Utgången", className: "bg-muted text-muted-foreground" }
    : BOOKING_STATUS[status];
  const policy = asPolicy(b.cancellation_policy);
  const confirmed = status === "confirmed";
  // Omdömen kan lämnas i 14 dagar efter återlämningen, eller (om saken aldrig markerats som
  // återlämnad) från tre dagar efter sista dagen. Databasen avgör till slut.
  const ended =
    status === "completed" && b.returned_at
      ? new Date(b.returned_at).getTime()
      : confirmed && b.picked_up_at && today > addDays(b.end_date, 3)
        ? fromISODate(addDays(b.end_date, 3)).getTime()
        : null;
  const reviewOpen = ended !== null && Date.now() - ended < 14 * 86_400_000;
  const name = counterpartId ? (
    <Link to="/profil/$id" params={{ id: counterpartId }} className="text-primary hover:underline">
      {b.counterpart_name}
    </Link>
  ) : (
    b.counterpart_name
  );

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
            {b.i_am_owner ? <>{name} vill hyra</> : <>Du hyr av {name}</>} ·{" "}
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
              Avbokning ({CANCELLATION_POLICIES[policy].label.toLowerCase()}):{" "}
              {CANCELLATION_POLICIES[policy].text}
            </p>
          )}
          {b.message && (
            <p className="mt-2 whitespace-pre-line rounded-2xl bg-muted/60 px-3 py-2 text-sm">
              {b.message}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {status === "requested" && !expired && b.i_am_owner && (
          <>
            <Button
              size="sm"
              className="rounded-full"
              disabled={busy}
              onClick={() => onAction("accept")}
            >
              <Check className="mr-1 h-4 w-4" /> Godkänn
            </Button>
            <ConfirmButton
              variant="outline"
              disabled={busy}
              label={
                <>
                  <X className="mr-1 h-4 w-4" /> Neka
                </>
              }
              title={`Neka förfrågan för ${formatDates(b.start_date, b.end_date)}?`}
              description={`${b.counterpart_name} får ett meddelande om att förfrågan är nekad. Det går inte att ångra.`}
              confirmLabel="Neka"
              onConfirm={() => onAction("decline")}
            />
          </>
        )}
        {status === "requested" && !b.i_am_owner && (
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            disabled={busy}
            onClick={() => onAction("cancel")}
          >
            <Undo2 className="mr-1 h-4 w-4" /> Återkalla
          </Button>
        )}
        {confirmed && !b.picked_up_at && b.start_date <= addDays(today, 1) && (
          <ConfirmButton
            disabled={busy}
            label={
              <>
                <PackageOpen className="mr-1 h-4 w-4" /> Markera som utlämnad
              </>
            }
            title="Markera som utlämnad?"
            description="Gör det när saken har lämnats över. Fota gärna skicket först (längre ner på kortet). Det går inte att ångra, och bokningen kan inte avbokas efteråt."
            confirmLabel="Markera som utlämnad"
            onConfirm={() => onAction("picked_up")}
          />
        )}
        {confirmed && b.picked_up_at && b.i_am_owner && (
          <ConfirmButton
            disabled={busy}
            label={
              <>
                <PackageCheck className="mr-1 h-4 w-4" /> Markera som återlämnad
              </>
            }
            title="Markera som återlämnad?"
            description="Gör det när du har fått tillbaka saken och sett efter att den är hel. Fota gärna skicket. Hyran avslutas och det går inte att ångra."
            confirmLabel="Markera som återlämnad"
            onConfirm={() => onAction("returned")}
          />
        )}
        {confirmed && b.picked_up_at && !b.i_am_owner && (
          <p className="self-center text-xs text-muted-foreground">
            Uthyraren markerar när saken är tillbaka.
          </p>
        )}
        {(confirmed || status === "completed") && (
          <Button size="sm" variant="outline" className="rounded-full" asChild>
            <Link to="/avtal/$id" params={{ id: b.id }}>
              <FileText className="mr-1 h-4 w-4" /> Hyresavtal
            </Link>
          </Button>
        )}
        {myRating != null && (
          <span className="flex items-center gap-1 self-center text-xs text-muted-foreground">
            Ditt omdöme: <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {myRating}
          </span>
        )}
        {reviewOpen && myRating === null && <ReviewDialog b={b} onDone={onReviewed} />}
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
              <Button
                size="sm"
                variant="ghost"
                className="rounded-full text-destructive"
                disabled={busy}
              >
                <X className="mr-1 h-4 w-4" /> Avboka
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Avboka {formatDates(b.start_date, b.end_date)}?</AlertDialogTitle>
                <AlertDialogDescription>
                  {b.i_am_owner
                    ? `${b.counterpart_name} får ett meddelande om att bokningen är avbokad. Förklara gärna varför i konversationen.`
                    : lateCancellation(policy, b.start_date)
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
            returnedAt={b.returned_at}
            onSaved={onPhotosSaved}
          />
        </div>
      )}
    </div>
  );
}

/** Knapp som frågar först, för steg som inte går att ångra. */
function ConfirmButton({
  label,
  title,
  description,
  confirmLabel,
  onConfirm,
  disabled,
  variant = "default",
}: {
  label: React.ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
  variant?: "default" | "outline";
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant={variant} className="rounded-full" disabled={disabled}>
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Avbryt</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Omdöme om den andra efter en avslutad hyra. Går inte att ändra efteråt. */
function ReviewDialog({ b, onDone }: { b: Booking; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    if (rating < 1) {
      toast.error("Välj 1–5 stjärnor.");
      return;
    }
    setSending(true);
    const { error } = await supabase.rpc("leave_review", {
      _booking_id: b.id,
      _rating: rating,
      _body: body.trim(),
    });
    setSending(false);
    if (error) {
      toast.error(userMessage(error, "Omdömet kunde inte sparas. Försök igen."));
      return;
    }
    toast.success("Tack för ditt omdöme!");
    setOpen(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="rounded-full">
          <Star className="mr-1 h-4 w-4" /> Lämna omdöme
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Omdöme om {b.counterpart_name}</DialogTitle>
          <DialogDescription>
            Omdömet visas när ni båda har skrivit, eller efter 14 dagar. Det går inte att ändra.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Stars value={rating} onChange={setRating} size="lg" />
          <Textarea
            rows={4}
            maxLength={1000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-label="Omdöme (valfritt)"
            placeholder={
              b.i_am_owner
                ? "Hur gick hyran? T.ex. kom i tid, var rädd om saken, lämnade tillbaka den i samma skick (valfritt)"
                : "Hur gick hyran? T.ex. stämde saken med annonsen, var upphämtningen smidig (valfritt)"
            }
          />
        </div>
        <DialogFooter>
          <Button
            className="rounded-full"
            onClick={() => void send()}
            disabled={sending || rating < 1}
          >
            Skicka omdöme
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
