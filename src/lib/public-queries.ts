import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CITIES } from "@/lib/geo";
import { PUBLIC_STALE_TIME } from "@/lib/listing-cache";
import { photoUrl } from "@/lib/photos";
import { rowToUnified } from "@/lib/providers/internal";

/**
 * Frågorna bakom de offentliga sidorna. Rutternas loaders hämtar dem redan på servern (datan
 * följer med sidans HTML, se dehydrate i src/router.tsx), och komponenterna läser samma fråga
 * med useQuery. Därför ska sidan och loadern alltid använda samma funktion här.
 */

/** De 8 senast upplagda annonserna på startsidan. */
export const homeLatestQuery = () =>
  queryOptions({
    queryKey: ["home-latest"],
    staleTime: PUBLIC_STALE_TIME,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("*")
        .eq("status", "published")
        .eq("listing_type", "rent")
        .in(
          "city",
          CITIES.map((c) => c.name),
        )
        .order("published_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []).map(rowToUnified);
    },
  });

export type CategoryInfo = { count: number; image: string | undefined };

/** Antal annonser och en bild per kategori till startsidans kategorirutor. */
export const homeCategoriesQuery = () =>
  queryOptions({
    queryKey: ["home-categories"],
    staleTime: PUBLIC_STALE_TIME,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("listing_category_summary", {
        _cities: CITIES.map((c) => c.name),
      });
      if (error) throw error;
      // Ett vanligt objekt (inte Map), så att det kan skickas med från servern.
      const byCategory: Record<string, CategoryInfo> = {};
      for (const row of data ?? []) {
        // image är en sökväg i Storage för egna annonser, inte en färdig adress.
        byCategory[row.category_slug] = {
          count: row.listing_count,
          image: row.image ? photoUrl(row.image) : undefined,
        };
      }
      return byCategory;
    },
  });

/**
 * En annons. Servern läser som utloggad, så en ägares egen pausade annons kommer tillbaka som
 * null där; null räknas därför som gammalt direkt och hämtas om i webbläsaren med inloggningen.
 */
export const listingQuery = (id: string) =>
  queryOptions({
    queryKey: ["listing", id],
    staleTime: (query) => (query.state.data ? PUBLIC_STALE_TIME : 0),
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

/** Offentlig profil (namn, betyg, verifiering, svarstid). */
export const publicProfileQuery = (userId: string) =>
  queryOptions({
    queryKey: ["public-profile", userId],
    staleTime: PUBLIC_STALE_TIME,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("public_profile", { _user_id: userId });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

/** Publicerade omdömen om en användare. */
export const publicReviewsQuery = (userId: string) =>
  queryOptions({
    queryKey: ["public-reviews", userId],
    staleTime: PUBLIC_STALE_TIME,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("public_reviews", { _user_id: userId });
      if (error) throw error;
      return data ?? [];
    },
  });

/** En användares publicerade uthyrningsannonser (profilsidan). */
export const profileListingsQuery = (userId: string) =>
  queryOptions({
    queryKey: ["profile-listings", userId],
    staleTime: PUBLIC_STALE_TIME,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("*")
        .eq("owner_id", userId)
        .eq("status", "published")
        .eq("listing_type", "rent")
        .order("published_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(rowToUnified);
    },
  });
