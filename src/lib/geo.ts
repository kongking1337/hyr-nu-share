export type City = { name: string; slug: string; lat: number; lng: number };

/** Hela sökområdet. Hyrkoll startar bara i Stockholms län. */
export const REGION = { slug: "hela-stockholm", name: "Hela Stockholm", lat: 59.3293, lng: 18.0686 };

/** Kommunerna i Stockholms län, med ungefärlig mittpunkt. Annonsens plats sätts till kommunens mittpunkt. */
export const CITIES: City[] = [
  { name: "Stockholm", slug: "stockholm", lat: 59.3293, lng: 18.0686 },
  { name: "Botkyrka", slug: "botkyrka", lat: 59.2, lng: 17.83 },
  { name: "Danderyd", slug: "danderyd", lat: 59.4, lng: 18.03 },
  { name: "Ekerö", slug: "ekero", lat: 59.29, lng: 17.81 },
  { name: "Haninge", slug: "haninge", lat: 59.17, lng: 18.14 },
  { name: "Huddinge", slug: "huddinge", lat: 59.24, lng: 17.98 },
  { name: "Järfälla", slug: "jarfalla", lat: 59.42, lng: 17.83 },
  { name: "Lidingö", slug: "lidingo", lat: 59.37, lng: 18.13 },
  { name: "Nacka", slug: "nacka", lat: 59.31, lng: 18.16 },
  { name: "Norrtälje", slug: "norrtalje", lat: 59.76, lng: 18.7 },
  { name: "Nykvarn", slug: "nykvarn", lat: 59.18, lng: 17.43 },
  { name: "Nynäshamn", slug: "nynashamn", lat: 58.9, lng: 17.95 },
  { name: "Salem", slug: "salem", lat: 59.2, lng: 17.77 },
  { name: "Sigtuna", slug: "sigtuna", lat: 59.62, lng: 17.85 },
  { name: "Sollentuna", slug: "sollentuna", lat: 59.43, lng: 17.95 },
  { name: "Solna", slug: "solna", lat: 59.36, lng: 18.0 },
  { name: "Sundbyberg", slug: "sundbyberg", lat: 59.361, lng: 17.97 },
  { name: "Södertälje", slug: "sodertalje", lat: 59.2, lng: 17.63 },
  { name: "Tyresö", slug: "tyreso", lat: 59.24, lng: 18.23 },
  { name: "Täby", slug: "taby", lat: 59.44, lng: 18.07 },
  { name: "Upplands Väsby", slug: "upplands-vasby", lat: 59.52, lng: 17.91 },
  { name: "Upplands-Bro", slug: "upplands-bro", lat: 59.48, lng: 17.75 },
  { name: "Vallentuna", slug: "vallentuna", lat: 59.53, lng: 18.08 },
  { name: "Vaxholm", slug: "vaxholm", lat: 59.4, lng: 18.35 },
  { name: "Värmdö", slug: "varmdo", lat: 59.33, lng: 18.39 },
  { name: "Österåker", slug: "osteraker", lat: 59.48, lng: 18.3 },
];

/** Ligger annonsens kommun i sökområdet? */
export function inRegion(cityName: string): boolean {
  return CITIES.some((c) => c.name === cityName);
}

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
  // Matcha från ordets början, så att "i Stockholms län" hittar Stockholm men "Salem" inte matchar mitt i ett ord.
  const n = ` ${normalize(text)}`;
  for (const city of CITIES) {
    if (n.includes(` ${normalize(city.name)}`)) return city;
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
