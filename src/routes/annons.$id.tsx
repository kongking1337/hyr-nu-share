import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Info, MapPin, PackageX, ShieldCheck, Truck } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BookingRequest } from "@/components/BookingRequest";
import { ContactSeller } from "@/components/ContactSeller";
import { ExampleBadge } from "@/components/ExampleBadge";
import { EmptyState, Page } from "@/components/layout";
import { PriceTag } from "@/components/ListingRow";
import { FavoriteButton } from "@/components/FavoriteButton";
import { PhotoGallery } from "@/components/PhotoGallery";
import { ReportDialog } from "@/components/ReportDialog";
import { Stars } from "@/components/Stars";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CANCELLATION_POLICIES } from "@/lib/bookings";
import { rowToUnified } from "@/lib/providers/internal";
import { kr, priceLabel } from "@/lib/pricing";
import { CATEGORY_SYNONYMS } from "@/lib/search-parse";
import { DEFAULTS } from "@/lib/search/params";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/annons/$id")({
  head: () => ({
    meta: [
      { title: "Annons – Hyrkoll" },
      { name: "description", content: "Se bilder, pris, plats och beskrivning på Hyrkoll." },
      { property: "og:title", content: "Annons – Hyrkoll" },
      { property: "og:description", content: "Hyr och hyr ut saker i Stockholm." },
    ],
  }),
  component: ListingPage,
});

function ListingPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();

  const validId = UUID.test(id);
  const {
    data: listing,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["listing", id],
    enabled: validId,
    queryFn: async () => {
      const { data: row, error } = await supabase
        .from("listings")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return row ? rowToUnified(row) : null;
    },
  });

  // Uthyrarens betyg kommer från den offentliga profilen (annonsens egna betygsfält används inte).
  const ownerId = listing && !listing.example ? listing.ownerId : null;
  const { data: owner } = useQuery({
    queryKey: ["public-profile", ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("public_profile", { _user_id: ownerId! });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  if (isLoading) return <ListingSkeleton />;
  if (isError) {
    return (
      <Page width="text">
        <EmptyState
          icon={PackageX}
          title="Annonsen kunde inte hämtas"
          action={<Button onClick={() => void refetch()}>Försök igen</Button>}
        >
          Något gick fel hos oss eller med anslutningen.
        </EmptyState>
      </Page>
    );
  }
  if (!listing) {
    return (
      <Page width="text">
        <EmptyState
          icon={PackageX}
          title="Annonsen finns inte längre"
          action={
            <Button asChild>
              <Link to="/sok" search={DEFAULTS}>
                Sök bland annonserna
              </Link>
            </Button>
          }
        >
          Den kan vara pausad eller borttagen. Det finns säkert något liknande att hyra.
        </EmptyState>
      </Page>
    );
  }

  const sale = listing.listingType === "sale";
  const mine = !!user && user.id === listing.ownerId;
  const counterpart = sale ? "säljaren" : "uthyraren";
  const categoryName = CATEGORY_SYNONYMS[listing.category]?.name;
  const profileLink = !!listing.ownerId && !listing.example;
  // Mobilens fasta knapp leder ner till bokningskortet. Exempelannonser och egna annonser har ingen.
  const mobileAction = listing.example || mine ? null : sale ? "Skicka meddelande" : "Välj datum";

  return (
    <Page width="wide" className="pt-4 sm:pt-6">
      {categoryName && (
        <nav aria-label="Du är här" className="mb-4 text-sm text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-1">
            <li>
              <Link
                to="/sok"
                search={DEFAULTS}
                className="rounded hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Sök
              </Link>
            </li>
            <li aria-hidden>
              <ChevronRight className="h-3.5 w-3.5" />
            </li>
            <li>
              <Link
                to="/sok"
                search={{ ...DEFAULTS, category: listing.category }}
                className="rounded hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {categoryName}
              </Link>
            </li>
          </ol>
        </nav>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-12">
        <div className="min-w-0">
          <PhotoGallery images={listing.images} title={listing.title} />

          <header className="mt-6 space-y-3">
            {listing.example && <ExampleBadge />}
            <div className="flex items-start justify-between gap-3">
              <h1 className="min-w-0 break-words font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
                {listing.title}
              </h1>
              {!mine && (
                <FavoriteButton
                  listingId={listing.id}
                  className="mt-1 shrink-0 border border-border"
                />
              )}
            </div>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin aria-hidden className="h-4 w-4" />
                {listing.area ? `${listing.area}, ` : ""}
                {listing.city}
              </span>
              {listing.publishedAt && (
                <span>
                  Upplagd{" "}
                  {new Date(listing.publishedAt).toLocaleDateString("sv-SE", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              )}
            </p>
          </header>

          <section
            aria-label={sale ? "Säljare" : "Uthyrare"}
            className="relative mt-6 flex items-center gap-4 rounded-2xl border border-border p-4 focus-within:ring-2 focus-within:ring-ring"
          >
            <span
              aria-hidden
              className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-muted font-display text-lg font-bold"
            >
              {listing.ownerName.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">{sale ? "Säljs av" : "Hyrs ut av"}</p>
              <p className="truncate font-semibold">
                {profileLink ? (
                  <Link
                    to="/profil/$id"
                    params={{ id: listing.ownerId! }}
                    className="outline-none after:absolute after:inset-0 after:rounded-2xl hover:underline"
                  >
                    {listing.ownerName}
                  </Link>
                ) : (
                  listing.ownerName
                )}
              </p>
              <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                {listing.ownerType === "company" ? "Företag" : "Privatperson"}
                {!!owner?.review_count && (
                  <span className="flex items-center gap-1">
                    <Stars value={owner.rating ?? 0} />
                    <span>({owner.review_count})</span>
                  </span>
                )}
              </p>
            </div>
            {profileLink && (
              <span className="hidden shrink-0 items-center gap-0.5 text-sm font-semibold sm:flex">
                Visa profil <ChevronRight aria-hidden className="h-4 w-4" />
              </span>
            )}
          </section>

          <Section title="Beskrivning">
            <p className="whitespace-pre-line leading-relaxed">{listing.description}</p>
          </Section>

          {!sale && listing.included && (
            <Section title="Det här ingår">
              <p className="whitespace-pre-line leading-relaxed">{listing.included}</p>
            </Section>
          )}

          {!sale && (
            <Section title="Hyresvillkor">
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
                <dt className="font-semibold">Kortaste hyra</dt>
                <dd className="text-muted-foreground">
                  {listing.minDays === 1 ? "1 dygn" : `${listing.minDays} dygn`}
                </dd>
                <dt className="font-semibold">Upphämtning</dt>
                <dd className="text-muted-foreground">
                  {[
                    listing.pickupAvailable && "Hämtas hos uthyraren",
                    listing.deliveryAvailable &&
                      `${listing.pickupAvailable ? "leverans" : "Leverans"} ${listing.deliveryFee > 0 ? `för ${kr(listing.deliveryFee)}` : "ingår"}`,
                  ]
                    .filter(Boolean)
                    .join(" eller ")}
                </dd>
                <dt className="font-semibold">Deposition</dt>
                <dd className="text-muted-foreground">
                  {listing.deposit > 0
                    ? `${kr(listing.deposit)}, tillbaka när saken lämnas tillbaka`
                    : "Ingen"}
                </dd>
                <dt className="font-semibold">Avbokning</dt>
                <dd className="text-muted-foreground">
                  {CANCELLATION_POLICIES[listing.cancellationPolicy].label}:{" "}
                  {CANCELLATION_POLICIES[listing.cancellationPolicy].text.toLowerCase()}
                </dd>
                {listing.rentalRules && (
                  <>
                    <dt className="font-semibold">Regler</dt>
                    <dd className="whitespace-pre-line text-muted-foreground">
                      {listing.rentalRules}
                    </dd>
                  </>
                )}
              </dl>
            </Section>
          )}

          <div className="mt-8 rounded-2xl bg-muted p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold">
              <ShieldCheck aria-hidden className="h-5 w-5" /> Bra att veta
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {sale
                ? `Hyrkoll tar inga avgifter och förmedlar inga betalningar. Betalning och upphämtning kommer du överens om direkt med ${counterpart}.`
                : "Skicka en förfrågan med de datum du vill hyra. När uthyraren godkänt är dagarna bokade, och ni bestämmer tid och plats under Meddelanden. Hyrkoll tar inga avgifter och förmedlar inga betalningar: hyran och eventuell deposition betalar ni direkt till varandra, t.ex. med Swish när saken hämtas. Fota gärna skicket vid utlämning och återlämning."}{" "}
              Träffas gärna på en offentlig plats och betala inte i förskott till någon du inte
              känner.
            </p>
          </div>

          {!listing.example && (
            <div className="mt-6">
              <ReportDialog targetType="listing" targetId={listing.id} label="Anmäl annons" />
            </div>
          )}
        </div>

        <aside
          id="boka"
          aria-label={sale ? "Kontakta säljaren" : "Boka"}
          className="h-fit scroll-mt-24 rounded-2xl border border-border bg-card p-5 shadow-sm lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:overscroll-contain"
        >
          <div className="space-y-3">
            {sale ? (
              <p className="font-display text-2xl font-bold">{priceLabel(listing)}</p>
            ) : (
              <PriceTag value={listing.priceDay} />
            )}
            {!sale && (listing.priceWeek || listing.deposit > 0 || listing.deliveryAvailable) && (
              <ul className="space-y-1 text-sm text-muted-foreground">
                {listing.priceWeek ? <li>Vecka: {kr(listing.priceWeek)}</li> : null}
                {listing.deposit > 0 && <li>Deposition: {kr(listing.deposit)}</li>}
                {listing.deliveryAvailable && (
                  <li className="flex items-center gap-1">
                    <Truck aria-hidden className="h-4 w-4" /> Leverans{" "}
                    {listing.deliveryFee > 0 ? `för ${kr(listing.deliveryFee)}` : "ingår"}
                  </li>
                )}
              </ul>
            )}
          </div>

          <div className="mt-5 border-t border-border pt-5">
            {listing.example ? (
              <p className="flex gap-2 rounded-xl bg-muted p-3 text-sm text-muted-foreground">
                <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                Det här är en exempelannons som visar hur sajten fungerar. Den går inte att svara
                på.
              </p>
            ) : sale || mine ? (
              <ContactSeller listing={listing} />
            ) : (
              <>
                <BookingRequest listing={listing} />
                <details className="group mt-5 border-t border-border pt-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                    Har du en fråga först? Skicka ett meddelande
                    <ChevronRight
                      aria-hidden
                      className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90"
                    />
                  </summary>
                  <div className="mt-3">
                    <ContactSeller listing={listing} quiet />
                  </div>
                </details>
              </>
            )}
          </div>
        </aside>
      </div>

      {mobileAction && (
        <MobileBookingBar targetId="boka" label={mobileAction}>
          {sale ? (
            <span className="font-display text-lg font-bold">{priceLabel(listing)}</span>
          ) : (
            <PriceTag value={listing.priceDay} />
          )}
        </MobileBookingBar>
      )}
    </Page>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8 border-t border-border pt-8">
      <h2 className="mb-3 font-display text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Fast rad längst ner på mobil och surfplatta med priset och en knapp ner till bokningskortet.
 * Ligger ovanför flikraden (som bara finns under md) och döljs när bokningskortet syns eller
 * redan har passerats.
 */
function MobileBookingBar({
  targetId,
  label,
  children,
}: {
  targetId: string;
  label: string;
  children: ReactNode;
}) {
  const [show, setShow] = useState(true);

  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry) setShow(!entry.isIntersecting && entry.boundingClientRect.top > 0);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [targetId]);

  if (!show) return null;

  return (
    <div className="print:hidden fixed inset-x-0 bottom-[calc(3.875rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-background/95 backdrop-blur md:bottom-0 lg:hidden">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        {children}
        <Button asChild>
          <a href={`#${targetId}`}>{label}</a>
        </Button>
      </div>
    </div>
  );
}

function ListingSkeleton() {
  return (
    <Page width="wide" className="pt-4 sm:pt-6">
      <div aria-busy="true" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-12">
        <p className="sr-only">Hämtar annons …</p>
        <div>
          <Skeleton className="aspect-[4/3] max-h-[520px] w-full rounded-2xl" />
          <Skeleton className="mt-6 h-9 w-3/4" />
          <Skeleton className="mt-3 h-4 w-1/3" />
          <Skeleton className="mt-6 h-20 w-full rounded-2xl" />
          <Skeleton className="mt-8 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-5/6" />
        </div>
        <Skeleton className="hidden h-[420px] rounded-2xl lg:block" />
      </div>
    </Page>
  );
}
