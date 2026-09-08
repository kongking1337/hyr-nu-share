import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { SearchResultsPage } from "@/components/search/SearchResultsPage";
import { CATEGORY_SYNONYMS } from "@/lib/search-parse";
import { cityBySlug } from "@/lib/geo";
import { DEFAULTS, validateSearchParams } from "@/lib/search/params";
import { useUrlSearchState } from "@/lib/search/useUrlSearchState";

export const Route = createFileRoute("/hyra/$stad/$kategori")({
  validateSearch: validateSearchParams,
  search: { middlewares: [stripSearchParams(DEFAULTS)] },
  head: ({ params }) => {
    const city = cityBySlug(params.stad)?.name ?? params.stad;
    const name = CATEGORY_SYNONYMS[params.kategori]?.name ?? params.kategori;
    const title = `Hyra ${name.toLowerCase()} i ${city} – jämför totalpris | Hyrkoll`;
    const description = `Lediga ${name.toLowerCase()} att hyra i ${city}. Jämför pris, avgifter, avstånd och betyg från privatpersoner och företag.`;
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
  component: CityCategoryPage,
});

function CityCategoryPage() {
  const { stad, kategori } = Route.useParams();
  const search = Route.useSearch();
  const city = cityBySlug(stad);
  const params = { ...search, category: kategori, location: city?.slug ?? search.location };
  const { patch, reset } = useUrlSearchState(params);
  const name = CATEGORY_SYNONYMS[kategori]?.name ?? kategori;
  return (
    <SearchResultsPage
      params={params}
      patch={patch}
      reset={reset}
      heading={`Hyra ${name.toLowerCase()} i ${city?.name ?? stad}`}
      intro={`Se lediga ${name.toLowerCase()} nära ${city?.name ?? stad} med verkligt totalpris, avstånd och betyg.`}
    />
  );
}
