import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Circle, CircleCheck, FileX, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, Page } from "@/components/layout";
import { supabase } from "@/integrations/supabase/client";
import { CANCELLATION_POLICIES, asPolicy, formatDates, fromISODate } from "@/lib/bookings";
import { userMessage } from "@/lib/db-errors";
import { notifyNewMessage } from "@/lib/notify.functions";
import { kr } from "@/lib/pricing";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/avtal/$id")({
  head: () => ({
    meta: [{ title: "Hyresavtal – Hyrkoll" }, { name: "robots", content: "noindex" }],
  }),
  component: AgreementPage,
});

/** Det som booking_agreement() i databasen returnerar (supabase/migrations/20261101180000_trust.sql). */
type Agreement = {
  booking_id: string;
  listing_id: string;
  status: string;
  start_date: string;
  end_date: string;
  days: number;
  base_price: number;
  delivery: boolean;
  delivery_fee: number;
  deposit: number;
  total_price: number;
  owner_name: string;
  renter_name: string;
  terms: {
    terms_version?: number;
    title: string;
    description: string;
    included: string;
    rental_rules: string;
    cancellation_policy: string;
    pickup_available: boolean;
    delivery_available: boolean;
    city: string;
    area: string | null;
  } | null;
  owner_agreed_at: string | null;
  renter_agreed_at: string | null;
  picked_up_at: string | null;
  returned_at: string | null;
  i_am_owner: boolean;
};

/**
 * Standardvillkoren per version. Avtalet sparar vilken version som gällde (terms_version i
 * private.agreement_terms). Ändra aldrig en gammal version: lägg till en ny och höj
 * versionen i databasen.
 */
const STANDARD_TERMS: Record<number, string[]> = {
  1: [
  "Hyresgästen ansvarar för saken under hyrestiden och lämnar tillbaka den i samma skick och i tid.",
  "Uthyraren intygar att saken fungerar och är säker att använda, och visar hur den används.",
  "Skador och fel meddelas direkt. Ersättning för skador som hyresgästen orsakat kommer parterna överens om, och depositionen kan användas till det.",
  "Hyra och deposition betalas direkt mellan parterna. Depositionen betalas tillbaka när saken lämnats tillbaka utan skador.",
  "Hyrkoll är inte part i avtalet och förmedlar inga betalningar.",
  "Bilderna på skicket vid utlämning och återlämning (under Bokningar) gäller som dokumentation.",
  ],
};

const fullDate = (iso: string) =>
  fromISODate(iso).toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("sv-SE", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

function AgreementPage() {
  const { id } = Route.useParams();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ["agreement", id],
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("booking_agreement", { _booking_id: id });
      if (error) throw error;
      return data as unknown as Agreement;
    },
  });

  if (isLoading) {
    return (
      <Page width="text">
        <div className="space-y-6 rounded-2xl border border-border p-6 sm:p-10" aria-busy="true" aria-label="Laddar">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-2/3" />
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-2 pt-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          ))}
        </div>
      </Page>
    );
  }

  if (error || !data) {
    return (
      <Page width="text">
        <EmptyState
          icon={FileX}
          title="Hyresavtal"
          action={
            <Button asChild variant="outline">
              <Link to="/bokningar">
                <ArrowLeft aria-hidden /> Till Bokningar
              </Link>
            </Button>
          }
        >
          {userMessage(error, "Avtalet kunde inte visas.")}
        </EmptyState>
      </Page>
    );
  }

  const a = data;
  const t = a.terms;
  const policy = CANCELLATION_POLICIES[asPolicy(t?.cancellation_policy)];
  const myAgreedAt = a.i_am_owner ? a.owner_agreed_at : a.renter_agreed_at;
  const canAccept = a.status === "confirmed" && !myAgreedAt;
  const handover = [
    t?.pickup_available && "Hämtas hos uthyraren",
    t?.delivery_available && "Leverans kan ordnas",
  ]
    .filter(Boolean)
    .join(" eller ");

  async function accept() {
    setBusy(true);
    const { data: res, error } = await supabase.rpc("accept_agreement", { _booking_id: id });
    setBusy(false);
    if (error) {
      toast.error(userMessage(error, "Avtalet kunde inte godkännas. Försök igen."));
      return;
    }
    toast.success("Du har godkänt avtalet.");
    const conversationId = (res as { conversation_id?: string } | null)?.conversation_id;
    if (conversationId) {
      notifyNewMessage({ data: { conversationId } }).catch((e) => console.error("[notify]", e));
    }
    void refetch();
  }

  const bothAgreed = !!a.owner_agreed_at && !!a.renter_agreed_at;
  let n = 0;
  const num = () => `${++n}.`;

  return (
    <Page width="text" className="print:max-w-none print:px-0 print:py-0">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button asChild variant="ghost" className="-ml-3">
          <Link to="/bokningar">
            <ArrowLeft aria-hidden /> Bokningar
          </Link>
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer aria-hidden /> Skriv ut / spara som PDF
        </Button>
      </div>

      <article className="rounded-2xl border border-border bg-card p-6 sm:p-10 print:rounded-none print:border-0 print:bg-transparent print:p-0">
        <header className="border-b border-border pb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Hyrkoll
            {bothAgreed ? " · Godkänt av båda" : a.status === "confirmed" ? " · Väntar på godkännande" : ""}
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold leading-tight sm:text-4xl">Hyresavtal</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Avtalet är mellan er två. Hyrkoll är inte part i avtalet.
          </p>
          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl bg-muted/60 px-4 py-3 print:border print:border-border print:bg-transparent">
              <dt className="text-xs text-muted-foreground">Uthyrare</dt>
              <dd className="font-semibold">{a.owner_name}</dd>
            </div>
            <div className="rounded-xl bg-muted/60 px-4 py-3 print:border print:border-border print:bg-transparent">
              <dt className="text-xs text-muted-foreground">Hyresgäst</dt>
              <dd className="font-semibold">{a.renter_name}</dd>
            </div>
          </dl>
        </header>

        <div className="divide-y divide-border">
          <Section n={num()} title="Det som hyrs ut">
            <p className="font-semibold">{t?.title ?? "Annonsen finns inte längre"}</p>
            {t?.description && <p className="whitespace-pre-line text-muted-foreground">{t.description}</p>}
            {t?.included && (
              <p className="whitespace-pre-line">
                <span className="font-semibold">Det här ingår: </span>
                {t.included}
              </p>
            )}
          </Section>

          <Section n={num()} title="Hyrestid">
            <p className="font-semibold">
              {formatDates(a.start_date, a.end_date)} ({a.days} dygn)
            </p>
            <p className="text-muted-foreground">
              Från {fullDate(a.start_date)} till och med {fullDate(a.end_date)}.
            </p>
          </Section>

          <Section n={num()} title="Pris">
            <table className="w-full max-w-sm text-sm tabular-nums">
              <caption className="sr-only">Pris</caption>
              <tbody>
                <PriceRow label="Hyra" value={kr(Number(a.base_price))} />
                {a.delivery && (
                  <PriceRow
                    label="Leverans"
                    value={Number(a.delivery_fee) > 0 ? kr(Number(a.delivery_fee)) : "Ingår"}
                  />
                )}
                <PriceRow label="Totalt" value={kr(Number(a.total_price))} strong />
                <PriceRow
                  label="Deposition"
                  value={Number(a.deposit) > 0 ? kr(Number(a.deposit)) : "Ingen"}
                />
              </tbody>
            </table>
          </Section>

          <Section n={num()} title="Utlämning och återlämning">
            <p>{a.delivery ? "Uthyraren levererar saken." : handover || "Enligt överenskommelse."}</p>
            {t?.city && (
              <p className="text-muted-foreground">
                Plats: {t.area ? `${t.area}, ` : ""}
                {t.city}
              </p>
            )}
            {a.picked_up_at && <p className="text-muted-foreground">Utlämnad {dateTime(a.picked_up_at)}.</p>}
            {a.returned_at && <p className="text-muted-foreground">Återlämnad {dateTime(a.returned_at)}.</p>}
          </Section>

          {t?.rental_rules && (
            <Section n={num()} title="Uthyrarens regler">
              <p className="whitespace-pre-line">{t.rental_rules}</p>
            </Section>
          )}

          <Section n={num()} title="Avbokning">
            <p>
              <span className="font-semibold">{policy.label}:</span> {policy.text}
            </p>
          </Section>

          <Section n={num()} title="Villkor">
            <ul className="list-disc space-y-1.5 pl-5 marker:text-muted-foreground">
              {(STANDARD_TERMS[t?.terms_version ?? 1] ?? STANDARD_TERMS[1]!).map((term) => (
                <li key={term}>{term}</li>
              ))}
            </ul>
          </Section>
        </div>

        <section aria-labelledby="underskrifter" className="mt-2 border-t border-border pt-6 print:break-inside-avoid">
          <h2 id="underskrifter" className="sr-only">
            Godkännanden
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 print:grid-cols-2">
            <Signature role="Uthyrare" name={a.owner_name} agreedAt={a.owner_agreed_at} />
            <Signature role="Hyresgäst" name={a.renter_name} agreedAt={a.renter_agreed_at} />
          </div>
        </section>

        {canAccept && (
          <div className="mt-6 space-y-4 rounded-2xl bg-accent/60 p-4 sm:p-5 print:hidden">
            <div className="flex items-start gap-3">
              <Checkbox
                id="accept-agreement"
                checked={accepted}
                onCheckedChange={(v) => setAccepted(v === true)}
                className="mt-0.5"
              />
              <Label htmlFor="accept-agreement" className="cursor-pointer text-sm font-normal leading-snug">
                Jag har läst och godkänner avtalet
              </Label>
            </div>
            <Button disabled={!accepted || busy} onClick={accept}>
              Godkänn avtalet
            </Button>
          </div>
        )}
      </article>
    </Page>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 py-6 text-sm leading-relaxed print:break-inside-avoid sm:text-[15px]">
      <h2 className="font-display text-lg font-bold">
        <span className="mr-1.5 tabular-nums text-muted-foreground">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function PriceRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <tr className={strong ? "border-t border-border font-semibold" : undefined}>
      <th scope="row" className="py-1.5 pr-6 text-left font-[inherit]">
        {label}
      </th>
      <td className="py-1.5 text-right">{value}</td>
    </tr>
  );
}

function Signature({ role, name, agreedAt }: { role: string; name: string; agreedAt: string | null }) {
  return (
    <div className="space-y-1 rounded-xl border border-border px-4 py-3 text-sm">
      <p className="text-xs text-muted-foreground">{role}</p>
      <p className="font-semibold">{name}</p>
      <p className={cn("flex items-center gap-1.5", agreedAt ? "text-foreground" : "text-muted-foreground")}>
        {agreedAt ? (
          <CircleCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        ) : (
          <Circle className="h-4 w-4 shrink-0" aria-hidden />
        )}
        {agreedAt ? `Godkänt ${dateTime(agreedAt)}` : "Inte godkänt än"}
      </p>
    </div>
  );
}
