import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronRight,
  FileText,
  MessageSquare,
  PackageCheck,
  PackageOpen,
  Search,
  Star,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { EmptyState, LoadingRows, Page, PageHeader } from "@/components/layout";
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
import { cn } from "@/lib/utils";
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
type Role = "all" | "renter" | "owner";

const ROLES: { key: Role; label: string }[] = [
  { key: "all", label: "Alla" },
  { key: "renter", label: "Jag hyr" },
  { key: "owner", label: "Jag hyr ut" },
];

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
  const [role, setRole] = useState<Role>("all");

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
  const shown = bookings.filter(
    (b) => role === "all" || (role === "owner" ? b.i_am_owner : !b.i_am_owner),
  );
  const toAnswer = shown.filter(
    (b) => b.i_am_owner && b.status === "requested" && b.start_date >= today,
  );
  const confirmed = shown
    .filter((b) => b.status === "confirmed")
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const ongoing = confirmed.filter((b) => !!b.picked_up_at);
  const upcoming = confirmed.filter((b) => !b.picked_up_at);
  const waiting = shown.filter(
    (b) => !b.i_am_owner && b.status === "requested" && b.start_date >= today,
  );
  const earlier = shown.filter(
    (b) => !toAnswer.includes(b) && !confirmed.includes(b) && !waiting.includes(b),
  );

  const sections = [
    {
      id: "att-svara-pa",
      title: "Att svara på",
      hint: "Godkänn eller neka innan första dagen.",
      items: toAnswer,
    },
    { id: "pagaende", title: "Pågående", hint: "Saken är utlämnad.", items: ongoing },
    {
      id: "kommande",
      title: "Kommande",
      hint: "Godkända bokningar som inte har börjat.",
      items: upcoming,
    },
    {
      id: "vantar-pa-svar",
      title: "Väntar på svar",
      hint: "Förfrågningar du har skickat.",
      items: waiting,
    },
    {
      id: "tidigare",
      title: "Tidigare",
      hint: "Avslutade, nekade, avbokade och utgångna.",
      items: earlier,
    },
  ].filter((s) => s.items.length > 0);

  const counts = {
    all: bookings.length,
    renter: bookings.filter((b) => !b.i_am_owner).length,
    owner: bookings.filter((b) => b.i_am_owner).length,
  };

  return (
    <Page>
      <PageHeader
        title="Bokningar"
        description="Förfrågningar du har skickat och fått. Hyrkoll förmedlar inga betalningar: pris, deposition och upphämtning gör ni upp direkt med varandra."
        actions={
          <Button variant="outline" asChild>
            <Link to="/sok" search={DEFAULTS}>
              <Search aria-hidden /> Hitta något att hyra
            </Link>
          </Button>
        }
      />

      {isLoading ? (
        <LoadingRows rows={3} />
      ) : isError ? (
        <EmptyState
          title="Bokningarna kunde inte hämtas."
          action={
            <Button variant="outline" onClick={() => void refetch()}>
              Försök igen
            </Button>
          }
        />
      ) : bookings.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Inga bokningar än"
          action={
            <Button asChild>
              <Link to="/sok" search={DEFAULTS}>
                Hitta något att hyra
              </Link>
            </Button>
          }
        >
          När du skickar en förfrågan om att hyra något, eller någon vill hyra av dig, hamnar den
          här.
        </EmptyState>
      ) : (
        <>
          {counts.owner > 0 && counts.renter > 0 && (
            <Tabs value={role} onValueChange={(v) => setRole(v as Role)} className="mb-8">
              <TabsList
                aria-label="Visa bokningar"
                className="h-auto flex-wrap justify-start gap-1 rounded-full p-1"
              >
                {ROLES.map((r) => (
                  <TabsTrigger
                    key={r.key}
                    value={r.key}
                    className="gap-1.5 rounded-full px-4 py-1.5"
                  >
                    {r.label}
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {counts[r.key]}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}

          {sections.length === 0 && (
            <EmptyState
              icon={CalendarDays}
              title={role === "owner" ? "Ingen har bokat av dig än" : "Du har inte hyrt något än"}
              action={
                <Button variant="outline" onClick={() => setRole("all")}>
                  Visa alla bokningar
                </Button>
              }
            />
          )}

          <div className="space-y-12">
            {sections.map((s) => (
              <section key={s.id} aria-labelledby={s.id}>
                <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 id={s.id} className="font-display text-2xl font-bold">
                    {s.title}{" "}
                    <span className="font-sans text-base font-normal tabular-nums text-muted-foreground">
                      ({s.items.length})
                    </span>
                  </h2>
                  <p className="text-sm text-muted-foreground">{s.hint}</p>
                </div>
                <ul className="space-y-4">
                  {s.items.map((b) => (
                    <li key={b.id}>
                      <BookingCard
                        b={b}
                        userId={user!.id}
                        busy={busy === b.id}
                        counterpartId={counterparts[b.id] ?? null}
                        myRating={myReviews ? (myReviews[b.id] ?? null) : undefined}
                        onAction={(a) => void act(b, a)}
                        onPhotosSaved={() => void refetch()}
                        onReviewed={() => void refetchReviews()}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </Page>
  );
}

type Tone = "action" | "active" | "done";

const TONES: Record<Tone, { pill: string; dot: string }> = {
  action: { pill: "bg-accent text-accent-foreground", dot: "bg-primary" },
  active: { pill: "border border-border bg-card text-foreground", dot: "bg-foreground" },
  done: { pill: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/60" },
};

/** Lugna statusfärger: orange bara när du behöver göra något. */
function statusOf(
  b: Booking,
  status: BookingStatus,
  expired: boolean,
): { label: string; tone: Tone } {
  if (expired) return { label: "Utgången", tone: "done" };
  if (status === "requested") {
    return b.i_am_owner
      ? { label: "Väntar på ditt svar", tone: "action" }
      : { label: BOOKING_STATUS.requested.label, tone: "active" };
  }
  if (status === "confirmed")
    return { label: b.picked_up_at ? "Pågår" : BOOKING_STATUS.confirmed.label, tone: "active" };
  return { label: BOOKING_STATUS[status].label, tone: "done" };
}

function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        TONES[tone].pill,
      )}
    >
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", TONES[tone].dot)} />
      {label}
    </span>
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
  const meta = statusOf(b, status, expired);
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
    <Link
      to="/profil/$id"
      params={{ id: counterpartId }}
      className="font-semibold text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
    >
      {b.counterpart_name}
    </Link>
  ) : (
    <span className="font-semibold text-foreground">{b.counterpart_name}</span>
  );

  return (
    <article className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex gap-4">
        <img
          src={photoUrl(b.listing_image)}
          alt={b.listing_title}
          loading="lazy"
          decoding="async"
          className="h-20 w-20 shrink-0 rounded-xl bg-muted object-cover sm:h-28 sm:w-36"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill {...meta} />
            <span className="text-xs text-muted-foreground">
              {b.i_am_owner ? "Du hyr ut" : "Du hyr"}
            </span>
          </div>
          <h3 className="mt-1.5 line-clamp-2 font-sans text-base font-semibold leading-snug tracking-normal sm:text-lg">
            <Link
              to="/annons/$id"
              params={{ id: b.listing_id }}
              className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {b.listing_title}
            </Link>
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {b.i_am_owner ? <>{name} vill hyra</> : <>Du hyr av {name}</>}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm">
            <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              {formatDates(b.start_date, b.end_date)}{" "}
              <span className="text-muted-foreground">({b.days} dygn)</span>
            </span>
          </p>
        </div>
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-muted-foreground">Pris</dt>
        <dd>
          <span className="font-semibold tabular-nums">{kr(Number(b.total_price))}</span>
          {b.delivery && <span className="text-muted-foreground"> inkl. leverans</span>}
        </dd>
        {Number(b.deposit) > 0 && (
          <>
            <dt className="text-muted-foreground">Deposition</dt>
            <dd>
              <span className="tabular-nums">{kr(Number(b.deposit))}</span>
              <span className="text-muted-foreground">, betalas direkt till uthyraren</span>
            </dd>
          </>
        )}
        {confirmed && (
          <>
            <dt className="text-muted-foreground">Avbokning</dt>
            <dd className="text-muted-foreground">
              {CANCELLATION_POLICIES[policy].label}: {CANCELLATION_POLICIES[policy].text}
            </dd>
          </>
        )}
      </dl>

      {b.message && (
        <figure className="mt-4 rounded-xl bg-muted px-4 py-3 text-sm">
          <figcaption className="mb-1 text-xs font-semibold text-muted-foreground">
            {b.i_am_owner ? `Meddelande från ${b.counterpart_name}` : "Ditt meddelande"}
          </figcaption>
          <blockquote className="whitespace-pre-line">{b.message}</blockquote>
        </figure>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        {status === "requested" && !expired && b.i_am_owner && (
          <>
            <Button size="sm" disabled={busy} onClick={() => onAction("accept")}>
              <Check aria-hidden /> Godkänn
            </Button>
            <ConfirmButton
              variant="outline"
              disabled={busy}
              label={
                <>
                  <X aria-hidden /> Neka
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
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onAction("cancel")}>
            <Undo2 aria-hidden /> Återkalla
          </Button>
        )}
        {confirmed && !b.picked_up_at && b.start_date <= addDays(today, 1) && (
          <ConfirmButton
            disabled={busy}
            label={
              <>
                <PackageOpen aria-hidden /> Markera som utlämnad
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
                <PackageCheck aria-hidden /> Markera som återlämnad
              </>
            }
            title="Markera som återlämnad?"
            description="Gör det när du har fått tillbaka saken och sett efter att den är hel. Fota gärna skicket. Hyran avslutas och det går inte att ångra."
            confirmLabel="Markera som återlämnad"
            onConfirm={() => onAction("returned")}
          />
        )}
        {reviewOpen && myRating === null && <ReviewDialog b={b} onDone={onReviewed} />}
        {(confirmed || status === "completed") && (
          <Button size="sm" variant="outline" asChild>
            <Link to="/avtal/$id" params={{ id: b.id }}>
              <FileText aria-hidden /> Hyresavtal
            </Link>
          </Button>
        )}
        {b.conversation_id && (
          <Button size="sm" variant="outline" asChild>
            <Link to="/meddelanden" search={{ c: b.conversation_id }}>
              <MessageSquare aria-hidden /> Öppna konversation
            </Link>
          </Button>
        )}
        {confirmed && b.picked_up_at && !b.i_am_owner && (
          <p className="text-xs text-muted-foreground">Uthyraren markerar när saken är tillbaka.</p>
        )}
        {myRating != null && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            Ditt omdöme: <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />{" "}
            {myRating}
          </span>
        )}
        {confirmed && !b.picked_up_at && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive sm:ml-auto"
                disabled={busy}
              >
                <X aria-hidden /> Avboka
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
        <details className="group mt-4" open={confirmed}>
          <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-sm text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <ChevronRight
              className="h-4 w-4 transition-transform group-open:rotate-90"
              aria-hidden
            />
            Bilder på skicket
            <span className="font-normal tabular-nums text-muted-foreground">
              ({(b.pickup_photos ?? []).length + (b.return_photos ?? []).length})
            </span>
          </summary>
          <div className="mt-3">
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
        </details>
      )}
    </article>
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
        <Button size="sm">
          <Star aria-hidden /> Lämna omdöme
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
          <Button onClick={() => void send()} disabled={sending || rating < 1}>
            Skicka omdöme
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
