import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Gavel, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { OfferCard, type OfferAction, type OfferView } from "@/components/offers/OfferCard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { kr } from "@/lib/pricing";
import { DATA_WEIGHT_NOTE, offerStats, type OfferRow } from "@/lib/offers";
import { DEMO_INCOMING_OFFERS, DEMO_OUTGOING_OFFERS } from "@/lib/demo-offers";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/bud")({
  head: () => ({
    meta: [
      { title: "Mina bud – Hyrkoll" },
      { name: "description", content: "Se, acceptera, neka eller motbjud på prisförslag för dina uthyrningar och hyror." },
      { property: "og:title", content: "Mina bud – Hyrkoll" },
      { property: "og:description", content: "Aktiva och historiska bud för uthyrare och hyrestagare." },
    ],
  }),
  component: OffersPage,
});

type Row = OfferRow & { listings: { title: string; images: string[] } | null };

function OffersPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"owner" | "renter">("owner");

  const { data, refetch } = useQuery({
    queryKey: ["offers", user?.id],
    enabled: !!user,
    queryFn: async () => {
      await supabase.rpc("expire_stale_offers");
      const { data } = await supabase
        .from("offers")
        .select("*, listings(title, images)")
        .order("created_at", { ascending: false });
      return (data ?? []) as unknown as Row[];
    },
  });

  const rows = data ?? [];
  const asOwner = rows.filter((o) => o.owner_id === user?.id);
  const asRenter = rows.filter((o) => o.renter_id === user?.id);

  const toView = (o: Row): OfferView => ({
    ...o,
    listingTitle: o.listings?.title ?? "Annons",
    ...(o.listings?.images?.[0] ? { listingImage: o.listings.images[0] } : {}),
  });

  const list: OfferView[] = tab === "owner" ? asOwner.map(toView) : asRenter.map(toView);
  const demo: OfferView[] = tab === "owner" ? DEMO_INCOMING_OFFERS : DEMO_OUTGOING_OFFERS;
  const showDemo = list.length === 0;
  const shown = showDemo ? demo : list;

  const stats = offerStats(
    (showDemo ? demo : list).map((o) => o as OfferRow),
  );

  async function respond(id: string, action: OfferAction, amount?: number) {
    if (id.startsWith("demo-")) {
      toast.info("Det här är ett demobud – prova hela flödet på en riktig annons som tar emot bud.");
      return;
    }
    const { error } = await supabase.rpc("respond_offer", {
      _offer_id: id,
      _action: action,
      ...(amount ? { _amount: amount } : {}),
    });
    if (error) {
      toast.error("Åtgärden kunde inte genomföras.");
      return;
    }
    toast.success(action === "accept" ? "Bud accepterat – bokningen är skapad och datumen blockerade." : "Uppdaterat.");
    refetch();
  }

  const open = shown.filter((o) => o.status === "active");
  const history = shown.filter((o) => o.status !== "active");

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="flex items-center gap-2 font-display text-3xl font-semibold">
        <Gavel className="h-7 w-7 text-primary" /> Mina bud
      </h1>
      <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4" /> Budförhandlingar är privata mellan dig och motparten. Dolt minimipris och
        automatisk acceptgräns visas aldrig för någon annan.
      </p>

      <div className="mt-6 flex gap-2">
        {(["owner", "renter"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition-colors",
              tab === t ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70",
            )}
          >
            {t === "owner" ? "Bud på mina annonser" : "Mina egna bud"}
          </button>
        ))}
      </div>

      {showDemo && (
        <p className="mt-4 rounded-2xl bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
          Du har inga {tab === "owner" ? "inkomna" : "egna"} bud ännu – nedan visas demobud så att du kan se hur flödet ser ut.
        </p>
      )}

      <section className="mt-6 space-y-3">
        <h2 className="font-display text-lg font-semibold">Aktiva ({open.length})</h2>
        {open.length === 0 && <p className="text-sm text-muted-foreground">Inga aktiva bud just nu.</p>}
        {open.map((o) => (
          <OfferCard
            key={o.id}
            offer={o}
            role={tab}
            showAssessment={tab === "owner"}
            marketTotal={Number(o.list_total) * 0.92}
            onAction={(a, amt) => respond(o.id, a, amt)}
          />
        ))}
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-lg font-semibold">Historik ({history.length})</h2>
        {history.length === 0 && <p className="text-sm text-muted-foreground">Ingen budhistorik ännu.</p>}
        {history.map((o) => (
          <OfferCard key={o.id} offer={o} role={tab} />
        ))}
      </section>

      <section className="mt-8 rounded-3xl border border-border p-5">
        <h2 className="font-display text-lg font-semibold">Budstatistik (aggregerad)</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Snitt accepterat pris" value={kr(stats.avgAccepted)} />
          <Stat label="Snitt utgångsbud" value={kr(stats.avgStart)} />
          <Stat label="Snittrabatt" value={`${stats.avgDiscountPct} %`} />
          <Stat label="Andel accepterade bud" value={`${stats.acceptRate} %`} />
          <Stat label="Accepterade motbud" value={`${stats.counterAcceptRate} %`} />
          <Stat label="Underlag" value={`${stats.sample} bud`} />
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">{DATA_WEIGHT_NOTE}</p>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-muted/60 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-display text-lg font-semibold">{value}</p>
    </div>
  );
}
