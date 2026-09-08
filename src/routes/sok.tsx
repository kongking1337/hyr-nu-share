import { createFileRoute } from "@tanstack/react-router";
import { SearchResultsPage } from "@/components/search/SearchResultsPage";
import { validateSearchParams } from "@/lib/search/params";
import { useUrlSearchState } from "@/lib/search/useUrlSearchState";

export const Route = createFileRoute("/sok")({
  validateSearch: validateSearchParams,
  head: () => ({
    meta: [
      { title: "Sök och jämför uthyrning – Hyrkoll" },
      {
        name: "description",
        content:
          "Sök på vanlig svenska, filtrera på kategori, plats, radie, datum och pris – och sortera på verkligt totalpris för din hyresperiod.",
      },
      { property: "og:title", content: "Sök och jämför uthyrning – Hyrkoll" },
      { property: "og:description", content: "Sortera på verklig totalkostnad." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const params = Route.useSearch();
  const { patch, reset } = useUrlSearchState(params);
  return <SearchResultsPage params={params} patch={patch} reset={reset} />;
}
