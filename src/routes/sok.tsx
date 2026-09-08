import { createFileRoute } from "@tanstack/react-router";
import { SearchExperience } from "@/components/SearchExperience";

type SokSearch = { q?: string };

export const Route = createFileRoute("/sok")({
  validateSearch: (search: Record<string, unknown>): SokSearch => ({
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sök och jämför uthyrning – Hyrkoll" },
      {
        name: "description",
        content:
          "Jämför totalpris, avgifter, deposition och avstånd för uthyrning från privatpersoner, företag och externa källor.",
      },
      { property: "og:title", content: "Sök och jämför uthyrning – Hyrkoll" },
      { property: "og:description", content: "Sortera på verklig totalkostnad." },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const { q } = Route.useSearch();
  return <SearchExperience initialText={q ?? ""} />;
}
