/**
 * AI-assisterat annonsflöde (demo).
 *
 * Ingen bildanalys, streckkodsläsning eller fordonsuppslagning sker på riktigt.
 * Allt nedan är lokala demosvar med tre tydliga datastatusar:
 *   BEKRÄFTAD  – kommer från användaren eller en verifierad källa
 *   TROLIG     – förslag som måste bekräftas innan publicering
 *   OKÄND      – lämnas tomt, användaren tillfrågas
 */

export type DataStatus = "confirmed" | "likely" | "unknown";

export const STATUS_LABEL: Record<DataStatus, string> = {
  confirmed: "BEKRÄFTAD",
  likely: "TROLIG",
  unknown: "OKÄND",
};

export type Field<T = string> = { value: T | null; status: DataStatus; note?: string | undefined };

export const field = <T,>(value: T | null, status: DataStatus, note?: string): Field<T> => ({ value, status, note });

export type FollowUp = { key: string; question: string; options: string[] };

export type Identification = {
  key: string;
  category: string;
  brand: string;
  model: string;
  productType: string;
  confidence: number;
  titles: string[];
  descriptionSeed: string;
  attributes: Record<string, string>;
  followUps: FollowUp[];
  suggestedPriceDay: number;
  suggestedDeposit: number;
};

/** Demokatalog som används i stället för riktig bildigenkänning. */
export const DEMO_IDENTIFICATIONS: Identification[] = [
  {
    key: "borrmaskin",
    category: "verktyg",
    brand: "Bosch",
    model: "GSB 18V-55",
    productType: "Sladdlös slagborrmaskin",
    confidence: 0.86,
    titles: [
      "Bosch GSB 18V-55 slagborrmaskin med batteri",
      "Sladdlös borrmaskin Bosch 18V – redo att hyra",
      "Bosch borrmaskin 18V för hemmafix och renovering",
    ],
    descriptionSeed:
      "Sladdlös slagborrmaskin från Bosch på 18 volt. Passar för borrning i trä, metall och betong samt skruvdragning.",
    attributes: { marke: "Bosch", stromkalla: "Batteri", spanning: "18", borrhammare: "true" },
    followUps: [
      { key: "batteri", question: "Ingår batteri och laddare?", options: ["Ja, båda ingår", "Endast batteri", "Nej"] },
      { key: "skick", question: "Vilket skick är maskinen i?", options: ["Nyskick", "Bra", "Sliten"] },
      { key: "vaska", question: "Följer väska eller borrset med?", options: ["Ja", "Nej"] },
    ],
    suggestedPriceDay: 149,
    suggestedDeposit: 500,
  },
  {
    key: "gopro",
    category: "kamera",
    brand: "GoPro",
    model: "HERO12 Black",
    productType: "Actionkamera",
    confidence: 0.81,
    titles: [
      "GoPro HERO12 Black actionkamera med fästen",
      "Actionkamera GoPro HERO12 – 5,3K video",
      "GoPro HERO12 Black för resan eller åket",
    ],
    descriptionSeed:
      "Actionkamera från GoPro som filmar i hög upplösning med stabilisering. Tålig och lätt att fästa på hjälm, cykel eller bräda.",
    attributes: { marke: "GoPro", typ: "Actionkamera" },
    followUps: [
      { key: "minneskort", question: "Ingår minneskort?", options: ["Ja", "Nej"] },
      { key: "fasten", question: "Vilka fästen följer med?", options: ["Hjälm", "Cykel", "Sugkopp", "Inga"] },
      { key: "skick", question: "Vilket skick är kameran i?", options: ["Nyskick", "Bra", "Sliten"] },
    ],
    suggestedPriceDay: 249,
    suggestedDeposit: 1500,
  },
  {
    key: "hogtryckstvatt",
    category: "verktyg",
    brand: "Kärcher",
    model: "K5 Premium",
    productType: "Högtryckstvätt",
    confidence: 0.78,
    titles: [
      "Kärcher K5 högtryckstvätt med terrassmunstycke",
      "Högtryckstvätt Kärcher K5 Premium – 145 bar",
      "Kärcher K5 för altan, fasad och bil",
    ],
    descriptionSeed:
      "Högtryckstvätt från Kärcher för altan, fasad, staket och bil. Enkel att köra igång, slang och munstycken ingår.",
    attributes: { marke: "Kärcher", stromkalla: "Nätansluten" },
    followUps: [
      { key: "tillbehor", question: "Vilka tillbehör ingår?", options: ["Terrassmunstycke", "Skumspruta", "Endast standard"] },
      { key: "skick", question: "Vilket skick är maskinen i?", options: ["Nyskick", "Bra", "Sliten"] },
    ],
    suggestedPriceDay: 279,
    suggestedDeposit: 800,
  },
];

/** "Analyserar" en bild – matchar på filnamn/URL, annars första demoobjektet. */
export function identifyFromImages(images: string[], pick?: string): Identification {
  if (pick) {
    const chosen = DEMO_IDENTIFICATIONS.find((d) => d.key === pick);
    if (chosen) return chosen;
  }
  const text = images.join(" ").toLowerCase();
  return (
    DEMO_IDENTIFICATIONS.find((d) => text.includes(d.key) || text.includes(d.brand.toLowerCase())) ??
    DEMO_IDENTIFICATIONS[0]!
  );
}

/** Streckkod / EAN / artikelnummer – demouppslag, kräver ansluten produktdatakälla. */
export function lookupBarcode(code: string): Identification | null {
  if (!code.trim()) return null;
  const idx = code.replace(/\D/g, "").length % DEMO_IDENTIFICATIONS.length;
  return DEMO_IDENTIFICATIONS[idx] ?? null;
}

export type VehicleInfo = {
  regnr: string;
  vin: string;
  marke: string;
  modell: string;
  arsmodell: number;
  drivmedel: string;
  vaxellada: string;
  effekt: string;
  kaross: string;
  saten: number;
  fordonstyp: string;
};

/** Demoresultat för fordonsuppslag. Kräver godkänd fordonsdatakälla för skarp drift. */
export function lookupVehicle(regnr: string): VehicleInfo | null {
  const clean = regnr.replace(/\s/g, "").toUpperCase();
  if (clean.length < 6) return null;
  const demo: VehicleInfo[] = [
    {
      regnr: clean,
      vin: "YV1MW7331A2123456",
      marke: "Volvo",
      modell: "V70 D4",
      arsmodell: 2016,
      drivmedel: "Diesel",
      vaxellada: "Automat",
      effekt: "181 hk",
      kaross: "Kombi",
      saten: 5,
      fordonstyp: "Personbil",
    },
    {
      regnr: clean,
      vin: "WV1ZZZ7HZKH098765",
      marke: "Volkswagen",
      modell: "Transporter T6",
      arsmodell: 2019,
      drivmedel: "Diesel",
      vaxellada: "Manuell",
      effekt: "150 hk",
      kaross: "Skåpbil",
      saten: 3,
      fordonstyp: "Lätt lastbil",
    },
  ];
  return demo[clean.charCodeAt(0) % demo.length]!;
}

/** Publik annons får aldrig visa hela VIN. */
export const maskVin = (vin: string) => (vin.length < 6 ? "•••" : `${vin.slice(0, 3)}••••••••${vin.slice(-4)}`);

export const VEHICLE_CATEGORIES = ["bil", "slapvagn", "mc", "husbil"];

/** Bygger rubrikförslag enbart av bekräftade uppgifter. */
export function buildTitles(input: {
  brand?: string | undefined;
  model?: string | undefined;
  productType?: string | undefined;
  city?: string | undefined;
  extras?: string[] | undefined;
}): string[] {
  const core = [input.brand, input.model].filter(Boolean).join(" ");
  const type = input.productType ?? "";
  const extra = (input.extras ?? []).filter(Boolean)[0];
  const out = [
    [core, type.toLowerCase()].filter(Boolean).join(" – "),
    [type, core].filter(Boolean).join(" "),
    [core, extra].filter(Boolean).join(" med "),
  ].filter((t) => t.trim().length > 3);
  return Array.from(new Set(out)).slice(0, 3);
}

/** Bygger en beskrivning av bekräftade fakta – inget hittas på. */
export function buildDescription(input: {
  seed?: string | undefined;
  brand?: string | undefined;
  model?: string | undefined;
  productType?: string | undefined;
  city?: string | undefined;
  condition?: string | undefined;
  includes?: string[] | undefined;
  delivery?: boolean | undefined;
  deposit?: number | undefined;
}): string {
  const lines: string[] = [];
  if (input.seed) lines.push(input.seed);
  else if (input.productType) lines.push(`${input.productType}${input.brand ? ` från ${input.brand}` : ""} att hyra.`);
  if (input.condition) lines.push(`Skick: ${input.condition.toLowerCase()}.`);
  const inc = (input.includes ?? []).filter(Boolean);
  if (inc.length) lines.push(`Detta ingår: ${inc.join(", ")}.`);
  if (input.city) lines.push(`Hämtas i ${input.city}${input.delivery ? ", leverans kan ordnas mot avgift" : ""}.`);
  if (input.deposit) lines.push(`Deposition ${input.deposit} kr återbetalas när grejen lämnas tillbaka hel.`);
  lines.push("Hör av dig om du undrar något inför bokningen.");
  return lines.join(" ");
}
