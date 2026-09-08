/**
 * Datamodell för kategori-specifika attribut.
 *
 * Attributen definieras deklarativt per kategori och kan i ett senare skede
 * lagras i databasen som `listings.attributes jsonb`. Tills dess härleds de
 * från titel/beskrivning med enkel MVP-logik (`deriveAttributes`), vilket gör
 * att filterpanelen kan vara dynamisk redan nu.
 */
import type { UnifiedResult } from "@/lib/providers/types";
import { normalize } from "@/lib/geo";

export type AttrType = "select" | "bool" | "range";

export type AttrDef = {
  key: string;
  label: string;
  type: AttrType;
  options?: string[];
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
};

export type SubCategory = { slug: string; name: string; words: string[] };

export const SUBCATEGORIES: Record<string, SubCategory[]> = {
  slapvagn: [
    { slug: "obromsad", name: "Obromsad", words: ["obromsad", "750"] },
    { slug: "bromsad", name: "Bromsad", words: ["bromsad", "1300", "1500"] },
    { slug: "kapa", name: "Med kåpa/täckt", words: ["kapa", "tackt", "kåpa"] },
    { slug: "biltransport", name: "Biltransport", words: ["biltransport", "bilsläp"] },
  ],
  verktyg: [
    { slug: "borrmaskin", name: "Borrmaskin & borrhammare", words: ["borr", "borrmaskin", "borrhammare", "hammarborr"] },
    { slug: "hogtryckstvatt", name: "Högtryckstvätt", words: ["hogtryckstvatt", "karcher"] },
    { slug: "sag", name: "Sågar", words: ["sag", "tigersag", "kapsag", "bordssag"] },
    { slug: "slipmaskin", name: "Slip & puts", words: ["slip", "slipmaskin", "puts"] },
  ],
  kamera: [
    { slug: "systemkamera", name: "Systemkamera", words: ["systemkamera", "spegellos", "dslr"] },
    { slug: "objektiv", name: "Objektiv", words: ["objektiv", "lens", "mm"] },
    { slug: "dronare", name: "Drönare", words: ["dronare", "drone", "dji"] },
    { slug: "ljus", name: "Ljus & ljud", words: ["blixt", "mikrofon", "lampa"] },
  ],
  fest: [
    { slug: "talt", name: "Tält & möbler", words: ["talt", "partytalt", "bord", "stol"] },
    { slug: "ljud", name: "Ljud & ljus", words: ["hogtalare", "ljudanlaggning", "diskolampa"] },
    { slug: "kok", name: "Kök & servering", words: ["popcorn", "kaffe", "grill"] },
  ],
  tradgard: [
    { slug: "grasklippare", name: "Gräsklippare", words: ["grasklippare", "robotgrasklippare"] },
    { slug: "jordfras", name: "Jordfräs", words: ["jordfras"] },
    { slug: "hackklipp", name: "Häck & trim", words: ["hacksax", "trimmer", "lovblas"] },
  ],
  fritid: [
    { slug: "kajak", name: "Kajak & SUP", words: ["kajak", "sup", "paddleboard"] },
    { slug: "cykel", name: "Cykel", words: ["cykel", "elcykel"] },
    { slug: "vinter", name: "Vintersport", words: ["skidor", "snowboard", "pulka"] },
    { slug: "spel", name: "Spel & konsol", words: ["ps5", "playstation", "xbox", "nintendo", "konsol", "projektor"] },
  ],
  bygg: [
    { slug: "stallning", name: "Ställning", words: ["stallning", "byggstallning"] },
    { slug: "betong", name: "Betong", words: ["betongblandare", "vibrator"] },
    { slug: "lyft", name: "Lyft & transport", words: ["lyft", "pirra", "vagn"] },
  ],
  barn: [
    { slug: "vagn", name: "Vagnar", words: ["barnvagn", "vagn"] },
    { slug: "bilstol", name: "Bilbarnstol", words: ["bilbarnstol"] },
    { slug: "sang", name: "Resesäng", words: ["reseseng", "sang"] },
  ],
};

export const CATEGORY_ATTRIBUTES: Record<string, AttrDef[]> = {
  bil: [
    { key: "marke", label: "Märke", type: "select", options: ["Volvo", "Volkswagen", "Tesla", "Toyota", "Ford"] },
    { key: "modell", label: "Modell", type: "select", options: ["V70", "Transporter", "Model 3", "Hilux"] },
    { key: "arsmodell", label: "Årsmodell", type: "range", min: 2000, max: 2026, step: 1 },
    { key: "drivmedel", label: "Drivmedel", type: "select", options: ["Bensin", "Diesel", "El", "Hybrid"] },
    { key: "vaxellada", label: "Växellåda", type: "select", options: ["Manuell", "Automat"] },
    { key: "platser", label: "Antal platser", type: "range", min: 2, max: 9, step: 1 },
  ],
  kamera: [
    { key: "marke", label: "Märke", type: "select", options: ["Canon", "Sony", "Nikon", "Fujifilm", "DJI", "GoPro"] },
    { key: "modell", label: "Modell", type: "select", options: ["R6", "A7 III", "Z6", "X-T4", "Mavic"] },
    { key: "typ", label: "Typ", type: "select", options: ["Systemkamera", "Objektiv", "Drönare", "Actionkamera"] },
    { key: "fattning", label: "Fattning", type: "select", options: ["RF", "EF", "E", "Z", "X"] },
    { key: "upplosning", label: "Upplösning (MP)", type: "range", min: 12, max: 61, step: 1 },
  ],
  slapvagn: [
    { key: "maxlast", label: "Maxlast (kg)", type: "range", min: 300, max: 2500, step: 50 },
    { key: "totalvikt", label: "Totalvikt (kg)", type: "range", min: 500, max: 3500, step: 50 },
    { key: "bromsad", label: "Bromsad", type: "bool" },
    { key: "tackt", label: "Täckt/kåpa", type: "bool" },
  ],
  verktyg: [
    { key: "marke", label: "Märke", type: "select", options: ["Makita", "Bosch", "DeWalt", "Kärcher", "Milwaukee", "Hilti"] },
    { key: "stromkalla", label: "Strömkälla", type: "select", options: ["Batteri", "Nätansluten"] },
    { key: "spanning", label: "Spänning (V)", type: "select", options: ["12", "18", "36", "230"] },
    { key: "borrhammare", label: "Borrhammare", type: "bool" },
    { key: "tillbehor", label: "Tillbehör ingår", type: "bool" },
  ],
};

const BRANDS = ["Makita", "Bosch", "DeWalt", "Kärcher", "Milwaukee", "Hilti", "Canon", "Sony", "Nikon", "Fujifilm", "DJI", "GoPro", "Volvo", "Tesla"];

export type AttrValues = Record<string, string | number | boolean>;

/** MVP-härledning av attribut ur fritext tills `listings.attributes` finns. */
export function deriveAttributes(r: UnifiedResult): AttrValues {
  const text = `${r.title} ${r.description}`;
  const n = normalize(text);
  const out: AttrValues = {};

  const brand = BRANDS.find((b) => n.includes(normalize(b)));
  if (brand) out["marke"] = brand;

  if (r.category === "slapvagn") {
    const kg = n.match(/(\d{3,4})\s*kg/);
    if (kg) {
      out["totalvikt"] = Number(kg[1]);
      out["maxlast"] = Math.round(Number(kg[1]) * 0.72);
    }
    out["bromsad"] = n.includes("bromsad") && !n.includes("obromsad");
    out["tackt"] = /kapa|tackt|kåpa|skap/.test(n);
  }
  if (r.category === "verktyg") {
    out["stromkalla"] = /batteri|sladdlos|akku/.test(n) ? "Batteri" : "Nätansluten";
    const v = n.match(/(\d{2,3})\s*v\b/);
    if (v) out["spanning"] = v[1]!;
    out["borrhammare"] = /borrhammare|hammarborr|slagborr/.test(n);
    out["tillbehor"] = /tillbehor|kit|set|väska|vaska/.test(n);
  }
  if (r.category === "kamera") {
    out["typ"] = /dronare|drone|dji/.test(n)
      ? "Drönare"
      : /objektiv/.test(n)
        ? "Objektiv"
        : /gopro|action/.test(n)
          ? "Actionkamera"
          : "Systemkamera";
    const mp = n.match(/(\d{2})\s*mp/);
    if (mp) out["upplosning"] = Number(mp[1]);
  }
  const year = n.match(/\b(19|20)\d{2}\b/);
  if (year && r.category === "bil") out["arsmodell"] = Number(year[0]);

  return out;
}

export function subCategoryOf(r: UnifiedResult): string | null {
  const subs = SUBCATEGORIES[r.category];
  if (!subs) return null;
  const n = normalize(`${r.title} ${r.description}`);
  return subs.find((s) => s.words.some((w) => n.includes(normalize(w))))?.slug ?? null;
}

/** Serialisering av attributfilter i URL: "marke:Makita|bromsad:true" */
export function parseAttrFilter(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  raw
    .split("|")
    .filter(Boolean)
    .forEach((pair) => {
      const [k, ...rest] = pair.split(":");
      if (k && rest.length) out[k] = rest.join(":");
    });
  return out;
}

export function stringifyAttrFilter(map: Record<string, string>): string {
  return Object.entries(map)
    .filter(([, v]) => v !== "" && v != null)
    .map(([k, v]) => `${k}:${v}`)
    .join("|");
}

export function matchesAttrFilter(r: UnifiedResult, filter: Record<string, string>): boolean {
  if (!Object.keys(filter).length) return true;
  const values = deriveAttributes(r);
  return Object.entries(filter).every(([k, want]) => {
    const got = values[k];
    if (got == null) return false;
    if (want === "true") return got === true;
    if (want === "false") return got === false;
    return String(got).toLowerCase() === want.toLowerCase();
  });
}
