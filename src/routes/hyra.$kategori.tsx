import { createFileRoute } from "@tanstack/react-router";
import { SearchExperience } from "@/components/SearchExperience";
import { CATEGORY_SYNONYMS } from "@/lib/search-parse";

export const Route = createFileRoute("/hyra/$kategori")({
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
      ],
    };
  },
  component: CategoryPage,
});

function CategoryPage() {
  const { kategori } = Route.useParams();
  const name = CATEGORY_SYNONYMS[kategori]?.name ?? kategori;
  return (
    <SearchExperience
      initialCategory={kategori}
      initialText={name}
      title={`Hyra ${name.toLowerCase()}`}
    />
  );
}
