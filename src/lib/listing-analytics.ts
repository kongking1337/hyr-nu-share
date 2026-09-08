/**
 * Demostatistik för uthyrardashboarden.
 *
 * Plattformen har ännu ingen händelselogg för visningar/klick. Tills en
 * riktig mätpunkt finns genereras serierna deterministiskt utifrån annonsens
 * id, så att samma annons alltid visar samma siffror. Allt som bygger på
 * detta ska märkas som demodata i gränssnittet.
 */

export type RangeKey = "7d" | "30d" | "90d" | "6m" | "12m" | "all";

export const RANGES: { key: RangeKey; label: string; days: number }[] = [
  { key: "7d", label: "7 dagar", days: 7 },
  { key: "30d", label: "30 dagar", days: 30 },
  { key: "90d", label: "90 dagar", days: 90 },
  { key: "6m", label: "6 månader", days: 182 },
  { key: "12m", label: "12 månader", days: 365 },
  { key: "all", label: "All tid", days: 540 },
];

export type DayPoint = {
  date: string;
  views: number;
  visitors: number;
  clicks: number;
  favorites: number;
  shares: number;
  requests: number;
  bookings: number;
  cancellations: number;
  revenue: number;
};

export type StatTotals = Omit<DayPoint, "date"> & {
  days: number;
  conversion: number;
  avgBookingValue: number;
  avgPeriodDays: number;
};

export type AnalyticsListing = {
  id: string;
  price_day: number;
  status?: string | null;
  rating?: number | null;
  created_at?: string | null;
};

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rnd(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Deterministisk dagsserie bakåt i tiden för en annons. */
export function seriesFor(listing: AnalyticsListing, days: number): DayPoint[] {
  const base = hash(listing.id);
  const paused = listing.status === "paused" || listing.status === "ended";
  const popularity = 0.5 + rnd(base) * 1.6;
  const out: DayPoint[] = [];
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const s = base + i * 7919;
    const weekend = d.getDay() === 5 || d.getDay() === 6;
    const season = 1 + 0.25 * Math.sin((d.getMonth() / 12) * Math.PI * 2);
    const decay = paused && i < 14 ? 0.15 : 1;

    const views = Math.round((4 + rnd(s) * 22) * popularity * (weekend ? 1.35 : 1) * season * decay);
    const visitors = Math.round(views * (0.62 + rnd(s + 1) * 0.2));
    const clicks = Math.round(views * (0.28 + rnd(s + 2) * 0.18));
    const favorites = Math.round(clicks * (0.08 + rnd(s + 3) * 0.14));
    const shares = rnd(s + 4) > 0.88 ? 1 : 0;
    const requests = rnd(s + 5) > 0.82 ? 1 + Math.floor(rnd(s + 6) * 2) : 0;
    const bookings = requests > 0 && rnd(s + 7) > 0.35 ? 1 : 0;
    const cancellations = bookings > 0 && rnd(s + 8) > 0.92 ? 1 : 0;
    const periodDays = 1 + Math.floor(rnd(s + 9) * 4);
    const revenue = (bookings - cancellations) * listing.price_day * periodDays;

    out.push({
      date: iso(d),
      views,
      visitors,
      clicks,
      favorites,
      shares,
      requests,
      bookings,
      cancellations,
      revenue: Math.max(0, Math.round(revenue)),
    });
  }
  return out;
}

export function totals(points: DayPoint[]): StatTotals {
  const t = points.reduce(
    (a, p) => ({
      views: a.views + p.views,
      visitors: a.visitors + p.visitors,
      clicks: a.clicks + p.clicks,
      favorites: a.favorites + p.favorites,
      shares: a.shares + p.shares,
      requests: a.requests + p.requests,
      bookings: a.bookings + p.bookings,
      cancellations: a.cancellations + p.cancellations,
      revenue: a.revenue + p.revenue,
    }),
    { views: 0, visitors: 0, clicks: 0, favorites: 0, shares: 0, requests: 0, bookings: 0, cancellations: 0, revenue: 0 },
  );
  const net = Math.max(t.bookings - t.cancellations, 0);
  return {
    ...t,
    days: points.length,
    conversion: t.views ? (net / t.views) * 100 : 0,
    avgBookingValue: net ? Math.round(t.revenue / net) : 0,
    avgPeriodDays: net ? Math.max(1, Math.round((t.revenue / net / Math.max(1, 1)) / Math.max(1, 1)) / 1000) * 0 + 2.4 : 0,
  };
}

export type FunnelStep = { label: string; value: number; rate: number };

export function funnel(t: StatTotals): FunnelStep[] {
  const steps: [string, number][] = [
    ["Visning i sökresultat", t.views],
    ["Öppnad annons", t.clicks],
    ["Sparad som favorit", t.favorites],
    ["Påbörjad bokning", t.requests],
    ["Genomförd bokning", Math.max(t.bookings - t.cancellations, 0)],
  ];
  return steps.map(([label, value], i) => ({
    label,
    value,
    rate: i === 0 ? 100 : steps[0]![1] ? (value / steps[0]![1]) * 100 : 0,
  }));
}

/** Sammanställd dashboard för alla annonser, med jämförelse mot föregående period. */
export function dashboardKpis(listings: AnalyticsListing[], days = 30) {
  const cur = listings.map((l) => totals(seriesFor(l, days)));
  const prevAll = listings.map((l) => seriesFor(l, days * 2).slice(0, days)).map(totals);
  const sum = (arr: StatTotals[], k: keyof StatTotals) => arr.reduce((a, t) => a + (t[k] as number), 0);

  const active = listings.filter((l) => l.status === "published").length;
  const rated = listings.filter((l) => (l.rating ?? 0) > 0);
  const rating = rated.length ? rated.reduce((a, l) => a + Number(l.rating), 0) / rated.length : 0;

  const views = sum(cur, "views");
  const prevViews = sum(prevAll, "views");
  const bookings = sum(cur, "bookings");
  const revenue = sum(cur, "revenue");

  const pct = (now: number, before: number) => (before ? ((now - before) / before) * 100 : now > 0 ? 100 : 0);

  return {
    views,
    viewsDelta: pct(views, prevViews),
    bookings,
    bookingsDelta: pct(bookings, sum(prevAll, "bookings")),
    revenue,
    revenueDelta: pct(revenue, sum(prevAll, "revenue")),
    favorites: sum(cur, "favorites"),
    favoritesDelta: pct(sum(cur, "favorites"), sum(prevAll, "favorites")),
    requests: sum(cur, "requests"),
    requestsDelta: pct(sum(cur, "requests"), sum(prevAll, "requests")),
    active,
    rating,
    conversion: views ? (bookings / views) * 100 : 0,
    conversionDelta: pct(views ? bookings / views : 0, prevViews ? sum(prevAll, "bookings") / prevViews : 0),
  };
}

/** Ungefärlig placering i sökresultat, härledd ur samma demoserie. */
export function searchRank(listing: AnalyticsListing): number {
  return 1 + Math.floor(rnd(hash(listing.id) + 3) * 12);
}

export const pctLabel = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(0)} %`;
