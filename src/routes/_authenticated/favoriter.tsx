import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ListingCard } from "@/components/ListingCard";
import { supabase } from "@/integrations/supabase/client";
import { rowToUnified } from "@/lib/providers/internal";
import { DEFAULTS, validateSearchParams } from "@/lib/search/params";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/favoriter")({
  head: () => ({
    meta: [
      { title: "Mina favoriter – Hyrkoll" },
      { name: "description", content: "Sparade annonser och sökningar på Hyrkoll." },
      { property: "og:title", content: "Mina favoriter – Hyrkoll" },
      { property: "og:description", content: "Sparade annonser och sökningar." },
    ],
  }),
  component: FavoritesPage,
});

function FavoritesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["favorites", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [favs, searches] = await Promise.all([
        supabase.from("favorites").select("id, listing_id, listings(*)").eq("user_id", user!.id),
        supabase
          .from("saved_searches")
          .select("*")
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false }),
      ]);
      if (favs.error) throw favs.error;
      if (searches.error) throw searches.error;
      return { favs: favs.data ?? [], searches: searches.data ?? [] };
    },
  });

  // Pausade eller borttagna annonser går inte att läsa längre; de visas inte men kan rensas bort.
  const favs = data?.favs ?? [];
  const visible = favs.flatMap((f) => {
    const row = (f as { listings: Record<string, unknown> | null }).listings;
    return row ? [{ id: f.id, result: rowToUnified(row) }] : [];
  });
  const gone = favs.filter((f) => !(f as { listings: unknown }).listings).map((f) => f.id);

  async function removeRows(table: "favorites" | "saved_searches", ids: string[], done: string) {
    const { error } = await supabase.from(table).delete().in("id", ids);
    if (error) {
      toast.error("Det gick inte att ta bort. Försök igen.");
      return;
    }
    toast.success(done);
    void refetch();
    void queryClient.invalidateQueries({ queryKey: ["favorite-ids"] });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-3xl font-semibold">Favoriter</h1>
      {isLoading && <p className="mt-4 text-sm text-muted-foreground">Hämtar dina favoriter …</p>}
      {visible.length > 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          Tryck på hjärtat för att ta bort en annons från favoriterna.
        </p>
      )}
      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((f) => (
          <ListingCard key={f.id} result={f.result} />
        ))}
      </div>
      {data && favs.length === 0 && (
        <p className="mt-4 text-muted-foreground">
          Inga sparade annonser ännu. Tryck på hjärtat på en annons för att spara den här.{" "}
          <Link to="/sok" search={DEFAULTS} className="text-primary hover:underline">
            Hitta något att hyra
          </Link>
        </p>
      )}
      {gone.length > 0 && (
        <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {gone.length === 1
            ? "1 sparad annons finns inte längre (pausad eller borttagen)."
            : `${gone.length} sparade annonser finns inte längre (pausade eller borttagna).`}
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full"
            onClick={() => void removeRows("favorites", gone, "Borttaget från favoriter.")}
          >
            Rensa bort
          </Button>
        </p>
      )}

      <h2 className="mt-12 font-display text-2xl font-semibold">Sparade sökningar</h2>
      <div className="mt-4 space-y-3">
        {(data?.searches ?? []).map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between gap-3 rounded-3xl border border-border p-4"
          >
            <Link
              to="/sok"
              search={validateSearchParams((s.filters ?? {}) as Record<string, unknown>)}
              className="min-w-0 flex-1 hover:underline"
            >
              <span className="block truncate font-medium">{s.label}</span>
              <span className="block text-xs text-muted-foreground">
                Sparad {new Date(s.created_at).toLocaleDateString("sv-SE")} · Visa resultat →
              </span>
            </Link>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 rounded-full"
              onClick={() => void removeRows("saved_searches", [s.id], "Sökningen är borttagen.")}
            >
              Ta bort
            </Button>
          </div>
        ))}
        {data?.searches.length === 0 && (
          <p className="text-muted-foreground">
            Inga sparade sökningar ännu. Spara en sökning från sökresultaten.
          </p>
        )}
      </div>
    </div>
  );
}
