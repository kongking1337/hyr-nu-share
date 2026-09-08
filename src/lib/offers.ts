/**
 * Budgivning och prisförhandling.
 *
 * All marknadslogik här är en transparent MVP-heuristik som bygger på egna
 * annonser och tydligt märkta demoannonser – aldrig en påstådd marknadsdatakälla.
 */
export type OfferStatus =
  | "active"
  | "countered"
  | "accepted"
  | "declined"
  | "expired"
  | "withdrawn";

export type OfferRow = {
  id: string;
  listing_id: string;
  renter_id: string;
  owner_id: string | null;
  parent_id: string | null;
  booking_id: string | null;
  actor: string;
  start_date: string;
  end_date: string;
  days: number;
  list_total: number | string;
  amount: number | string;
  message: string | null;
  status: OfferStatus;
  expires_at: string | null;
  created_at: string;
};

export const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  active: "Aktivt",
  countered: "Motbud lämnat",
  accepted: "Accepterat",
  declined: "Nekat",
  expired: "Utgånget",
  withdrawn: "Återkallat",
};

export const OFFER_STATUS_TONE: Record<OfferStatus, string> = {
  active: "bg-primary/12 text-primary",
  countered: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  accepted: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  declined: "bg-destructive/12 text-destructive",
  expired: "bg-muted text-muted-foreground",
  withdrawn: "bg-muted text-muted-foreground",
};

export const VALIDITY_OPTIONS = [
  { value: 0, label: "Ingen giltighetstid" },
  { value: 1, label: "1 timme" },
  { value: 2, label: "2 timmar" },
  { value: 6, label: "6 timmar" },
  { value: 12, label: "12 timmar" },
  { value: 24, label: "24 timmar" },
];

export const num = (v: number | string | null | undefined) => Number(v ?? 0);

/** Status inklusive utgångstid – databasen städar först vid nästa anrop. */
export function effectiveStatus(o: Pick<OfferRow, "status" | "expires_at">): OfferStatus {
  if ((o.status === "active" || o.status === "countered") && o.expires_at) {
    if (new Date(o.expires_at).getTime() < Date.now()) return "expired";
  }
  return o.status;
}

export function isOpen(o: Pick<OfferRow, "status" | "expires_at">) {
  return effectiveStatus(o) === "active";
}

export function timeLeft(expiresAt: string | null): string {
  if (!expiresAt) return "Ingen tidsgräns";
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Utgånget";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h} h ${m} min kvar` : `${m} min kvar`;
}

export function discountPct(amount: number, listTotal: number): number {
  if (!listTotal) return 0;
  return ((listTotal - amount) / listTotal) * 100;
}

/* ---------------------------------------------------------------- */
/* AI-budbedömning (icke-bindande rekommendation till uthyraren)     */
/* ---------------------------------------------------------------- */

export type OfferAssessment = {
  verdict: "good" | "counter" | "low";
  label: string;
  reason: string;
  suggestedCounter: number;
  demandNote: string;
};

export function assessOffer(input: {
  amount: number;
  listTotal: number;
  marketTotal?: number | null;
  /** 0–1, seedad demoefterfrågan */
  demand?: number;
}): OfferAssessment {
  const { amount, listTotal } = input;
  const market = input.marketTotal && input.marketTotal > 0 ? input.marketTotal : listTotal;
  const demand = input.demand ?? 0.55;
  const dPct = discountPct(amount, listTotal);
  const vsMarket = market ? ((amount - market) / market) * 100 : 0;

  const demandNote =
    demand > 0.7
      ? "Hög demoefterfrågan i kategorin just nu – du har utrymme att hålla priset."
      : demand < 0.4
        ? "Låg demoefterfrågan i kategorin – ett accepterat bud kan vara bättre än en tom period."
        : "Normal demoefterfrågan i kategorin.";

  const suggestedCounter = Math.round(((amount + Math.max(market, amount)) / 2) / 10) * 10;

  if (dPct <= 8 || vsMarket >= 0) {
    return {
      verdict: "good",
      label: "Bra bud",
      reason: `Budet ligger ${Math.abs(Math.round(dPct))} % under ditt annonserade totalpris och i nivå med vårt marknadsestimat (${Math.round(market)} kr).`,
      suggestedCounter,
      demandNote,
    };
  }
  if (dPct <= 22) {
    return {
      verdict: "counter",
      label: "Överväg motbud",
      reason: `Budet är ${Math.round(dPct)} % under annonserat pris och ${Math.abs(Math.round(vsMarket))} % under marknadsestimatet. Ett motbud runt ${suggestedCounter} kr brukar landa i demoserien.`,
      suggestedCounter,
      demandNote,
    };
  }
  return {
    verdict: "low",
    label: "Under marknadsnivå",
    reason: `Budet är ${Math.round(dPct)} % under annonserat pris och tydligt under marknadsestimatet på ${Math.round(market)} kr.`,
    suggestedCounter,
    demandNote,
  };
}

/* ---------------------------------------------------------------- */
/* Aggregerad, anonymiserad budstatistik                             */
/* ---------------------------------------------------------------- */

export type OfferStats = {
  sample: number;
  avgAccepted: number;
  avgStart: number;
  avgDiscountPct: number;
  acceptRate: number;
  counterAcceptRate: number;
};

export function offerStats(offers: OfferRow[]): OfferStats {
  const rows = offers.filter((o) => num(o.amount) > 0);
  const accepted = rows.filter((o) => o.status === "accepted");
  const counters = rows.filter((o) => o.actor === "owner");
  const acceptedCounters = counters.filter((o) => o.status === "accepted");
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

  return {
    sample: rows.length,
    avgAccepted: avg(accepted.map((o) => num(o.amount))),
    avgStart: avg(rows.filter((o) => o.actor === "renter").map((o) => num(o.amount))),
    avgDiscountPct: Math.round(
      avg(accepted.map((o) => discountPct(num(o.amount), num(o.list_total)))),
    ),
    acceptRate: rows.length ? Math.round((accepted.length / rows.length) * 100) : 0,
    counterAcceptRate: counters.length
      ? Math.round((acceptedCounters.length / counters.length) * 100)
      : 0,
  };
}

export const DATA_WEIGHT_NOTE =
  "Underlaget viktas: genomförda bokningar väger tyngst, därefter accepterade bud och sist listade priser. Statistiken är aggregerad och anonymiserad – enskilda bud visas aldrig för andra.";
