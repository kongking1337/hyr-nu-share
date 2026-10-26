import { useQueries } from "@tanstack/react-query";
import { providers } from "@/lib/providers";
import type { UnifiedResult } from "@/lib/providers/types";
import type { SearchParams } from "./params";
import { CITIES, REGION, cityBySlug } from "@/lib/geo";

/** wholeRegion = sök i hela Stockholms län utan avståndsgräns. */
export type Center = { lat: number; lng: number; label: string; wholeRegion: boolean };

export const LOCATIONS = [
  { slug: REGION.slug, name: REGION.name },
  { slug: "nara-mig", name: "Nära mig" },
  ...CITIES.map((c) => ({ slug: c.slug, name: c.name })),
];

export function resolveCenter(slug: string, myPos?: { lat: number; lng: number } | null): Center {
  if (slug === "nara-mig" && myPos) return { ...myPos, label: "Nära mig", wholeRegion: false };
  const city = cityBySlug(slug);
  if (city) return { lat: city.lat, lng: city.lng, label: city.name, wholeRegion: false };
  return { lat: REGION.lat, lng: REGION.lng, label: REGION.name, wholeRegion: true };
}

export type SourceState = {
  slug: string;
  name: string;
  kind: "internal" | "external";
  demo: boolean;
  status: "loading" | "ok" | "error";
  count: number;
};

/**
 * Kör varje källa som en egen query så att egna annonser visas direkt
 * medan externa mock-providers fylls på (och kan fela var för sig).
 */
export function useSearchResults(params: SearchParams, center: Center) {
  const selected = providers.filter((p) => {
    if (params.source === "all") return true;
    if (params.source === "internal") return p.kind === "internal";
    if (params.source === "external") return p.kind === "external";
    return p.slug === params.source;
  });

  const queries = useQueries({
    queries: selected.map((p) => ({
      queryKey: ["search", p.slug, params.q, params.category, center.label, center.wholeRegion ? 0 : params.radius],
      queryFn: () =>
        p.search({
          text: params.q,
          category: params.category === "all" ? null : params.category,
          city: center.wholeRegion ? null : center.label,
          ...(center.wholeRegion ? {} : { lat: center.lat, lng: center.lng, radiusKm: params.radius }),
          startDate: params.from || null,
          endDate: params.to || null,
        }),
      staleTime: 60_000,
      retry: 1,
    })),
  });

  const results: UnifiedResult[] = [];
  const sources: SourceState[] = [];
  queries.forEach((res, i) => {
    const p = selected[i]!;
    if (res.data) results.push(...res.data);
    sources.push({
      slug: p.slug,
      name: p.name,
      kind: p.kind,
      demo: p.demo,
      status: res.isPending ? "loading" : res.isError ? "error" : "ok",
      count: res.data?.length ?? 0,
    });
  });

  const internalLoading = queries[0]?.isPending ?? false;
  return {
    results,
    sources,
    isLoading: queries.every((q) => q.isPending),
    internalLoading,
    externalLoading: sources.some((s) => s.kind === "external" && s.status === "loading"),
  };
}
