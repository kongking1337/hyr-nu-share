import { CITIES, findCity, normalize } from "./geo";

export const CATEGORY_SYNONYMS: Record<string, { name: string; words: string[] }> = {
  slapvagn: {
    name: "Släpvagn",
    words: ["slapvagn", "slap", "slapkarra", "karra", "trailer", "flyttslap", "slepvagn", "slapvang"],
  },
  verktyg: {
    name: "Verktyg",
    words: ["verktyg", "hogtryckstvatt", "hogtrycktvatt", "tryckttvatt", "karcher", "borr", "borrmaskin", "tigersag", "slipmaskin", "spikpistol"],
  },
  kamera: {
    name: "Kamera & Foto",
    words: ["kamera", "systemkamera", "objektiv", "gopro", "dronare", "drone", "blixt", "foto"],
  },
  fest: {
    name: "Fest & Event",
    words: ["fest", "talt", "partytalt", "hogtalare", "ljudanlaggning", "popcorn", "brollop"],
  },
  tradgard: {
    name: "Trädgård",
    words: ["tradgard", "grasklippare", "gresklippare", "hacksax", "jordfras", "lovblas"],
  },
  fritid: {
    name: "Fritid & Sport",
    words: ["kajak", "cykel", "elcykel", "skidor", "paddleboard", "sup", "fritid", "tent"],
  },
  bygg: {
    name: "Bygg & Maskiner",
    words: ["bygg", "betongblandare", "byggstallning", "stallning", "maskin"],
  },
  barn: {
    name: "Barn & Familj",
    words: ["barn", "barnvagn", "bilbarnstol", "reseseng", "familj"],
  },
};

function fuzzyHit(word: string, target: string): boolean {
  if (word.length < 4) return false;
  if (target.includes(word) || word.includes(target)) return true;
  // enkel stavfelstolerans: gemensam prefix
  return word.slice(0, 5) === target.slice(0, 5) && Math.abs(word.length - target.length) <= 3;
}

export type ParsedSearch = {
  text: string;
  category: string | null;
  cityName: string | null;
  lat: number | null;
  lng: number | null;
  radiusKm: number | null;
  startDate: string | null;
  endDate: string | null;
  sort: string | null;
  notes: string[];
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

function nextWeekday(target: number, from = new Date()): Date {
  const d = new Date(from);
  d.setHours(12, 0, 0, 0);
  const diff = (target - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d;
}

const WEEKDAYS: Record<string, number> = {
  sondag: 0, mandag: 1, tisdag: 2, onsdag: 3, torsdag: 4, fredag: 5, lordag: 6,
};

export function parseSearch(raw: string): ParsedSearch {
  const n = normalize(raw);
  const notes: string[] = [];
  const words = n.split(" ");

  let category: string | null = null;
  outer: for (const [slug, def] of Object.entries(CATEGORY_SYNONYMS)) {
    for (const w of words) {
      if (def.words.some((t) => fuzzyHit(w, t))) {
        category = slug;
        notes.push(`Kategori: ${def.name}`);
        break outer;
      }
    }
  }

  const city = findCity(n);
  if (city) notes.push(`Plats: ${city.name}`);

  let radiusKm: number | null = null;
  const radiusMatch = n.match(/(?:inom|inom en radie av|max)\s+(\d{1,3})\s*km/);
  if (radiusMatch) {
    radiusKm = Number(radiusMatch[1]);
    notes.push(`Radie: ${radiusKm} km`);
  }

  let startDate: string | null = null;
  let endDate: string | null = null;
  if (n.includes("helg")) {
    const sat = nextWeekday(6);
    const sun = new Date(sat);
    sun.setDate(sun.getDate() + 1);
    startDate = iso(sat);
    endDate = iso(sun);
    notes.push("Period: kommande helg");
  } else if (n.includes("imorgon") || n.includes("i morgon")) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    startDate = endDate = iso(d);
    notes.push("Period: imorgon");
  } else if (n.includes("idag") || n.includes("i dag")) {
    startDate = endDate = iso(new Date());
    notes.push("Period: idag");
  } else if (n.includes("en vecka") || n.includes("veckan")) {
    const d = new Date();
    const e = new Date();
    e.setDate(e.getDate() + 7);
    startDate = iso(d);
    endDate = iso(e);
    notes.push("Period: en vecka");
  } else {
    for (const [name, idx] of Object.entries(WEEKDAYS)) {
      if (n.includes(name)) {
        const d = nextWeekday(idx);
        startDate = endDate = iso(d);
        notes.push(`Period: nästa ${name}`);
        break;
      }
    }
  }

  let sort: string | null = null;
  if (/billig|lagsta|lagst|cheap/.test(n)) {
    sort = "price_asc";
    notes.push("Sortering: lägsta totalpris");
  } else if (/narmast|nara|narheten/.test(n)) {
    sort = "distance";
    notes.push("Sortering: närmast");
  } else if (/bast betyg|hogst betyg|basta/.test(n)) {
    sort = "rating";
    notes.push("Sortering: bäst betyg");
  }

  return {
    text: raw,
    category,
    cityName: city?.name ?? null,
    lat: city?.lat ?? null,
    lng: city?.lng ?? null,
    radiusKm,
    startDate,
    endDate,
    sort,
    notes,
  };
}

export const EXAMPLE_QUERIES = [
  "Jag behöver en högtryckstvätt nära Solna över helgen",
  "Billigaste släpvagnen inom 20 km från Göteborg på lördag",
  "Systemkamera i Stockholm en vecka",
  "Partytält till bröllop i Uppsala",
];

export const CITY_OPTIONS = CITIES;
