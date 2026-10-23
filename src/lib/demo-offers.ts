/**
 * Demobud så att hela förhandlingsflödet går att prova innan riktiga bud finns.
 * Märks alltid tydligt som demo i gränssnittet.
 */
import type { OfferRow } from "@/lib/offers";

export type DemoOffer = OfferRow & {
  demo: true;
  listingTitle: string;
  listingImage: string;
  counterpartName: string;
  counterpartRating: number;
  counterpartReviews: number;
};

const iso = (hoursFromNow: number) => new Date(Date.now() + hoursFromNow * 3_600_000).toISOString();
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

const base = {
  demo: true as const,
  owner_id: null,
  parent_id: null,
  booking_id: null,
  actor: "renter",
  message: null,
};

/** Bud som andra lagt på dina annonser (uthyrarvyn). */
export const DEMO_INCOMING_OFFERS: DemoOffer[] = [
  {
    ...base,
    id: "demo-in-1",
    listing_id: "demo-1",
    renter_id: "demo-renter-1",
    listingTitle: "Bosch borrhammare GBH 2-28 med tillbehör",
    listingImage: "https://images.unsplash.com/photo-1504148455328-c376907d081c?w=800",
    counterpartName: "Sofia L.",
    counterpartRating: 4.9,
    counterpartReviews: 23,
    start_date: day(3),
    end_date: day(5),
    days: 3,
    list_total: 1050,
    amount: 950,
    status: "active",
    expires_at: iso(9),
    created_at: iso(-3),
    message: "Hej! Kan jag hyra den över helgen för 950 kr totalt?",
  },
  {
    ...base,
    id: "demo-in-2",
    listing_id: "demo-2",
    renter_id: "demo-renter-2",
    listingTitle: "Släpvagn 750 kg, obromsad – Solna",
    listingImage: "https://images.unsplash.com/photo-1519003722824-194d4455a60c?w=800",
    counterpartName: "Anders K.",
    counterpartRating: 4.6,
    counterpartReviews: 8,
    start_date: day(1),
    end_date: day(1),
    days: 1,
    list_total: 450,
    amount: 300,
    status: "active",
    expires_at: iso(2),
    created_at: iso(-1),
    message: "Behöver den bara några timmar på lördag.",
  },
  {
    ...base,
    id: "demo-in-3",
    listing_id: "demo-3",
    renter_id: "demo-renter-3",
    listingTitle: "Kärcher högtryckstvätt K5",
    listingImage: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800",
    counterpartName: "Maria S.",
    counterpartRating: 5,
    counterpartReviews: 41,
    start_date: day(-6),
    end_date: day(-4),
    days: 3,
    list_total: 900,
    amount: 820,
    status: "accepted",
    expires_at: null,
    created_at: iso(-200),
  },
  {
    ...base,
    id: "demo-in-4",
    listing_id: "demo-1",
    renter_id: "demo-renter-4",
    actor: "owner",
    listingTitle: "Bosch borrhammare GBH 2-28 med tillbehör",
    listingImage: "https://images.unsplash.com/photo-1504148455328-c376907d081c?w=800",
    counterpartName: "Johan P.",
    counterpartRating: 4.3,
    counterpartReviews: 5,
    start_date: day(-15),
    end_date: day(-13),
    days: 3,
    list_total: 1050,
    amount: 990,
    status: "accepted",
    expires_at: null,
    created_at: iso(-380),
  },
  {
    ...base,
    id: "demo-in-5",
    listing_id: "demo-2",
    renter_id: "demo-renter-5",
    listingTitle: "Släpvagn 750 kg, obromsad – Solna",
    listingImage: "https://images.unsplash.com/photo-1519003722824-194d4455a60c?w=800",
    counterpartName: "Elin H.",
    counterpartRating: 4.8,
    counterpartReviews: 12,
    start_date: day(-25),
    end_date: day(-24),
    days: 2,
    list_total: 900,
    amount: 600,
    status: "expired",
    expires_at: iso(-400),
    created_at: iso(-420),
  },
];

/** Dina egna bud på andras annonser (hyrestagarvyn). */
export const DEMO_OUTGOING_OFFERS: DemoOffer[] = [
  {
    ...base,
    id: "demo-out-1",
    listing_id: "demo-9",
    renter_id: "demo-me",
    listingTitle: "Partytält 6x12 m inkl. bord och stolar",
    listingImage: "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=800",
    counterpartName: "Eventbolaget AB",
    counterpartRating: 4.7,
    counterpartReviews: 64,
    start_date: day(12),
    end_date: day(14),
    days: 3,
    list_total: 4500,
    amount: 3900,
    status: "active",
    expires_at: iso(5),
    created_at: iso(-6),
    message: "Vi är en förening – går det att landa på 3 900 kr?",
  },
  {
    ...base,
    id: "demo-out-2",
    listing_id: "demo-10",
    renter_id: "demo-me",
    actor: "owner",
    listingTitle: "GoPro HERO12 med tillbehörspaket",
    listingImage: "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=800",
    counterpartName: "Nima R.",
    counterpartRating: 4.9,
    counterpartReviews: 31,
    start_date: day(7),
    end_date: day(9),
    days: 3,
    list_total: 1200,
    amount: 1080,
    status: "active",
    expires_at: iso(11),
    created_at: iso(-2),
    message: "Kan möta dig på 1 080 kr totalt.",
  },
  {
    ...base,
    id: "demo-out-3",
    listing_id: "demo-11",
    renter_id: "demo-me",
    listingTitle: "Kompakt grävmaskin 1,8 ton",
    listingImage: "https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=800",
    counterpartName: "Maskinuthyrning Väst",
    counterpartRating: 4.4,
    counterpartReviews: 19,
    start_date: day(-20),
    end_date: day(-18),
    days: 3,
    list_total: 7800,
    amount: 6200,
    status: "declined",
    expires_at: null,
    created_at: iso(-500),
  },
];

export const DEMO_ALL_OFFERS = [...DEMO_INCOMING_OFFERS, ...DEMO_OUTGOING_OFFERS];
