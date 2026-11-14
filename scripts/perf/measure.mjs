// Första besöket med tom cache: när syns innehållet, hur mycket laddas, hoppar layouten?
//
//   node scripts/perf/measure.mjs --profile=mobile4g --runs=3 [--base=http://127.0.0.1:8787] [sökvägar …]
//
// "Innehåll" = riktigt innehåll, inte skelett: första raden under "Senast upplagt" på startsidan,
// första annonskortet på sök- och kategorisidor, annonsens rubrik på annonssidan.
import { PROFILES, launch, median, newPage, parseArgs, shortUrl } from "./lib.mjs";

const { opts, rest } = parseArgs(process.argv.slice(2));
const profileName = opts.profile ?? "desktop";
const profile = PROFILES[profileName];
if (!profile)
  throw new Error(`Okänd profil ${profileName}. Välj ${Object.keys(PROFILES).join(", ")}.`);
const runs = Number(opts.runs ?? 3);
const base = opts.base ?? "http://127.0.0.1:8787";
const paths = rest.length
  ? rest
  : ["/", "/sok", "/hyra/verktyg", "/annons/b438c04f-c8f5-4ddc-badd-55ddde561d3f", "/villkor"];

function selectors(path) {
  if (path === "/")
    return {
      content: `document.querySelector('section[aria-labelledby="senast"] ul:not([aria-busy]) a')`,
      img: `document.querySelector('section[aria-labelledby="kategorier"] img')`,
    };
  if (path.startsWith("/sok") || path.startsWith("/hyra/"))
    return {
      content: `document.querySelector('main article')`,
      img: `document.querySelector('main article img')`,
    };
  if (path.startsWith("/annons/"))
    return {
      content: `(!document.querySelector('[aria-busy="true"]') && document.querySelector('main h1'))`,
      img: `document.querySelector('main img')`,
    };
  return { content: `document.querySelector('main h1')`, img: `null` };
}

const initScript = ({ content, img }) => `
window.__p = { lcp: 0, lcpEl: '', cls: 0, shifts: [], lt: [], fcp: 0, content: 0, img: 0 };
new PerformanceObserver(l => { for (const e of l.getEntries()) { __p.lcp = e.startTime; __p.lcpEl = e.element ? e.element.tagName : ''; } }).observe({ type: 'largest-contentful-paint', buffered: true });
new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) { __p.cls += e.value; if (e.value > 0.01) __p.shifts.push({ t: Math.round(e.startTime), v: +e.value.toFixed(3), src: (e.sources || []).map(s => s.node ? s.node.nodeName + '.' + String(s.node.className || '').slice(0, 30) : '?').slice(0, 2) }); } }).observe({ type: 'layout-shift', buffered: true });
new PerformanceObserver(l => { for (const e of l.getEntries()) __p.lt.push(e.duration); }).observe({ type: 'longtask', buffered: true });
new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') __p.fcp = e.startTime; }).observe({ type: 'paint', buffered: true });
(function poll() {
  try {
    if (!__p.content && (${content})) __p.content = performance.now();
    const im = ${img};
    if (!__p.img && im && im.complete && im.naturalWidth > 0 && !im.src.startsWith('data:')) __p.img = performance.now();
  } catch (e) {}
  // Fortsätt tills både innehållet och (på sidor med bild) första bilden har synts.
  if (!__p.content || (${img !== "null"} && !__p.img)) requestAnimationFrame(poll);
})();
`;

const browser = await launch();
console.log(
  `Profil ${profileName}, ${runs} körningar per sida, tom cache. Tider i ms från navigeringens start (median).\n`,
);
for (const path of paths) {
  const sel = selectors(path);
  const rs = [];
  for (let i = 0; i < runs; i++) {
    const { ctx, page, cdp } = await newPage(browser, profile, {
      disableCache: true,
      initScript: initScript(sel),
    });
    const reqs = new Map();
    cdp.on("Network.requestWillBeSent", (e) =>
      reqs.set(e.requestId, { url: e.request.url, method: e.request.method, type: e.type }),
    );
    cdp.on("Network.loadingFinished", (e) => {
      const r = reqs.get(e.requestId);
      if (r) r.bytes = e.encodedDataLength;
    });
    await page.goto(base + path, { waitUntil: "load", timeout: 120_000 });
    await page
      .waitForFunction(
        (hasImg) => window.__p.content && (window.__p.img || !hasImg),
        sel.img !== "null",
        { timeout: 90_000 },
      )
      .catch(() => console.warn(`  ${path}: innehållet syntes inte inom 90 s`));
    await page.waitForTimeout(1500);
    const p = await page.evaluate(() => {
      const res = performance.getEntriesByType("resource");
      const data = res.filter((e) => /supabase\.co\/(rest|auth)/.test(e.name));
      const js = res.filter((e) => e.name.endsWith(".js"));
      return {
        ...window.__p,
        tbt: window.__p.lt.reduce((a, d) => a + Math.max(0, d - 50), 0),
        jsDone: Math.max(0, ...js.map((e) => e.responseEnd)),
        dataStart: data.length ? Math.min(...data.map((e) => e.startTime)) : 0,
        dataEnd: data.length ? Math.max(...data.map((e) => e.responseEnd)) : 0,
      };
    });
    const list = [...reqs.values()].filter((r) => r.bytes != null);
    const kb = (type) =>
      Math.round(
        list.filter((r) => !type || r.type === type).reduce((a, r) => a + r.bytes, 0) / 1024,
      );
    rs.push({
      ...p,
      requests: list.length,
      // Innehåll kan inte synas före första ritningen, även om det redan finns i HTML:en.
      content: p.content && Math.max(p.content, p.fcp),
      img: p.img && Math.max(p.img, p.fcp),
      kbJs: kb("Script"),
      kbCss: kb("Stylesheet"),
      kbFont: kb("Font"),
      kbImg: kb("Image"),
      kbTotal: kb(),
      data: list
        .filter((r) => r.url.includes("supabase.co") && r.method !== "OPTIONS")
        .map((r) => `${r.method} ${shortUrl(r.url)}`),
    });
    await ctx.close();
  }
  const m = (k) => median(rs.map((r) => r[k]));
  const last = rs[rs.length - 1];
  console.log(`## ${path}`);
  console.log(
    `   FCP ${m("fcp")} | JS klart ${m("jsDone")} | data ${m("dataStart")}–${m("dataEnd")} | innehåll ${m("content")} | första bild ${m("img")} | LCP ${m("lcp")} (${last.lcpEl})`,
  );
  console.log(
    `   CLS ${rs.map((r) => r.cls.toFixed(3)).join(" / ")} | TBT ${m("tbt")} | innehåll per körning ${rs.map((r) => Math.round(r.content)).join(" / ")}`,
  );
  console.log(
    `   ${last.requests} anrop, KB överfört: JS ${last.kbJs}, CSS ${last.kbCss}, typsnitt ${last.kbFont}, bilder ${last.kbImg}, totalt ${last.kbTotal}`,
  );
  for (const s of last.shifts)
    console.log(`   layoutskifte ${s.v} vid ${s.t} ms: ${s.src.join(", ")}`);
  for (const d of last.data) console.log(`   ${d}`);
  console.log("");
}
await browser.close();
