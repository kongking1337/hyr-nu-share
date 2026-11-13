// Navigering när sidan redan är laddad: klick → innehållet syns, och vilka anrop klicket ger.
//
//   node scripts/perf/navigate.mjs --profile=mobile4g [--base=http://127.0.0.1:8787]
//
// Kräver minst en annons under "Senast upplagt" och en kategori med annonser (Verktyg).
import { PROFILES, launch, newPage, parseArgs, shortUrl } from "./lib.mjs";

const { opts } = parseArgs(process.argv.slice(2));
const profileName = opts.profile ?? "desktop";
const profile = PROFILES[profileName];
if (!profile)
  throw new Error(`Okänd profil ${profileName}. Välj ${Object.keys(PROFILES).join(", ")}.`);
const base = opts.base ?? "http://127.0.0.1:8787";

const HOME_READY = `location.pathname === "/" && document.querySelector('section[aria-labelledby="senast"] ul:not([aria-busy]) a')`;
const SEARCH_READY = `location.pathname === "/sok" && document.querySelectorAll("main article").length > 0`;
const LISTING_READY = `location.pathname.startsWith("/annons/") && !document.querySelector('[aria-busy="true"]') && document.querySelector("main h1")`;

const browser = await launch();
const { page, cdp } = await newPage(browser, profile);
let log = [];
cdp.on("Network.requestWillBeSent", (e) => {
  if (e.type === "Script" || e.request.url.startsWith("data:") || e.request.url.includes("favicon"))
    return;
  log.push({ t: Date.now(), line: `${e.request.method} ${shortUrl(e.request.url)}` });
});
let scripts = 0;
cdp.on("Network.requestWillBeSent", (e) => {
  if (e.type === "Script") scripts++;
});

async function step(name, action, ready) {
  log = [];
  scripts = 0;
  const t = Date.now();
  await action();
  await page.waitForFunction(ready, null, { timeout: 60_000 });
  const ms = Date.now() - t;
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  console.log(`\n## ${name}: ${ms} ms tills innehållet syns (${scripts} nya JS-filer)`);
  for (const r of log) console.log(`   +${r.t - t} ms ${r.line}`);
}

console.log(`Profil ${profileName}. Startsidan laddas först (räknas inte).`);
await page.goto(base + "/", { waitUntil: "load" });
await page.waitForFunction(HOME_READY, null, { timeout: 90_000 });
await page.waitForLoadState("networkidle").catch(() => {});

await step(
  "Startsidan → första annonsen under Senast upplagt",
  () => page.click('section[aria-labelledby="senast"] ul a >> nth=0'),
  LISTING_READY,
);
await step("Tillbaka till startsidan", () => page.goBack(), HOME_READY);
await step(
  "Startsidan → Visa vad som finns",
  () => page.click('form[role="search"] button[type="submit"]'),
  SEARCH_READY,
);
await step(
  "Sök: skriv 'släpvagn' + Enter",
  async () => {
    const input = page.locator("main input").first();
    await input.fill("släpvagn");
    await input.press("Enter");
  },
  `location.search.includes("q=") && !/Söker/.test(document.querySelector("#antal-traffar")?.textContent ?? "Söker")`,
);
await step(
  "Sökresultat → första annonsen",
  () => page.click("main article a >> nth=0"),
  LISTING_READY,
);
await step(
  "Tillbaka till sökresultaten",
  () => page.goBack(),
  `location.pathname === "/sok" && document.querySelector("#antal-traffar") && !/Söker/.test(document.querySelector("#antal-traffar").textContent)`,
);
await step(
  "Logotypen → startsidan",
  () => page.click('a[aria-label="Hyrkoll, till startsidan"]'),
  HOME_READY,
);
await step(
  "Startsidan → kategorin Verktyg",
  () => page.click('section[aria-labelledby="kategorier"] li a >> nth=1'),
  SEARCH_READY,
);
await browser.close();
