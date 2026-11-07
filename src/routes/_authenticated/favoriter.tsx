import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bookmark, Heart, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, LoadingCards, Page, PageHeader } from "@/components/layout";
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
  const favorites = favs.flatMap((f) => {
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

  const findSomething = (
    <Button asChild>
      <Link to="/sok" search={DEFAULTS}>
        <Search aria-hidden /> Hitta något att hyra
      </Link>
    </Button>
  );

  return (
    <Page width="wide">
      <PageHeader
        title="Favoriter"
        description="Annonser och sökningar du har sparat. Tryck på hjärtat för att ta bort en annons från favoriterna."
      />

      <section aria-labelledby="sparade-annonser">
        <h2 id="sparade-annonser" className="font-display text-2xl font-bold">
          Sparade annonser
          {favorites.length > 0 && (
            <span className="ml-2 font-sans text-base font-normal tabular-nums text-muted-foreground">
              ({favorites.length})
            </span>
          )}
        </h2>
        <div className="mt-5">
          {isLoading ? (
            <LoadingCards count={3} />
          ) : favs.length === 0 ? (
            <EmptyState icon={Heart} title="Inga sparade annonser än" action={findSomething}>
              Tryck på hjärtat på en annons så hittar du den här.
            </EmptyState>
          ) : (
            <ul className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {favorites.map((f) => (
                <li key={f.id}>
                  <ListingCard result={f.result} />
                </li>
              ))}
            </ul>
          )}
          {gone.length > 0 && (
            <p className="mt-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {gone.length === 1
                ? "1 sparad annons finns inte längre (pausad eller borttagen)."
                : `${gone.length} sparade annonser finns inte längre (pausade eller borttagna).`}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void removeRows("favorites", gone, "Borttaget från favoriter.")}
              >
                Rensa bort
              </Button>
            </p>
          )}
        </div>
      </section>

      <section aria-labelledby="sparade-sokningar" className="mt-16">
        <h2 id="sparade-sokningar" className="font-display text-2xl font-bold">
          Sparade sökningar
        </h2>
        <div className="mt-5">
          {isLoading ? (
            <div className="space-y-3" aria-busy="true" aria-label="Laddar">
              <Skeleton className="h-[72px] rounded-2xl" />
              <Skeleton className="h-[72px] rounded-2xl" />
            </div>
          ) : data?.searches.length === 0 ? (
            <EmptyState
              icon={Bookmark}
              title="Inga sparade sökningar än"
              action={
                <Button variant="outline" asChild>
                  <Link to="/sok" search={DEFAULTS}>
                    Gå till sök
                  </Link>
                </Button>
              }
            >
              Tryck på "Spara sökning" bland sökresultaten så hittar du tillbaka hit.
            </EmptyState>
          ) : (
            <ul className="max-w-3xl divide-y divide-border rounded-2xl border border-border bg-card">
              {(data?.searches ?? []).map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                    <Bookmark className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{s.label}</p>
                    <p className="text-xs text-muted-foreground">
                      Sparad {new Date(s.created_at).toLocaleDateString("sv-SE")}
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link
                      to="/sok"
                      search={
                        validateSearchParams((s.filters ?? {}) as Record<string, unknown>) as never
                      }
                      aria-label={`Visa träffar för ${s.label}`}
                    >
                      Visa träffar
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Ta bort sparad sökning ${s.label}`}
                    onClick={() =>
                      void removeRows("saved_searches", [s.id], "Sökningen är borttagen.")
                    }
                  >
                    Ta bort
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </Page>
  );
}
