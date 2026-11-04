import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Info, MapPin, Truck, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BookingRequest } from "@/components/BookingRequest";
import { ContactSeller } from "@/components/ContactSeller";
import { ExampleBadge } from "@/components/ExampleBadge";
import { FavoriteButton } from "@/components/FavoriteButton";
import { PhotoGallery } from "@/components/PhotoGallery";
import { ReportDialog } from "@/components/ReportDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CANCELLATION_POLICIES } from "@/lib/bookings";
import { rowToUnified } from "@/lib/providers/internal";
import { kr, priceLabel } from "@/lib/pricing";
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

  if (isLoading)
    return (
      <div className="mx-auto max-w-5xl p-4">
        <Skeleton className="h-[520px] rounded-3xl" />
      </div>
    );
  if (isError) {
    return (
      <div className="mx-auto max-w-5xl p-10 text-center text-muted-foreground">
        <h1 className="font-display text-2xl font-semibold text-foreground">
          Annonsen kunde inte hämtas
        </h1>
        <p className="mt-2">Något gick fel hos oss eller med anslutningen.</p>
        <Button className="mt-4 rounded-full" onClick={() => void refetch()}>
          Försök igen
        </Button>
      </div>
    );
  }
  if (!listing) {
    return (
      <div className="mx-auto max-w-5xl p-10 text-center text-muted-foreground">
        <h1 className="font-display text-2xl font-semibold text-foreground">
          Annonsen finns inte längre
        </h1>
        <p className="mt-2">Den kan vara pausad eller borttagen.</p>
        <Button asChild variant="outline" className="mt-4 rounded-full">
          <Link to="/sok" search={DEFAULTS}>
            Sök efter något annat
          </Link>
        </Button>
      </div>
    );
  }

  const sale = listing.listingType === "sale";
  const mine = !!user && user.id === listing.ownerId;
  const counterpart = sale ? "säljaren" : "uthyraren";

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <PhotoGallery images={listing.images} title={listing.title} />

      <div className="mt-6 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <div className="space-y-3">
            {listing.example && (
              <div className="flex flex-wrap gap-1.5">
                <ExampleBadge />
              </div>
            )}
            <div className="flex items-start justify-between gap-3">
              <h1 className="min-w-0 break-words font-display text-3xl font-semibold">
                {listing.title}
              </h1>
              {!mine && (
                <FavoriteButton
                  listingId={listing.id}
                  className="mt-1 shrink-0 border border-border"
                />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" /> {listing.area ? `${listing.area}, ` : ""}
                {listing.city}
              </span>
              <span className="flex items-center gap-1">
                <User className="h-4 w-4" />{" "}
                {listing.ownerType === "company" ? "Företag" : "Privatperson"} ·{" "}
                {listing.ownerId && !listing.example ? (
                  <Link
                    to="/profil/$id"
                    params={{ id: listing.ownerId }}
                    className="text-primary hover:underline"
                  >
                    {listing.ownerName}
                  </Link>
                ) : (
                  listing.ownerName
                )}
              </span>
              {listing.publishedAt && (
                <span>Publicerad {new Date(listing.publishedAt).toLocaleDateString("sv-SE")}</span>
              )}
            </div>
          </div>

          <p className="whitespace-pre-line leading-relaxed text-muted-foreground">
            {listing.description}
          </p>

          {!sale && (
            <div className="rounded-3xl border border-border p-5">
              <h2 className="font-display text-lg font-semibold">Hyresvillkor</h2>
              <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
                <dt className="font-medium">Kortaste hyra</dt>
                <dd className="text-muted-foreground">
                  {listing.minDays === 1 ? "1 dygn" : `${listing.minDays} dygn`}
                </dd>
                <dt className="font-medium">Upphämtning</dt>
                <dd className="text-muted-foreground">
                  {[
                    listing.pickupAvailable && "Hämtas hos uthyraren",
                    listing.deliveryAvailable &&
                      `${listing.pickupAvailable ? "leverans" : "Leverans"} ${listing.deliveryFee > 0 ? `för ${kr(listing.deliveryFee)}` : "ingår"}`,
                  ]
                    .filter(Boolean)
                    .join(" eller ")}
                </dd>
                <dt className="font-medium">Deposition</dt>
                <dd className="text-muted-foreground">
                  {listing.deposit > 0
                    ? `${kr(listing.deposit)}, tillbaka när saken lämnas tillbaka`
                    : "Ingen"}
                </dd>
                <dt className="font-medium">Avbokning</dt>
                <dd className="text-muted-foreground">
                  {CANCELLATION_POLICIES[listing.cancellationPolicy].label}:{" "}
                  {CANCELLATION_POLICIES[listing.cancellationPolicy].text.toLowerCase()}
                </dd>
                {listing.included && (
                  <>
                    <dt className="font-medium">Det här ingår</dt>
                    <dd className="whitespace-pre-line text-muted-foreground">
                      {listing.included}
                    </dd>
                  </>
                )}
                {listing.rentalRules && (
                  <>
                    <dt className="font-medium">Regler</dt>
                    <dd className="whitespace-pre-line text-muted-foreground">
                      {listing.rentalRules}
                    </dd>
                  </>
                )}
              </dl>
            </div>
          )}

          <div className="rounded-3xl border border-border p-5">
            <h2 className="font-display text-lg font-semibold">Bra att veta</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {sale
                ? `Hyrkoll tar inga avgifter och förmedlar inga betalningar. Betalning och upphämtning kommer du överens om direkt med ${counterpart}.`
                : "Skicka en förfrågan med de datum du vill hyra. När uthyraren godkänt är dagarna bokade, och ni bestämmer tid och plats under Meddelanden. Hyrkoll tar inga avgifter och förmedlar inga betalningar: hyran och eventuell deposition betalar ni direkt till varandra, t.ex. med Swish när saken hämtas. Fota gärna skicket vid utlämning och återlämning."}{" "}
              Träffas gärna på en offentlig plats och betala inte i förskott till någon du inte
              känner.
            </p>
          </div>

          {!listing.example && (
            <ReportDialog targetType="listing" targetId={listing.id} label="Anmäl annons" />
          )}
        </div>

        <aside className="h-fit space-y-3 rounded-3xl border border-border bg-card p-5 lg:sticky lg:top-24">
          <p className="font-display text-2xl font-semibold">{priceLabel(listing)}</p>
          {!sale && (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {listing.priceWeek ? <li>Vecka: {kr(listing.priceWeek)}</li> : null}
              {listing.deposit > 0 && <li>Deposition: {kr(listing.deposit)}</li>}
              {listing.deliveryAvailable && (
                <li className="flex items-center gap-1">
                  <Truck className="h-4 w-4" /> Leverans{" "}
                  {listing.deliveryFee > 0 ? `för ${kr(listing.deliveryFee)}` : "ingår"}
                </li>
              )}
            </ul>
          )}
          {listing.example ? (
            <p className="flex gap-2 rounded-2xl bg-muted/60 p-3 text-sm text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              Det här är en exempelannons som visar hur sajten fungerar. Den går inte att svara på.
            </p>
          ) : sale || mine ? (
            <ContactSeller listing={listing} />
          ) : (
            <>
              <BookingRequest listing={listing} />
              <details className="group border-t border-border pt-3">
                <summary className="cursor-pointer text-sm font-medium text-primary">
                  Har du en fråga först? Skicka ett meddelande
                </summary>
                <div className="mt-3">
                  <ContactSeller listing={listing} />
                </div>
              </details>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
