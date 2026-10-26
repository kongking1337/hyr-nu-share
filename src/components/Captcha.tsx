import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile ("Jag är inte en robot") på inloggning, registrering och
 * glömt lösenord. Aktiveras när VITE_TURNSTILE_SITE_KEY finns i .env; samma
 * widgets hemliga nyckel läggs in i Supabase (se docs/operations.md).
 */
const SITE_KEY = import.meta.env["VITE_TURNSTILE_SITE_KEY"] as string | undefined;
export const captchaEnabled = !!SITE_KEY;

type Turnstile = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let script: Promise<void> | null = null;
function loadScript(): Promise<void> {
  script ??= new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      script = null;
      reject(new Error("Turnstile kunde inte laddas"));
    };
    document.head.appendChild(el);
  });
  return script;
}

/** En token kan bara användas en gång: montera om komponenten (ändra `key`) efter varje försök. */
export function Captcha({ onToken }: { onToken: (token: string | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  callback.current = onToken;

  useEffect(() => {
    if (!SITE_KEY) return;
    let widget: string | undefined;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile) return;
        widget = window.turnstile.render(box.current, {
          sitekey: SITE_KEY,
          language: "sv",
          callback: (token: string) => callback.current(token),
          "expired-callback": () => callback.current(null),
          "error-callback": () => callback.current(null),
        });
      })
      .catch(() => callback.current(null));
    return () => {
      cancelled = true;
      if (widget && window.turnstile) window.turnstile.remove(widget);
    };
  }, []);

  if (!SITE_KEY) return null;
  return <div ref={box} className="min-h-[65px]" />;
}
