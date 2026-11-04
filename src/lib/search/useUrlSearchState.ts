import { useCallback, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { DEFAULTS, cleanParams, type SearchParams } from "./params";

/** Text som skrivs tecken för tecken (pris) ska inte ge ett steg bakåt per tangent. */
const TYPED: Array<keyof SearchParams> = ["priceMin", "priceMax"];

/**
 * Synkar filterläget med URL:en så att sökningar är delbara och att
 * filter + scrollposition bevaras när man går tillbaka från en detaljsida.
 *
 * `fixed` är det som kategori- och ortsidorna (/hyra/…) alltid visar. Ändrar besökaren
 * det (en annan kategori, ort eller "Rensa alla") fortsätter sökningen på /sok.
 */
export function useUrlSearchState(current: SearchParams, fixed: Partial<SearchParams> = {}) {
  const navigate = useNavigate();
  const fixedKeys = Object.keys(fixed) as Array<keyof SearchParams>;
  const lastTyped = useRef<string | null>(null);

  const patch = useCallback(
    (p: Partial<SearchParams>) => {
      const next: SearchParams = { ...current, ...p };
      if (!("page" in p)) next.page = 1;
      const leaves = fixedKeys.some((k) => next[k] !== fixed[k]);
      const search = cleanParams(next) as Record<string, unknown>;
      if (!leaves) fixedKeys.forEach((k) => delete search[k]);
      // Första tangenten blir ett eget steg i historiken, resten av samma fält ersätter det.
      const keys = Object.keys(p);
      const typed = keys.length > 0 && keys.every((k) => TYPED.includes(k as keyof SearchParams)) ? keys.join() : null;
      const replace = typed !== null && typed === lastTyped.current;
      lastTyped.current = typed;
      void navigate({
        to: leaves ? "/sok" : ".",
        search: search as never,
        replace: replace && !leaves,
        resetScroll: leaves,
      });
    },
    // fixed är ett nytt objekt vid varje rendering; innehållet styrs av fixedKeys och current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current, navigate, JSON.stringify(fixed)],
  );

  const reset = useCallback(() => {
    void navigate({
      to: fixedKeys.length ? "/sok" : ".",
      search: cleanParams({ ...DEFAULTS, q: current.q, view: current.view }) as never,
      resetScroll: false,
    });
  }, [current.q, current.view, navigate, fixedKeys.length]);

  return { patch, reset };
}
