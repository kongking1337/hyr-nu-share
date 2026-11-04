import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { CANCELLATION_POLICIES, asPolicy, formatDates, fromISODate } from "@/lib/bookings";
import { userMessage } from "@/lib/db-errors";
import { notifyNewMessage } from "@/lib/notify.functions";
import { kr } from "@/lib/pricing";

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
  fromISODate(iso).toLocaleDateString("sv-SE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("sv-SE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

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
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Skeleton className="h-[480px] rounded-3xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-14 text-center">
        <h1 className="font-display text-2xl font-semibold">Hyresavtal</h1>
        <p className="text-muted-foreground">{userMessage(error, "Avtalet kunde inte visas.")}</p>
        <Button asChild variant="outline" className="rounded-full">
          <Link to="/bokningar">
            <ArrowLeft className="mr-1 h-4 w-4" /> Till Bokningar
          </Link>
        </Button>
      </div>
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

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 print:max-w-none print:px-0 print:py-0">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button asChild variant="ghost" className="rounded-full">
          <Link to="/bokningar">
            <ArrowLeft className="mr-1 h-4 w-4" /> Bokningar
          </Link>
        </Button>
        <Button variant="outline" className="rounded-full" onClick={() => window.print()}>
          <Printer className="mr-1 h-4 w-4" /> Skriv ut / spara som PDF
        </Button>
      </div>

      <article className="space-y-8 rounded-3xl border border-border p-6 sm:p-10 print:rounded-none print:border-0 print:p-0">
        <header className="space-y-2">
          <h1 className="font-display text-3xl font-semibold">Hyresavtal</h1>
          <p className="text-sm text-muted-foreground">
            Avtalet är mellan er två. Hyrkoll är inte part i avtalet.
          </p>
          <dl className="grid gap-x-6 gap-y-1 pt-2 text-sm sm:grid-cols-[8rem_1fr]">
            <dt className="font-medium">Uthyrare</dt>
            <dd>{a.owner_name}</dd>
            <dt className="font-medium">Hyresgäst</dt>
            <dd>{a.renter_name}</dd>
          </dl>
        </header>

        <Section title="1. Det som hyrs ut">
          <p className="font-medium">{t?.title ?? "Annonsen finns inte längre"}</p>
          {t?.description && (
            <p className="whitespace-pre-line text-muted-foreground">{t.description}</p>
          )}
          {t?.included && (
            <p className="whitespace-pre-line">
              <span className="font-medium">Det här ingår: </span>
              {t.included}
            </p>
          )}
        </Section>

        <Section title="2. Hyrestid">
          <p>
            {formatDates(a.start_date, a.end_date)} ({a.days} dygn)
          </p>
          <p className="text-muted-foreground">
            Från {fullDate(a.start_date)} till och med {fullDate(a.end_date)}.
          </p>
        </Section>

        <Section title="3. Pris">
          <table className="w-full max-w-sm text-sm">
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

        <Section title="4. Utlämning och återlämning">
          <p>{a.delivery ? "Uthyraren levererar saken." : handover || "Enligt överenskommelse."}</p>
          {t?.city && (
            <p className="text-muted-foreground">
              Plats: {t.area ? `${t.area}, ` : ""}
              {t.city}
            </p>
          )}
          {a.picked_up_at && (
            <p className="text-muted-foreground">Utlämnad {dateTime(a.picked_up_at)}.</p>
          )}
          {a.returned_at && (
            <p className="text-muted-foreground">Återlämnad {dateTime(a.returned_at)}.</p>
          )}
        </Section>

        {t?.rental_rules && (
          <Section title="5. Uthyrarens regler">
            <p className="whitespace-pre-line">{t.rental_rules}</p>
          </Section>
        )}

        <Section title={t?.rental_rules ? "6. Avbokning" : "5. Avbokning"}>
          <p>
            {policy.label}: {policy.text}
          </p>
        </Section>

        <Section title={t?.rental_rules ? "7. Villkor" : "6. Villkor"}>
          <ul className="list-disc space-y-1.5 pl-5">
            {(STANDARD_TERMS[t?.terms_version ?? 1] ?? STANDARD_TERMS[1]!).map((term) => (
              <li key={term}>{term}</li>
            ))}
          </ul>
        </Section>

        <section className="grid gap-4 border-t border-border pt-6 sm:grid-cols-2">
          <Signature role="Uthyrare" name={a.owner_name} agreedAt={a.owner_agreed_at} />
          <Signature role="Hyresgäst" name={a.renter_name} agreedAt={a.renter_agreed_at} />
        </section>

        {canAccept && (
          <div className="space-y-3 rounded-2xl bg-muted/60 p-4 print:hidden">
            <div className="flex items-start gap-2.5">
              <Checkbox
                id="accept-agreement"
                checked={accepted}
                onCheckedChange={(v) => setAccepted(v === true)}
                className="mt-0.5"
              />
              <Label
                htmlFor="accept-agreement"
                className="cursor-pointer text-sm font-normal leading-snug"
              >
                Jag har läst och godkänner avtalet
              </Label>
            </div>
            <Button className="rounded-full" disabled={!accepted || busy} onClick={accept}>
              Godkänn avtalet
            </Button>
          </div>
        )}
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 text-sm leading-relaxed">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function PriceRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <tr className={strong ? "font-semibold" : undefined}>
      <td className="py-1 pr-6">{label}</td>
      <td className="py-1 text-right">{value}</td>
    </tr>
  );
}

function Signature({
  role,
  name,
  agreedAt,
}: {
  role: string;
  name: string;
  agreedAt: string | null;
}) {
  return (
    <div className="space-y-1 text-sm">
      <p className="font-medium">
        {role}: {name}
      </p>
      <p className={agreedAt ? "text-primary" : "text-muted-foreground"}>
        {agreedAt ? `Godkänt ${dateTime(agreedAt)}` : "Inte godkänt än"}
      </p>
    </div>
  );
}
