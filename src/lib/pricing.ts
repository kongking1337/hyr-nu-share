import type { UnifiedResult } from "./providers/types";

export type Quote = {
  days: number;
  base: number;
  serviceFee: number;
  insuranceFee: number;
  deliveryFee: number;
  deposit: number;
  total: number;
  comparableDayPrice: number;
  breakdownLabel: string;
};

/**
 * Normaliserar timme/dag/vecka/månad till lägsta möjliga grundpris för perioden.
 */
export function bestBasePrice(
  r: Pick<UnifiedResult, "priceHour" | "priceDay" | "priceWeek" | "priceMonth">,
  days: number,
): { base: number; label: string } {
  const day = r.priceDay;
  const week = r.priceWeek ?? day * 6;
  const month = r.priceMonth ?? week * 3.6;

  if (days <= 0) return { base: 0, label: "—" };

  if (days === 1 && r.priceHour) {
    const eightHours = r.priceHour * 8;
    if (eightHours < day) return { base: eightHours, label: "8 timmar" };
  }

  const months = Math.floor(days / 30);
  let rest = days - months * 30;
  const weeks = Math.floor(rest / 7);
  rest = rest - weeks * 7;

  const packed = months * month + weeks * week + rest * day;
  const plainDays = days * day;
  if (packed < plainDays) {
    const parts = [
      months ? `${months} mån` : "",
      weeks ? `${weeks} v` : "",
      rest ? `${rest} dygn` : "",
    ].filter(Boolean);
    return { base: Math.round(packed), label: parts.join(" + ") };
  }
  return { base: Math.round(plainDays), label: `${days} dygn` };
}

export function quote(
  r: UnifiedResult,
  days: number,
  opts: { delivery?: boolean } = {},
): Quote {
  const { base, label } = bestBasePrice(r, days);
  // Hyrkoll tar ingen serviceavgift och förmedlar ingen försäkring, så de ingår inte i priset.
  const serviceFee = 0;
  const insuranceFee = 0;
  const deliveryFee = opts.delivery && r.deliveryAvailable ? r.deliveryFee : 0;
  const total = base + serviceFee + insuranceFee + deliveryFee;
  return {
    days,
    base,
    serviceFee,
    insuranceFee,
    deliveryFee,
    deposit: r.deposit,
    total,
    comparableDayPrice: Math.round(total / Math.max(days, 1)),
    breakdownLabel: label,
  };
}

export const kr = (n: number) =>
  `${new Intl.NumberFormat("sv-SE").format(Math.round(n))} kr`;
