import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import appCss from "../styles.css?url";
import { BottomTabs } from "@/components/BottomTabs";
import { Header, Wordmark } from "@/components/Header";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-extrabold text-primary">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Sidan finns inte</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Sidan du letar efter finns inte eller har flyttats.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Till startsidan
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Sidan kunde inte visas
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Något gick fel hos oss. Försök igen eller gå tillbaka till startsidan.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Försök igen
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-full border border-input bg-background px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Till startsidan
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Hyrkoll – hyr och hyr ut saker i Stockholm" },
      {
        name: "description",
        content:
          "Hyr saker av privatpersoner och företag i Stockholms län – verktyg, släpvagnar, barnsaker och mycket mer.",
      },
      { name: "author", content: "Hyrkoll" },
      { property: "og:title", content: "Hyrkoll – hyr och hyr ut saker i Stockholm" },
      { property: "og:description", content: "Hyr saker av privatpersoner och företag i Stockholms län." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="sv">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  // Meddelandetråden fyller mobilskärmen; där behövs ingen sidfot under.
  const inThread = useRouterState({
    select: (s) => s.location.pathname === "/meddelanden" && !!(s.location.search as { c?: string }).c,
  });

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Header />
      <main className="min-h-[70vh]">
        <Outlet />
      </main>
      <footer className={`mt-20 border-t border-border pb-28 pt-10 md:pb-12 print:hidden ${inThread ? "max-md:hidden" : ""}`}>
        <div className="mx-auto grid max-w-6xl gap-6 px-4 text-sm text-muted-foreground sm:px-6 md:grid-cols-[1fr_auto]">
          <div className="max-w-xl">
            <Wordmark className="text-xl text-foreground" />
            <p className="mt-2">
              Hyr och hyr ut saker bland privatpersoner och företag i Stockholms län. Hyrkoll är under
              utveckling: annonser märkta "Exempelannons" visar hur sajten fungerar. Hyrkoll tar inga
              avgifter och förmedlar inga betalningar.
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-2 md:flex-col" aria-label="Om Hyrkoll">
            <Link to="/villkor" className="hover:text-foreground hover:underline">Användarvillkor</Link>
            <Link to="/integritet" className="hover:text-foreground hover:underline">Integritetspolicy</Link>
            <Link to="/kontakt" className="hover:text-foreground hover:underline">Kontakt</Link>
          </nav>
        </div>
      </footer>
      <BottomTabs />
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}
