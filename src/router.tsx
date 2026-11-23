import { QueryClient, dehydrate, hydrate, type DehydratedState } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Har databasen svarat med ett fel (t.ex. ett ogiltigt id) hjälper det inte att fråga
        // igen; då visas felet direkt. Nätverksfel (utan felkod) provas två gånger till.
        retry: (failureCount, error) => {
          const code = (error as { code?: unknown } | null)?.code;
          if (typeof code === "string" && code !== "") return false;
          return failureCount < 2;
        },
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Koden och datan för nästa sida börjar hämtas när man pekar på eller trycker på en länk.
    defaultPreload: "intent",
    // React Query avgör om datan är färsk; routern kör alltid rutternas loaders.
    defaultPreloadStaleTime: 0,
    // Det som loaders hämtade på servern följer med sidan, så att webbläsaren inte hämtar det igen.
    dehydrate: () => ({ queryClientState: dehydrate(queryClient) as never }),
    hydrate: (dehydrated: { queryClientState: DehydratedState }) => {
      hydrate(queryClient, dehydrated.queryClientState);
    },
  });

  return router;
};
