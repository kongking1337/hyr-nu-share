import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { DEFAULTS, cleanParams, type SearchParams } from "./params";

/**
 * Synkar filterläget med URL:en så att sökningar är delbara och att
 * filter + scrollposition bevaras när man går tillbaka från en detaljsida.
 */
export function useUrlSearchState(current: SearchParams) {
  const navigate = useNavigate();

  const patch = useCallback(
    (p: Partial<SearchParams>) => {
      const next: SearchParams = { ...current, ...p };
      if (!("page" in p)) next.page = 1;
      void navigate({ to: ".", search: cleanParams(next), replace: false, resetScroll: false });
    },
    [current, navigate],
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
