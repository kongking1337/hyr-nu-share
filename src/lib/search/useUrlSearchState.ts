import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { DEFAULTS, cleanParams, type SearchParams } from "./params";

/**
 * Synkar filterläget med URL:en så att sökningar är delbara och att
 * filter + scrollposition bevaras när man går tillbaka från en detaljsida.
 *
 * `pinned` är filter som sidans adress bestämmer (t.ex. kategorin på /hyra/$kategori).
 * Ändras ett sådant filter går vi vidare till /sok med alla filter.
 */
export function useUrlSearchState(current: SearchParams, pinned: Array<keyof SearchParams> = []) {
  const navigate = useNavigate();

  const patch = useCallback(
    (p: Partial<SearchParams>) => {
      const next: SearchParams = { ...current, ...p };
      if (!("page" in p)) next.page = 1;
      const leavesPage = pinned.some((k) => k in p && p[k] !== current[k]);
      void navigate({
        to: leavesPage ? "/sok" : ".",
        search: cleanParams(next) as never,
        replace: false,
        resetScroll: leavesPage,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current, navigate, pinned.join(",")],
  );

  const reset = useCallback(() => {
    void navigate({
      to: ".",
      search: cleanParams({ ...DEFAULTS, q: current.q, view: current.view }),
      resetScroll: false,
    });
  }, [current.q, current.view, navigate]);

  return { patch, reset };
}
