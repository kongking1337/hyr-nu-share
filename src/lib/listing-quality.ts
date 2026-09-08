/**
 * Annonskvalitet 0–100.
 *
 * Heuristik, inte en riktig modell: poängen räknas ut lokalt utifrån hur
 * komplett annonsen är. Presenteras alltid som rekommendation.
 */

export type QualityInput = {
  images: string[];
  title: string;
  description: string;
  price_day: number | string;
  price_week?: number | string | null;
  price_hour?: number | string | null;
  deposit?: number | string | null;
  city?: string;
  area?: string | null;
  category_slug?: string;
  delivery_available?: boolean;
  attributes?: Record<string, unknown>;
};

export type QualityPart = { key: string; label: string; score: number; max: number; tip?: string };

export type Quality = { total: number; parts: QualityPart[]; tips: string[] };

const num = (v: unknown) => Number(v ?? 0) || 0;

export function scoreListing(l: QualityInput): Quality {
  const parts: QualityPart[] = [];

  const imgs = (l.images ?? []).filter(Boolean).length;
  parts.push({
    key: "bilder",
    label: "Bilder",
    max: 30,
    score: Math.min(30, imgs * 8),
    tip:
      imgs === 0
        ? "Lägg till minst 3 bilder – annonser med bilder får betydligt fler klick."
        : imgs < 4
          ? `Du har ${imgs} bild${imgs === 1 ? "" : "er"}. Lägg till fler och ljusare bilder från olika vinklar.`
          : undefined,
  });

  const tLen = (l.title ?? "").trim().length;
  parts.push({
    key: "rubrik",
    label: "Rubrik",
    max: 20,
    score: tLen === 0 ? 0 : tLen < 15 ? 8 : tLen <= 60 ? 20 : 14,
    tip:
      tLen === 0
        ? "Skriv en rubrik med märke och modell."
        : tLen < 15
          ? "Rubriken är kort – lägg till märke, modell och viktigaste egenskapen."
          : tLen > 60
            ? "Rubriken är lång – korta ner till det viktigaste."
            : undefined,
  });

  const dLen = (l.description ?? "").trim().length;
  parts.push({
    key: "beskrivning",
    label: "Beskrivning",
    max: 20,
    score: dLen === 0 ? 0 : dLen < 120 ? 8 : dLen < 300 ? 15 : 20,
    tip:
      dLen < 120
        ? "Beskrivningen är kort. Berätta om skick, vad som ingår och hur uthämtning fungerar."
        : undefined,
  });

  const priceParts = [num(l.price_day) > 0, num(l.price_week) > 0, num(l.price_hour) > 0].filter(Boolean).length;
  parts.push({
    key: "pris",
    label: "Pris",
    max: 15,
    score: num(l.price_day) > 0 ? Math.min(15, 8 + priceParts * 3) : 0,
    tip:
      num(l.price_day) <= 0
        ? "Sätt ett dygnspris."
        : num(l.price_week) <= 0
          ? "Lägg till veckopris – längre uthyrningar ger jämnare intäkter."
          : undefined,
  });

  const infoChecks = [
    !!l.city,
    !!l.area,
    num(l.deposit) >= 0 && l.deposit !== undefined && l.deposit !== null && l.deposit !== "",
    !!l.category_slug,
    Object.keys(l.attributes ?? {}).length > 0,
  ].filter(Boolean).length;
  parts.push({
    key: "information",
    label: "Information",
    max: 15,
    score: Math.round((infoChecks / 5) * 15),
    tip: infoChecks < 5 ? "Fyll i område, deposition och specifikationer så syns annonsen i fler filter." : undefined,
  });

  const total = Math.round(parts.reduce((a, p) => a + p.score, 0));
  return { total, parts, tips: parts.map((p) => p.tip).filter(Boolean) as string[] };
}

export function qualityLabel(total: number): string {
  if (total >= 85) return "Utmärkt";
  if (total >= 70) return "Bra";
  if (total >= 50) return "Godkänd";
  return "Behöver förbättras";
}
