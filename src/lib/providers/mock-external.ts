import { CITIES, distanceKm, normalize } from "../geo";
import type { ProviderQuery, RentalProvider, UnifiedResult } from "./types";

type Seed = {
  slug: string;
  name: string;
  host: string;
  items: Array<{
    title: string;
    category: string;
    city: string;
    priceDay: number;
    priceHour?: number;
    priceWeek?: number;
    deposit: number;
    delivery?: boolean;
    deliveryFee?: number;
    rating: number;
    reviews: number;
    image: string;
    ownerType?: "private" | "company";
  }>;
};

const SEEDS: Seed[] = [
  {
    slug: "nordhyra",
    name: "Nordhyra",
    host: "nordhyra.example.se",
    items: [
      { title: "Släpvagn 750 kg – dygnshyra", category: "slapvagn", city: "Stockholm", priceDay: 249, priceWeek: 1190, deposit: 1000, delivery: true, deliveryFee: 200, rating: 4.3, reviews: 210, image: "https://images.unsplash.com/photo-1533387520709-752d83de3630?w=1200", ownerType: "company" },
      { title: "Högtryckstvätt proffs 180 bar", category: "verktyg", city: "Solna", priceDay: 189, priceHour: 45, deposit: 500, rating: 4.1, reviews: 96, image: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=1200", ownerType: "company" },
      { title: "Systemkamera Canon R6 + objektiv", category: "kamera", city: "Göteborg", priceDay: 610, deposit: 4000, rating: 4.5, reviews: 42, image: "https://images.unsplash.com/photo-1516724562728-afc824a36e84?w=1200", ownerType: "company" },
      { title: "Partytält 4x6 m med golv", category: "fest", city: "Uppsala", priceDay: 1100, deposit: 2500, delivery: true, deliveryFee: 700, rating: 4.0, reviews: 58, image: "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=1200", ownerType: "company" },
    ],
  },
  {
    slug: "maskinpoolen",
    name: "Maskinpoolen Syd",
    host: "maskinpoolen.example.se",
    items: [
      { title: "Jordfräs 6,5 hk", category: "tradgard", city: "Malmö", priceDay: 349, priceWeek: 1490, deposit: 1500, rating: 4.2, reviews: 33, image: "https://images.unsplash.com/photo-1591857177580-dc82b9ac4e1e?w=1200", ownerType: "company" },
      { title: "Betongblandare 160 l", category: "bygg", city: "Lund", priceDay: 299, deposit: 1200, delivery: true, deliveryFee: 250, rating: 3.9, reviews: 27, image: "https://images.unsplash.com/photo-1590674899484-d5640e854abe?w=1200", ownerType: "company" },
      { title: "Släpvagn bromsad 1300 kg", category: "slapvagn", city: "Göteborg", priceDay: 395, priceWeek: 1790, deposit: 2000, rating: 4.4, reviews: 145, image: "https://images.unsplash.com/photo-1591768575198-88dac53fbd0a?w=1200", ownerType: "company" },
    ],
  },
  {
    slug: "grannlan",
    name: "Grannlån",
    host: "grannlan.example.se",
    items: [
      { title: "Borrhammare Makita (granne i Solna)", category: "verktyg", city: "Solna", priceDay: 110, priceHour: 30, deposit: 300, rating: 4.8, reviews: 19, image: "https://images.unsplash.com/photo-1426927308491-6380b6a9936f?w=1200", ownerType: "private" },
      { title: "Kajak 1-sits", category: "fritid", city: "Stockholm", priceDay: 260, deposit: 1000, rating: 4.6, reviews: 24, image: "https://images.unsplash.com/photo-1502680390469-be75c86b636f?w=1200", ownerType: "private" },
      { title: "Högtryckstvätt Kärcher K4", category: "verktyg", city: "Stockholm", priceDay: 149, deposit: 400, rating: 4.7, reviews: 51, image: "https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?w=1200", ownerType: "private" },
    ],
  },
  {
    slug: "citytrailer",
    name: "CityTrailer",
    host: "citytrailer.example.se",
    items: [
      { title: "Släpkärra 500 kg centralt", category: "slapvagn", city: "Göteborg", priceDay: 219, priceHour: 55, deposit: 800, rating: 3.8, reviews: 77, image: "https://images.unsplash.com/photo-1600661653561-629509216228?w=1200", ownerType: "company" },
      { title: "Flyttsläp med kåpa", category: "slapvagn", city: "Malmö", priceDay: 429, deposit: 1800, delivery: true, deliveryFee: 300, rating: 4.0, reviews: 39, image: "https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=1200", ownerType: "company" },
    ],
  },
];

function toUnified(seed: Seed, item: Seed["items"][number], i: number): UnifiedResult {
  const city = CITIES.find((c) => c.name === item.city) ?? CITIES[0]!;
  return {
    id: `${seed.slug}-${i}`,
    source: { kind: "external", slug: seed.slug, name: seed.name, demo: true },
    title: item.title,
    description:
      "Detta är ett demoresultat från en extern källa. Priser och tillgänglighet är exempeldata tills en officiell integration är på plats.",
    category: item.category,
    city: item.city,
    area: null,
    lat: city.lat + (i % 3) * 0.01,
    lng: city.lng + (i % 4) * 0.01,
    images: [item.image],
    ownerName: seed.name,
    ownerType: item.ownerType ?? "company",
    rating: item.rating,
    reviewCount: item.reviews,
    bookingCount: item.reviews * 2,
    priceHour: item.priceHour ?? null,
    priceDay: item.priceDay,
    priceWeek: item.priceWeek ?? null,
    priceMonth: null,
    deposit: item.deposit,
    serviceFeePct: 0,
    insuranceFee: 0,
    deliveryAvailable: !!item.delivery,
    deliveryFee: item.deliveryFee ?? 0,
    pickupAvailable: true,
    instantBook: false,
    externalUrl: `https://${seed.host}/erbjudande/${seed.slug}-${i}`,
  };
}

function matches(r: UnifiedResult, q: ProviderQuery): boolean {
  if (q.category && r.category !== q.category) return false;
  if (q.text) {
    const n = normalize(q.text);
    const hay = normalize(`${r.title} ${r.category} ${r.city}`);
    const words = n.split(" ").filter((w) => w.length > 3);
    if (words.length && !words.some((w) => hay.includes(w.slice(0, 5)))) return false;
  }
  if (q.lat != null && q.lng != null && q.radiusKm) {
    if (distanceKm(q.lat, q.lng, r.lat, r.lng) > q.radiusKm) return false;
  }
  return true;
}

/** Mock-connectors. Byts ut mot officiella API:er, feeds eller affiliate-flöden. */
export const externalProviders: RentalProvider[] = SEEDS.map((seed) => ({
  slug: seed.slug,
  name: seed.name,
  kind: "external" as const,
  demo: true,
  search: async (q: ProviderQuery) => {
    await new Promise((r) => setTimeout(r, 120));
    return seed.items.map((item, i) => toUnified(seed, item, i)).filter((r) => matches(r, q));
  },
}));
