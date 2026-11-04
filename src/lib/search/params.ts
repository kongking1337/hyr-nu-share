import { CITIES, REGION } from "@/lib/geo";

/**
 * Delbar URL-modell för /sok.
 * Exempel: /sok?q=slapvagn&location=solna&radius=10&priceMax=500&sort=price
 */
export type SortKey =
  | "recommended"
  | "price"
  | "total"
  | "price_desc"
  | "distance"
  | "newest"
  | "rating"
  | "popular";

export const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "recommended", label: "Rekommenderat" },
  { value: "price", label: "Lägst pris" },
  { value: "price_desc", label: "Högst pris" },
  { value: "distance", label: "Närmast" },
  { value: "newest", label: "Nyast" },
];

// "rating" och "popular" byggde på påhittade betyg och bokningar, och "total" på hyresperioden.
// Gamla länkar med dem får standardsorteringen.
const sortKey = (v: string): SortKey =>
  SORT_OPTIONS.some((o) => o.value === v) ? (v as SortKey) : "recommended";

export type PriceBase = "hour" | "day" | "week" | "month" | "total";

export const PRICE_BASES: Array<{ value: PriceBase; label: string }> = [
  { value: "day", label: "Per dygn" },
  { value: "hour", label: "Per timme" },
  { value: "week", label: "Per vecka" },
  { value: "month", label: "Per månad" },
  { value: "total", label: "Totalpris" },
];

export const RADIUS_OPTIONS = [5, 10, 25, 50];

const LOCATION_SLUGS = new Set([REGION.slug, "nara-mig", ...CITIES.map((c) => c.slug)]);

export type SearchParams = {
  q: string;
  location: string;
  radius: number;
  category: string;
  sub: string;
  from: string;
  to: string;
  priceMin: number;
  priceMax: number;
  priceBase: PriceBase;
  owner: "all" | "private" | "company";
  delivery: "all" | "delivery" | "pickup";
  source: string;
  rating: number;
  booking: "all" | "instant" | "request";
  verified: boolean;
  noDeposit: boolean;
  insurance: boolean;
  availableToday: boolean;
  sort: SortKey;
  view: "grid" | "list" | "map";
  page: number;
  attrs: string;
};

export const DEFAULTS: SearchParams = {
  q: "",
  location: REGION.slug,
  radius: 25,
  category: "all",
  sub: "all",
  from: "",
  to: "",
  priceMin: 0,
  priceMax: 0,
  priceBase: "day",
  owner: "all",
  delivery: "all",
  source: "all",
  rating: 0,
  booking: "all",
  verified: false,
  noDeposit: false,
  insurance: false,
  availableToday: false,
  sort: "recommended",
  view: "grid",
  page: 1,
  attrs: "",
};

const str = (v: unknown, d: string) => (typeof v === "string" && v !== "" ? v : d);
const num = (v: unknown, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], d: T): T =>
  allowed.includes(v as T) ? (v as T) : d;
const bool = (v: unknown, d: boolean) => (v === true || v === "true" ? true : v === false || v === "false" ? false : d);

/** "ÅÅÅÅ-MM-DD" som är ett riktigt datum, annars tomt (handskrivna länkar gav "NaN undefined"). */
const isoDate = (v: unknown): string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : "";

export function validateSearchParams(search: Partial<Record<keyof SearchParams, unknown>>): SearchParams {
  const from = isoDate(search["from"]);
  const to = isoDate(search["to"]);
  return {
    q: str(search["q"], DEFAULTS.q),
    // Okända platser (t.ex. gamla länkar till Göteborg) blir hela Stockholm.
    location: oneOf(search["location"], [...LOCATION_SLUGS], DEFAULTS.location),
    radius: num(search["radius"], DEFAULTS.radius),
    category: str(search["category"], DEFAULTS.category),
    sub: str(search["sub"], DEFAULTS.sub),
    // Bara hela perioder: ett datum ensamt eller ett slut före starten används inte.
    from: from && to && to >= from ? from : DEFAULTS.from,
    to: from && to && to >= from ? to : DEFAULTS.to,
    priceMin: num(search["priceMin"], DEFAULTS.priceMin),
    priceMax: num(search["priceMax"], DEFAULTS.priceMax),
    priceBase: str(search["priceBase"], DEFAULTS.priceBase) as PriceBase,
    owner: str(search["owner"], DEFAULTS.owner) as SearchParams["owner"],
    delivery: str(search["delivery"], DEFAULTS.delivery) as SearchParams["delivery"],
    source: str(search["source"], DEFAULTS.source),
    rating: num(search["rating"], DEFAULTS.rating),
    booking: str(search["booking"], DEFAULTS.booking) as SearchParams["booking"],
    verified: bool(search["verified"], DEFAULTS.verified),
    noDeposit: bool(search["noDeposit"], DEFAULTS.noDeposit),
    insurance: bool(search["insurance"], DEFAULTS.insurance),
    availableToday: bool(search["availableToday"], DEFAULTS.availableToday),
    sort: sortKey(str(search["sort"], DEFAULTS.sort)),
    view: str(search["view"], DEFAULTS.view) as SearchParams["view"],
    page: Math.max(1, num(search["page"], DEFAULTS.page)),
    attrs: str(search["attrs"], DEFAULTS.attrs),
  };
}

/** Tar bort defaultvärden så URL:en förblir kort och läsbar. */
export function cleanParams(p: Partial<SearchParams>): Partial<SearchParams> {
  const out: Record<string, unknown> = {};
  (Object.keys(DEFAULTS) as Array<keyof SearchParams>).forEach((k) => {
    const v = p[k];
    if (v === undefined) return;
    if (v === DEFAULTS[k]) return;
    out[k] = v;
  });
  return out as Partial<SearchParams>;
}
