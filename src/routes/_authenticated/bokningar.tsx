import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { kr } from "@/lib/pricing";

export const Route = createFileRoute("/_authenticated/bokningar")({
  head: () => ({
    meta: [
      { title: "Mina bokningar – Hyrkoll" },
      { name: "description", content: "Se status, datum, totalpris och avbokningsvillkor för dina hyror." },
      { property: "og:title", content: "Mina bokningar – Hyrkoll" },
      { property: "og:description", content: "Status, datum och totalpris." },
    ],
  }),
  component: BookingsPage,
});

const STATUS: Record<string, string> = {
  requested: "Förfrågan skickad",
  confirmed: "Bekräftad",
  declined: "Nekad",
  cancelled: "Avbokad",
  completed: "Genomförd",
};

function BookingsPage() {
  const { user } = useAuth();
  const { data, refetch } = useQuery({
    queryKey: ["bookings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("bookings")
        .select("*, listings(title, images, city)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  async function cancel(id: string) {
    const { error } = await supabase.from("bookings").update({ status: "cancelled" }).eq("id", id);
    if (error) { toast.error("Kunde inte avboka"); return; }
    toast.success("Bokningen är avbokad");
    refetch();
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="font-display text-3xl font-semibold">Bokningar</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Fri avbokning fram till 48 timmar före start. Bekräftade bokningar blockerar datumen i kalendern.
      </p>
      <div className="mt-6 space-y-3">
        {(data ?? []).map((b) => {
          const l = (b as { listings: { title: string; images: string[]; city: string } | null }).listings;
          return (
            <div key={b.id} className="flex flex-wrap items-center gap-4 rounded-3xl border border-border p-4">
              {l?.images?.[0] && <img src={l.images[0]} alt="" className="h-20 w-24 rounded-2xl object-cover" />}
              <div className="min-w-40 flex-1">
                <p className="font-medium">{l?.title ?? "Annons"}</p>
                <p className="text-xs text-muted-foreground">
                  {b.start_date} – {b.end_date} · {b.days} dygn · {l?.city}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Grundpris {kr(Number(b.base_price))} · avgifter {kr(Number(b.service_fee) + Number(b.insurance_fee))} ·
                  deposition {kr(Number(b.deposit))}
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-lg font-semibold">{kr(Number(b.total_price))}</p>
                <span className="rounded-full bg-muted px-2.5 py-1 text-[11px]">{STATUS[b.status] ?? b.status}</span>
                {(b.message ?? "").includes("bud") && (
                  <span className="ml-1 rounded-full bg-accent/25 px-2.5 py-1 text-[11px]">Pris via bud</span>
                )}
              </div>
              {["requested", "confirmed"].includes(b.status) && (
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => cancel(b.id)}>
                  Avboka
                </Button>
              )}
            </div>
          );
        })}
        {data?.length === 0 && <p className="text-muted-foreground">Du har inga bokningar ännu.</p>}
      </div>
    </div>
  );
}
