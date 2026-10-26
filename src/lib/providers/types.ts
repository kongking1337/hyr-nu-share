/**
 * Gemensamt internt resultatformat.
 *
 * Alla källor – egna annonser i databasen såväl som externa connectors –
 * normaliseras till UnifiedResult innan de jämförs eller sorteras.
 * Nya källor implementerar bara `RentalProvider` nedan.
 */
export type SourceKind = "internal" | "external";

export type ResultSource = {
  kind: SourceKind;
  /** t.ex. "hyrkoll" eller "nordhyra" */
  slug: string;
  /** Visningsnamn, används i "På Hyrkoll" / "Från extern webbplats" */
  name: string;
  /** Sant för mockdata som inte kommer från ett skarpt API */
  demo: boolean;
};

export type UnifiedResult = {
  id: string;
  source: ResultSource;
  title: string;
  description: string;
  category: string;
  city: string;
  area?: string | null;
  lat: number;
  lng: number;
  images: string[];
  ownerName: string;
  ownerType: "private" | "company";
  rating: number;
  reviewCount: number;
  bookingCount: number;
  priceHour?: number | null;
  priceDay: number;
  priceWeek?: number | null;
  priceMonth?: number | null;
  deposit: number;
  serviceFeePct: number;
  insuranceFee: number;
  deliveryAvailable: boolean;
  deliveryFee: number;
  pickupAvailable: boolean;
  instantBook: boolean;
  /** Interna annonser: uthyraren tar emot prisförslag/bud */
  allowOffers?: boolean;
  /** Timmar ett bud är giltigt (0 = ingen tidsgräns) */
  offerValidityHours?: number;
  /** När annonsen publicerades (ISO-datum) */
  publishedAt?: string | null;
  /** Exempelannons utan riktig ägare (demodata) – kan inte bokas, budas på eller kontaktas */
  example?: boolean;
  /** Endast externa resultat: länk till erbjudandet hos källan */
  externalUrl?: string;
  availableFrom?: string | null;
};

export type ProviderQuery = {
  text: string;
  category?: string | null;
  city?: string | null;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  startDate?: string | null;
  endDate?: string | null;
};

export type RentalProvider = {
  slug: string;
  name: string;
  kind: SourceKind;
  /** true = mockdata, byts ut mot officiellt API/feed/affiliate-flöde senare */
  demo: boolean;
  search: (q: ProviderQuery) => Promise<UnifiedResult[]>;
};
