import { useQueries } from "@tanstack/react-query";
import { providers } from "@/lib/providers";
import type { UnifiedResult } from "@/lib/providers/types";
import type { SearchParams } from "./params";
import { CITIES, cityBySlug } from "@/lib/geo";

export type Center = { lat: number; lng: number; label: string; nationwide: boolean };

export const LOCATIONS = [
  { slug: "hela-sverige", name: "Hela Sverige" },
  ...CITIES.map((c) => ({ slug: c.slug, name: c.name })),
];

export function resolveCenter(slug: string, myPos?: { lat: number; lng: number } | null): Center {
  if (slug === "nara-mig" && myPos) return { ...myPos, label: "Nära mig", nationwide: false };
  const city = cityBySlug(slug);
  if (city) return { lat: city.lat, lng: city.lng, label: city.name, nationwide: false };
  return { lat: 62.0, lng: 15.0, label: "Hela Sverige", nationwide: true };
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
      queryKey: ["search", p.slug, params.q, params.category, center.label, center.nationwide ? 0 : params.radius],
      queryFn: () =>
        p.search({
          text: params.q,
          category: params.category === "all" ? null : params.category,
          city: center.nationwide ? null : center.label,
          ...(center.nationwide ? {} : { lat: center.lat, lng: center.lng, radiusKm: params.radius }),
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
