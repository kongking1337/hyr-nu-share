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
    const title = `Hyra ${name.toLowerCase()} i Stockholm | Hyrkoll`;
    const description = `Hyr ${name.toLowerCase()} av privatpersoner och företag i Stockholms län.`;
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
  // /hyra-sidorna visar bara saker som hyrs ut.
  const params = { ...search, category: kategori, type: "rent" as const };
  const { patch, reset } = useUrlSearchState(params);
  const name = CATEGORY_SYNONYMS[kategori]?.name ?? kategori;
  return (
    <SearchResultsPage
      params={params}
      patch={patch}
      reset={reset}
      heading={`Hyra ${name.toLowerCase()} i Stockholm`}
      intro={`${name} att hyra av privatpersoner och företag i Stockholms län.`}
    />
  );
}
