import { QueryClient } from "@tanstack/react-query";
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
    defaultPreloadStaleTime: 0,
  });

  return router;
};
