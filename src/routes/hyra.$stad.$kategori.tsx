import { createFileRoute } from "@tanstack/react-router";
import { SearchExperience } from "@/components/SearchExperience";
import { CATEGORY_SYNONYMS } from "@/lib/search-parse";
import { cityBySlug } from "@/lib/geo";

export const Route = createFileRoute("/hyra/$stad/$kategori")({
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
      ],
    };
  },
  component: CityCategoryPage,
});

function CityCategoryPage() {
  const { stad, kategori } = Route.useParams();
  const city = cityBySlug(stad)?.name ?? "Stockholm";
  const name = CATEGORY_SYNONYMS[kategori]?.name ?? kategori;
  return (
    <SearchExperience
      initialCategory={kategori}
      initialCity={city}
      initialText={`${name} ${city}`}
      title={`Hyra ${name.toLowerCase()} i ${city}`}
    />
  );
}
