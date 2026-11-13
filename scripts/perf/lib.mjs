// Gemensamt för mätskripten: profiler (dator/mobil), webbläsarstart och hjälpfunktioner.
// Se docs/performance-review.md för hur skripten körs.
import { chromium } from "playwright-core";

export const PROFILES = {
  /** Dator utan strypning. */
  desktop: {
    context: { viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 },
    cpu: 1,
    net: null,
  },
  /** Mobil på bra 4G: 150 ms latens, 9 Mbit/s, CPU 4× långsammare (mellanklassmobil). */
  mobile4g: {
    context: {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    },
    cpu: 4,
    net: {
      latency: 150,
      downloadThroughput: (9 * 1024 * 1024) / 8,
      uploadThroughput: (1.5 * 1024 * 1024) / 8,
    },
  },
  /** Mobil på svagt 4G (samma som Lighthouse "Slow 4G"): 562 ms, 1,44 Mbit/s, CPU 4×. */
  slow4g: {
    context: {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    },
    cpu: 4,
    net: {
      latency: 562.5,
      downloadThroughput: (1.44 * 1024 * 1024) / 8,
      uploadThroughput: (675 * 1024) / 8,
    },
  },
};

/** --namn=värde och lösa argument. */
export function parseArgs(argv) {
  const opts = {};
  const rest = [];
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) opts[m[1]] = m[2];
    else rest.push(a);
  }
  return { opts, rest };
}

/** Brave/Chrome: BROWSER_PATH om den finns, annars installerad Chrome. */
export function launch() {
  const executablePath = process.env.BROWSER_PATH;
  return chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : { channel: "chrome" }),
  });
}

/** Ny, tom webbläsarprofil med profilens skärm, nät och CPU. */
export async function newPage(browser, profile, { disableCache = false, initScript } = {}) {
  const ctx = await browser.newContext({ ...profile.context, locale: "sv-SE" });
  if (initScript) await ctx.addInitScript(initScript);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  if (disableCache) await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  if (profile.net)
    await cdp.send("Network.emulateNetworkConditions", { offline: false, ...profile.net });
  if (profile.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu });
  return { ctx, page, cdp };
}

export const median = (values) => {
  const s = values.filter((v) => typeof v === "number" && v > 0).sort((a, b) => a - b);
  return s.length ? Math.round(s[Math.floor(s.length / 2)]) : null;
};

/** Kortar adresser i utskrifter: [supabase], [unsplash] eller sökvägen. */
export function shortUrl(url) {
  const u = new URL(url);
  const host = u.host.includes("supabase.co")
    ? "[supabase]"
    : u.host.includes("unsplash")
      ? "[unsplash]"
      : "";
  return `${host}${u.pathname}${u.search}`.slice(0, 140);
}
