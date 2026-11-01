import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { SearchResultsPage } from "@/components/search/SearchResultsPage";
import { DEFAULTS, validateSearchParams } from "@/lib/search/params";
import { useUrlSearchState } from "@/lib/search/useUrlSearchState";

export const Route = createFileRoute("/sok")({
  validateSearch: validateSearchParams,
  search: { middlewares: [stripSearchParams(DEFAULTS)] },
  head: () => ({
    meta: [
      { title: "Sök annonser i Stockholm – Hyrkoll" },
      {
        name: "description",
        content:
          "Sök på vanlig svenska bland saker som hyrs ut i Stockholms län. Filtrera på kategori, plats och pris.",
      },
      { property: "og:title", content: "Sök annonser i Stockholm – Hyrkoll" },
      { property: "og:description", content: "Hyr och hyr ut saker i Stockholms län." },
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
