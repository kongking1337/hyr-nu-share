import type { CancellationPolicy } from "@/lib/providers/types";

/**
 * Bokningar: priset för en period, statusar, avbokningsregler och datumhjälp.
 * Databasen (request_booking i supabase/migrations/20261101150000_rental_flow.sql)
 * räknar fram det pris som sparas; bookingPrice räknar likadant så att kunden ser
 * samma summa innan förfrågan skickas.
 */

export type BookingStatus = "requested" | "confirmed" | "declined" | "cancelled" | "completed";

export const BOOKING_STATUS: Record<BookingStatus, { label: string }> = {
  requested: { label: "Väntar på svar" },
  confirmed: { label: "Godkänd" },
  declined: { label: "Nekad" },
  cancelled: { label: "Avbokad" },
  completed: { label: "Avslutad" },
};

export const CANCELLATION_POLICIES: Record<
  CancellationPolicy,
  { label: string; text: string; daysBefore: number }
> = {
  flexible: { label: "Flexibel", text: "Avboka senast dagen före start.", daysBefore: 1 },
  moderate: { label: "Normal", text: "Avboka senast 3 dagar före start.", daysBefore: 3 },
  strict: { label: "Strikt", text: "Avboka senast 7 dagar före start.", daysBefore: 7 },
};

export function asPolicy(v: unknown): CancellationPolicy {
  return v === "moderate" || v === "strict" ? v : "flexible";
}

/** Sant om avbokningen sker senare än uthyraren vill. */
export function lateCancellation(policy: CancellationPolicy, startDate: string): boolean {
  const deadline = addDays(startDate, -CANCELLATION_POLICIES[policy].daysBefore);
  return todayISO() > deadline;
}

/** Dygnspris, eller veckopris för hela veckor när det blir billigare. */
export function bookingPrice(
  l: { priceDay: number; priceWeek?: number | null },
  days: number,
): number {
  const plain = days * l.priceDay;
  if (!l.priceWeek || days < 7) return plain;
  const weeks = Math.floor(days / 7);
  const rest = days % 7;
  return Math.min(plain, weeks * l.priceWeek + Math.min(rest * l.priceDay, l.priceWeek));
}

export const MAX_BOOKING_DAYS = 90;

/* ---------- Datum som "YYYY-MM-DD" (lokal tid) ---------- */

export function toISODate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function fromISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

export const todayISO = () => toISODate(new Date());

export function addDays(iso: string, n: number): string {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Antal dygn från och med start till och med slut. */
export function daysBetween(start: string, end: string): number {
  return Math.round((fromISODate(end).getTime() - fromISODate(start).getTime()) / 86_400_000) + 1;
}

const MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

/** "12 nov", "12–14 nov" eller "30 nov–2 dec". */
export function formatDates(start: string, end: string): string {
  const a = fromISODate(start);
  const b = fromISODate(end);
  const fmt = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  if (start === end) return fmt(a);
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return `${a.getDate()}–${fmt(b)}`;
  }
  return `${fmt(a)}–${fmt(b)}`;
}

/** Upptagna perioder som react-day-picker förstår (för `disabled` och `modifiers`). */
export function takenRanges(rows: Array<{ start_date: string; end_date: string }> | null | undefined) {
  return (rows ?? []).map((r) => ({ from: fromISODate(r.start_date), to: fromISODate(r.end_date) }));
}

/** Sant om någon dag i perioden är upptagen. */
export function overlapsTaken(
  start: string,
  end: string,
  rows: Array<{ start_date: string; end_date: string }> | null | undefined,
): boolean {
  return (rows ?? []).some((r) => r.start_date <= end && r.end_date >= start);
}
