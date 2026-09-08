import { createFileRoute } from "@tanstack/react-router";
import { SearchResultsPage } from "@/components/search/SearchResultsPage";
import { CATEGORY_SYNONYMS } from "@/lib/search-parse";
import { validateSearchParams } from "@/lib/search/params";
import { useUrlSearchState } from "@/lib/search/useUrlSearchState";

export const Route = createFileRoute("/hyra/$kategori")({
  validateSearch: validateSearchParams,
  head: ({ params }) => {
    const name = CATEGORY_SYNONYMS[params.kategori]?.name ?? params.kategori;
    const title = `Hyra ${name.toLowerCase()} – jämför priser | Hyrkoll`;
    const description = `Jämför uthyrning av ${name.toLowerCase()} i hela Sverige. Se totalpris inklusive avgifter, deposition och leverans.`;
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
      intro={`Jämför ${name.toLowerCase()} från privatpersoner, företag och externa källor. Priserna visas som verkligt totalpris för din period.`}
    />
  );
}
