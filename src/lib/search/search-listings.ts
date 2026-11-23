import { keepPreviousData, queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CITIES, normalize } from "@/lib/geo";
import { PUBLIC_STALE_TIME } from "@/lib/listing-cache";
import { PLACEHOLDER_PHOTO, photoUrl } from "@/lib/photos";
import { BRAND, internalProvider } from "@/lib/providers/internal";
import type { UnifiedResult } from "@/lib/providers/types";
import { SUBCATEGORIES, matchesAttrFilter, parseAttrFilter } from "./attributes";
import { filterResults, sortResults } from "./filter-sort";
import type { SearchParams } from "./params";
import { resolveCenter, type Center } from "./useSearchResults";

/** Antal kort per "sida"; "Visa fler" hämtar nästa. */
export const PAGE_SIZE = 12;

/** Med attributfilter (märke, bromsad …) filtreras så här många träffar i webbläsaren. */
const ATTR_CANDIDATES = 500;

export type SearchPage = { results: UnifiedResult[]; total: number };

/** Sökorden som databasen letar efter: normaliserade, längre än 3 tecken, de 5 första tecknen. */
export function searchWords(q: string): string[] {
  return normalize(q)
    .split(" ")
    .filter((w) => w.length > 3)
    .map((w) => w.slice(0, 5));
}

type SearchRow = {
  id: string;
  title: string;
  description: string | null;
  city: string;
  area: string | null;
  lat: number;
  lng: number;
  image: string | null;
  price_day: number | null;
  owner_type: string;
  owner_id: string | null;
  category_slug: string;
  published_at: string;
  min_days: number;
  total_count: number;
};

/** Ett sökresultat som kort. Fält som korten inte visar får neutrala värden. */
function rowToResult(r: SearchRow): UnifiedResult {
  return {
    id: r.id,
    source: { kind: "internal", slug: "hyrkoll", name: BRAND, demo: false },
    listingType: "rent",
    price: null,
    title: r.title,
    description: r.description ?? "",
    category: r.category_slug,
    city: r.city,
    area: r.area,
    lat: Number(r.lat),
    lng: Number(r.lng),
    images: [r.image ? photoUrl(r.image) : PLACEHOLDER_PHOTO],
    ownerName: "",
    ownerType: r.owner_type === "company" ? "company" : "private",
    rating: 0,
    reviewCount: 0,
    bookingCount: 0,
    priceDay: Number(r.price_day ?? 0),
    deposit: 0,
    serviceFeePct: 0,
    insuranceFee: 0,
    deliveryAvailable: false,
    deliveryFee: 0,
    pickupAvailable: true,
    minDays: r.min_days,
    included: "",
    rentalRules: "",
    cancellationPolicy: "moderate",
    instantBook: false,
    publishedAt: r.published_at,
    ownerId: r.owner_id,
    example: r.owner_id == null,
  };
}

/**
 * Den gamla sökningen (de 200 senaste annonserna, filtrerade här). Används bara tills
 * migrationen 20261123120000_search.sql har körts och search_listings finns.
 */
async function legacySearch(params: SearchParams, center: Center): Promise<SearchPage> {
  const results = await internalProvider.search({
    text: params.q,
    category: params.category === "all" ? null : params.category,
    city: center.wholeRegion ? null : center.label,
    ...(center.wholeRegion ? {} : { lat: center.lat, lng: center.lng, radiusKm: params.radius }),
    startDate: params.from || null,
    endDate: params.to || null,
  });
  const sorted = sortResults(filterResults(results, params, center), params, center);
  return { results: sorted.slice(0, params.page * PAGE_SIZE), total: sorted.length };
}

/**
 * Sökresultaten för /sok och /hyra/…: databasen söker, sorterar och delar upp i sidor
 * (search_listings). Loadern hämtar dem redan på servern; sidan läser samma fråga.
 */
export const searchQuery = (params: SearchParams, center: Center) => {
  const attrs = parseAttrFilter(params.attrs);
  const withAttrs = Object.keys(attrs).length > 0;
  const wanted = params.page * PAGE_SIZE;
  const category = params.category === "all" ? null : params.category;
  const sub = category ? SUBCATEGORIES[category]?.find((s) => s.slug === params.sub) : undefined;
  const dates = params.from && params.to && params.to >= params.from;
  return queryOptions({
    queryKey: [
      "search",
      {
        q: params.q,
        category,
        sub: sub?.slug ?? null,
        center: center.wholeRegion ? null : [center.lat, center.lng, params.radius],
        dates: dates ? [params.from, params.to] : null,
        price: [params.priceMin, params.priceMax],
        owner: params.owner,
        attrs: params.attrs,
        sort: params.sort,
        page: params.page,
      },
    ],
    staleTime: PUBLIC_STALE_TIME,
    // Medan nästa resultat hämtas visas de förra, i stället för ett tomt skelett.
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<SearchPage> => {
      const { data, error } = await supabase.rpc("search_listings", {
        _cities: CITIES.map((c) => c.name),
        _words: searchWords(params.q),
        ...(category ? { _category: category } : {}),
        ...(sub ? { _sub_words: sub.words.map(normalize) } : {}),
        ...(center.wholeRegion
          ? {}
          : { _lat: center.lat, _lng: center.lng, _radius_km: params.radius }),
        ...(dates ? { _start: params.from, _end: params.to } : {}),
        ...(params.priceMin ? { _price_min: params.priceMin } : {}),
        ...(params.priceMax ? { _price_max: params.priceMax } : {}),
        ...(params.owner !== "all" ? { _owner_type: params.owner } : {}),
        _sort: params.sort,
        _limit: withAttrs ? ATTR_CANDIDATES : wanted,
        _with_description: withAttrs,
      });
      if (error) {
        // PGRST202: funktionen finns inte än (migrationen har inte körts).
        if (error.code === "PGRST202") return legacySearch(params, center);
        throw error;
      }
      const rows = (data ?? []) as SearchRow[];
      const results = rows.map(rowToResult);
      if (!withAttrs) return { results, total: rows[0]?.total_count ?? 0 };
      const matching = results.filter((r) => matchesAttrFilter(r, attrs));
      return { results: matching.slice(0, wanted), total: matching.length };
    },
  });
};

/** För rutternas loaders: hämtar sökresultaten i förväg (på servern eller vid hovring). */
export function prefetchSearch(queryClient: QueryClient, params: SearchParams) {
  // "Nära mig" kräver webbläsarens position, så den sökningen görs i webbläsaren.
  if (params.location === "nara-mig") return;
  return queryClient.prefetchQuery(searchQuery(params, resolveCenter(params.location, null)));
}
