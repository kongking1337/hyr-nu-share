import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLoginPrompt } from "@/hooks/useLoginPrompt";
import { cn } from "@/lib/utils";

/** Id:n för annonserna som den inloggade har sparat. En fråga delas av alla hjärtan på sidan. */
export function useFavoriteIds() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["favorite-ids", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("favorites").select("listing_id").eq("user_id", user!.id);
      if (error) throw error;
      return new Set((data ?? []).map((f) => f.listing_id));
    },
  });
}

/** Hjärtat på annonser: sparar eller tar bort en favorit. Fyllt hjärta = sparad. */
export function FavoriteButton({ listingId, className }: { listingId: string; className?: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: ids } = useFavoriteIds();
  const loginPrompt = useLoginPrompt();
  const [busy, setBusy] = useState(false);
  const saved = !!ids?.has(listingId);

  async function toggle() {
    if (!user) {
      loginPrompt("Logga in för att spara favoriter.");
      return;
    }
    setBusy(true);
    const { error } = saved
      ? await supabase.from("favorites").delete().eq("user_id", user.id).eq("listing_id", listingId)
      : await supabase.from("favorites").upsert(
          { user_id: user.id, listing_id: listingId },
          { onConflict: "user_id,listing_id", ignoreDuplicates: true },
        );
    setBusy(false);
    if (error) {
      toast.error(saved ? "Favoriten kunde inte tas bort. Försök igen." : "Favoriten kunde inte sparas. Försök igen.");
      return;
    }
    toast.success(saved ? "Borttagen från favoriter" : "Sparad i favoriter");
    void queryClient.invalidateQueries({ queryKey: ["favorite-ids"] });
    void queryClient.invalidateQueries({ queryKey: ["favorites"] });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={saved}
      aria-label={saved ? "Ta bort från favoriter" : "Spara som favorit"}
      title={saved ? "Ta bort från favoriter" : "Spara som favorit"}
      className={cn(
        "grid h-9 w-9 place-items-center rounded-full bg-background/90 backdrop-blur hover:bg-background disabled:opacity-60",
        className,
      )}
    >
      <Heart className={cn("h-4 w-4", saved && "fill-primary text-primary")} />
    </button>
  );
}
