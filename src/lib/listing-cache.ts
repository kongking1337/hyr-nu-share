import type { QueryClient } from "@tanstack/react-query";

/**
 * Hur länge offentliga annonsuppgifter (startsidan, sökningen, annonser och profiler) visas från
 * minnet innan de hämtas igen. Utan den hämtades allt om vid varje sidbyte och flikbyte.
 */
export const PUBLIC_STALE_TIME = 60_000;

const LISTING_QUERIES = [
  "listing",
  "home-latest",
  "home-categories",
  "search",
  "profile-listings",
  "my-listings",
  "favorites",
];

/**
 * Efter att en annons skapats, ändrats, pausats, tagits bort eller dolts: allt som visar annonser
 * hämtas om nästa gång det visas, så att ändringen syns direkt och inte först efter en minut.
 */
export function invalidateListings(queryClient: QueryClient) {
  return Promise.all(
    LISTING_QUERIES.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
  );
}
