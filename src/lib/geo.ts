export type City = { name: string; slug: string; lat: number; lng: number };

export const CITIES: City[] = [
  { name: "Stockholm", slug: "stockholm", lat: 59.3293, lng: 18.0686 },
  { name: "Solna", slug: "solna", lat: 59.36, lng: 18.0 },
  { name: "Sundbyberg", slug: "sundbyberg", lat: 59.361, lng: 17.97 },
  { name: "Nacka", slug: "nacka", lat: 59.31, lng: 18.16 },
  { name: "Göteborg", slug: "goteborg", lat: 57.7089, lng: 11.9746 },
  { name: "Malmö", slug: "malmo", lat: 55.605, lng: 13.0038 },
  { name: "Lund", slug: "lund", lat: 55.7047, lng: 13.191 },
  { name: "Uppsala", slug: "uppsala", lat: 59.8586, lng: 17.6389 },
  { name: "Linköping", slug: "linkoping", lat: 58.4109, lng: 15.6216 },
  { name: "Västerås", slug: "vasteras", lat: 59.6099, lng: 16.5448 },
  { name: "Örebro", slug: "orebro", lat: 59.2741, lng: 15.2066 },
  { name: "Helsingborg", slug: "helsingborg", lat: 56.0465, lng: 12.6945 },
];

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replaceAll("å", "a")
    .replaceAll("ä", "a")
    .replaceAll("ö", "o")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findCity(text: string): City | null {
  const n = normalize(text);
  for (const city of CITIES) {
    if (n.includes(normalize(city.name)) || n.includes(city.slug)) return city;
  }
  return null;
}

export function cityBySlug(slug: string): City | null {
  return CITIES.find((c) => c.slug === slug) ?? null;
}

/** Distance in km between two coordinates (haversine). */
export function distanceKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}
