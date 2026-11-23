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
