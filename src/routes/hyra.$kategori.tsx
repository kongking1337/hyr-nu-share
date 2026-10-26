import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { SearchResultsPage } from "@/components/search/SearchResultsPage";
import { CATEGORY_SYNONYMS } from "@/lib/search-parse";
import { DEFAULTS, validateSearchParams } from "@/lib/search/params";
import { useUrlSearchState } from "@/lib/search/useUrlSearchState";

export const Route = createFileRoute("/hyra/$kategori")({
  validateSearch: validateSearchParams,
  search: { middlewares: [stripSearchParams(DEFAULTS)] },
  head: ({ params }) => {
    const name = CATEGORY_SYNONYMS[params.kategori]?.name ?? params.kategori;
    const title = `Hyra ${name.toLowerCase()} – jämför priser | Hyrkoll`;
    const description = `Hyr ${name.toLowerCase()} av privatpersoner och företag. Jämför pris, plats och leverans.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: CategoryPage,
});

function CategoryPage() {
  const { kategori } = Route.useParams();
  const search = Route.useSearch();
  const params = { ...search, category: kategori };
  const { patch, reset } = useUrlSearchState(params);
  const name = CATEGORY_SYNONYMS[kategori]?.name ?? kategori;
  return (
    <SearchResultsPage
      params={params}
      patch={patch}
      reset={reset}
      heading={`Hyra ${name.toLowerCase()}`}
      intro={`Hyr ${name.toLowerCase()} av privatpersoner och företag. Priset visas för hela din period.`}
    />
  );
}
