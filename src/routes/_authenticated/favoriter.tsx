import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ListingCard } from "@/components/ListingCard";
import { supabase } from "@/integrations/supabase/client";
import { rowToUnified } from "@/lib/providers/internal";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/favoriter")({
  head: () => ({
    meta: [
      { title: "Mina favoriter – Hyrkoll" },
      { name: "description", content: "Sparade annonser och sökbevakningar på Hyrkoll." },
      { property: "og:title", content: "Mina favoriter – Hyrkoll" },
      { property: "og:description", content: "Sparade annonser och bevakningar." },
    ],
  }),
  component: FavoritesPage,
});

function FavoritesPage() {
  const { user } = useAuth();

  const { data, refetch } = useQuery({
    queryKey: ["favorites", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [{ data: favs }, { data: searches }] = await Promise.all([
        supabase.from("favorites").select("id, listing_id, listings(*)").eq("user_id", user!.id),
        supabase.from("saved_searches").select("*").eq("user_id", user!.id),
      ]);
      return { favs: favs ?? [], searches: searches ?? [] };
    },
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-3xl font-semibold">Favoriter</h1>
      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {(data?.favs ?? []).map((f) => {
          const row = (f as { listings: Record<string, unknown> | null }).listings;
          if (!row) return null;
          return <ListingCard key={f.id} result={rowToUnified(row)} days={2} />;
        })}
      </div>
      {data?.favs.length === 0 && <p className="mt-4 text-muted-foreground">Inga sparade annonser ännu.</p>}

      <h2 className="mt-12 font-display text-2xl font-semibold">Sökbevakningar</h2>
      <div className="mt-4 space-y-3">
        {(data?.searches ?? []).map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded-3xl border border-border p-4">
            <div>
              <p className="font-medium">{s.label}</p>
              <p className="text-xs text-muted-foreground">
                {s.notify ? "Notiser på" : "Notiser av"} · sparad {new Date(s.created_at).toLocaleDateString("sv-SE")}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={async () => {
                await supabase.from("saved_searches").delete().eq("id", s.id);
                refetch();
              }}
            >
              Ta bort
            </Button>
          </div>
        ))}
        {data?.searches.length === 0 && <p className="text-muted-foreground">Inga bevakningar ännu.</p>}
      </div>
    </div>
  );
}
