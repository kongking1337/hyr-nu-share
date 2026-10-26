import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Flag, Info, MapPin, Truck, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ExampleBadge } from "@/components/ExampleBadge";
import { ListingTypeBadge } from "@/components/ListingTypeBadge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { rowToUnified } from "@/lib/providers/internal";
import { kr, priceLabel } from "@/lib/pricing";

export const Route = createFileRoute("/annons/$id")({
  head: () => ({
    meta: [
      { title: "Annons – Hyrkoll" },
      { name: "description", content: "Se bilder, pris, plats och beskrivning på Hyrkoll." },
      { property: "og:title", content: "Annons – Hyrkoll" },
      { property: "og:description", content: "Köp, sälj och hyr i Stockholm." },
    ],
  }),
  component: ListingPage,
});

function ListingPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();

  const { data: listing, isLoading } = useQuery({
    queryKey: ["listing", id],
    queryFn: async () => {
      const { data: row, error } = await supabase.from("listings").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return row ? rowToUnified(row) : null;
    },
  });

  if (isLoading) return <div className="mx-auto max-w-5xl p-4"><Skeleton className="h-[520px] rounded-3xl" /></div>;
  if (!listing) {
    return (
      <div className="mx-auto max-w-5xl p-10 text-center text-muted-foreground">
        Annonsen finns inte längre. Den kan vara såld, pausad eller borttagen.
      </div>
    );
  }

  const sale = listing.listingType === "sale";
  const counterpart = sale ? "säljaren" : "uthyraren";

  async function report() {
    if (!user) { toast.info("Logga in för att rapportera."); return; }
    const { error } = await supabase.from("reports").insert({
      reporter_id: user.id,
      target_type: "listing",
      target_id: listing!.id,
      reason: "Rapporterad från annonssidan",
    });
    if (error) { toast.error("Rapporten kunde inte skickas. Försök igen."); return; }
    toast.success("Tack, rapporten är skickad till moderering.");
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <img
        src={listing.images[0]}
        alt={listing.title}
        className="aspect-[4/3] w-full rounded-3xl object-cover"
      />

      <div className="mt-6 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              <ListingTypeBadge type={listing.listingType} />
              {listing.example && <ExampleBadge />}
            </div>
            <h1 className="font-display text-3xl font-semibold">{listing.title}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" /> {listing.area ? `${listing.area}, ` : ""}{listing.city}
              </span>
              <span className="flex items-center gap-1">
                <User className="h-4 w-4" /> {listing.ownerType === "company" ? "Företag" : "Privatperson"} · {listing.ownerName}
              </span>
              {listing.publishedAt && (
                <span>Publicerad {new Date(listing.publishedAt).toLocaleDateString("sv-SE")}</span>
              )}
            </div>
          </div>

          <p className="whitespace-pre-line leading-relaxed text-muted-foreground">{listing.description}</p>

          <div className="rounded-3xl border border-border p-5">
            <h2 className="font-display text-lg font-semibold">Bra att veta</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Hyrkoll tar inga avgifter och förmedlar inga betalningar. Betalning
              {sale ? "" : ", eventuell deposition"} och upphämtning kommer du överens om direkt med {counterpart}.
              Träffas gärna på en offentlig plats och betala inte i förskott till någon du inte känner.
            </p>
          </div>

          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={report}>
            <Flag className="mr-1 h-4 w-4" /> Rapportera annons
          </Button>
        </div>

        <aside className="h-fit space-y-3 rounded-3xl border border-border bg-card p-5 lg:sticky lg:top-24">
          <p className="font-display text-2xl font-semibold">{priceLabel(listing)}</p>
          {!sale && (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {listing.priceWeek ? <li>Vecka: {kr(listing.priceWeek)}</li> : null}
              {listing.deposit > 0 && <li>Deposition: {kr(listing.deposit)}</li>}
              {listing.deliveryAvailable && (
                <li className="flex items-center gap-1">
                  <Truck className="h-4 w-4" /> Leverans {listing.deliveryFee > 0 ? `för ${kr(listing.deliveryFee)}` : "ingår"}
                </li>
              )}
            </ul>
          )}
          {listing.example && (
            <p className="flex gap-2 rounded-2xl bg-muted/60 p-3 text-sm text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              Det här är en exempelannons som visar hur sajten fungerar. Den går inte att svara på.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
