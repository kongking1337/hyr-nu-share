import { supabase } from "@/integrations/supabase/client";
import { distanceKm, normalize } from "../geo";
import type { ProviderQuery, RentalProvider, UnifiedResult } from "./types";

export const BRAND = "Hyrkoll";

export function rowToUnified(row: Record<string, unknown>): UnifiedResult {
  const r = row as never as {
    id: string;
    owner_id: string | null;
    listing_type: string;
    price: number | null;
    published_at: string | null;
    created_at: string;
    title: string;
    description: string;
    category_slug: string;
    city: string;
    area: string | null;
    lat: number;
    lng: number;
    images: string[];
    owner_name: string;
    owner_type: "private" | "company";
    rating: number;
    review_count: number;
    booking_count: number;
    price_hour: number | null;
    price_day: number | null;
    price_week: number | null;
    price_month: number | null;
    deposit: number;
    service_fee_pct: number;
    insurance_fee: number;
    delivery_available: boolean;
    delivery_fee: number;
    pickup_available: boolean;
    instant_book: boolean;
    allow_offers?: boolean;
    offer_validity_hours?: number;
  };
  return {
    id: r.id,
    source: { kind: "internal", slug: "hyrkoll", name: BRAND, demo: false },
    listingType: r.listing_type === "sale" ? "sale" : "rent",
    price: r.price == null ? null : Number(r.price),
    title: r.title,
    description: r.description,
    category: r.category_slug,
    city: r.city,
    area: r.area,
    lat: Number(r.lat),
    lng: Number(r.lng),
    images: r.images?.length ? r.images : ["https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=1200"],
    ownerName: r.owner_name,
    ownerType: r.owner_type,
    rating: Number(r.rating),
    reviewCount: r.review_count,
    bookingCount: r.booking_count,
    priceHour: r.price_hour == null ? null : Number(r.price_hour),
    priceDay: Number(r.price_day ?? 0),
    priceWeek: r.price_week == null ? null : Number(r.price_week),
    priceMonth: r.price_month == null ? null : Number(r.price_month),
    deposit: Number(r.deposit),
    serviceFeePct: Number(r.service_fee_pct),
    insuranceFee: Number(r.insurance_fee),
    deliveryAvailable: r.delivery_available,
    deliveryFee: Number(r.delivery_fee),
    pickupAvailable: r.pickup_available,
    instantBook: r.instant_book,
    allowOffers: !!r.allow_offers,
    offerValidityHours: Number(r.offer_validity_hours ?? 24),
    publishedAt: r.published_at ?? r.created_at,
    ownerId: r.owner_id,
    example: r.owner_id == null,
  };
}

export const internalProvider: RentalProvider = {
  slug: "hyrkoll",
  name: BRAND,
  kind: "internal",
  demo: false,
  search: async (q: ProviderQuery) => {
    let query = supabase.from("listings").select("*").eq("status", "published").limit(200);
    if (q.category) query = query.eq("category_slug", q.category);
    const { data, error } = await query;
    if (error) throw error;
    let results = (data ?? []).map(rowToUnified);

    if (q.text) {
      const words = normalize(q.text)
        .split(" ")
        .filter((w) => w.length > 3);
      if (words.length) {
        results = results.filter((r) => {
          const hay = normalize(`${r.title} ${r.description} ${r.category} ${r.city} ${r.area ?? ""}`);
          return words.some((w) => hay.includes(w.slice(0, 5)));
        });
      }
    }
    if (q.lat != null && q.lng != null && q.radiusKm) {
      results = results.filter((r) => distanceKm(q.lat!, q.lng!, r.lat, r.lng) <= q.radiusKm!);
    }
    return results;
  },
};
