import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LogOut, Moon, Plus, Search, Sun, User } from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNotificationCounts } from "@/hooks/useNotificationCounts";
import { useTheme } from "@/hooks/useTheme";
import { DEFAULTS, cleanParams } from "@/lib/search/params";
import { interpretQuery } from "@/lib/search/parse-query";
import { pushRecentSearch } from "@/lib/search/suggest";
import { signOut } from "@/lib/sign-out";
import { cn } from "@/lib/utils";

/** Ordmärket "hyrkoll." */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display text-2xl font-extrabold tracking-tight", className)}>
      hyrkoll<span className="text-primary">.</span>
    </span>
  );
}

export function Count({ n, className }: { n: number; className?: string }) {
  if (n <= 0) return null;
  return (
    <span
      className={cn(
        "grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-none text-primary-foreground",
        className,
      )}
    >
      {n}
    </span>
  );
}

function HeaderSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const intent = interpretQuery(q);
        pushRecentSearch(q);
        setQ("");
        void navigate({
          to: "/sok",
          search: cleanParams({ ...DEFAULTS, ...intent.patch, q }) as never,
        });
      }}
      className="hidden w-full max-w-sm items-center gap-2 rounded-full border border-input bg-card px-4 focus-within:ring-2 focus-within:ring-ring md:flex"
    >
      <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Vad vill du hyra?"
        aria-label="Sök bland saker att hyra"
        className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </form>
  );
}

function AccountMenu() {
  const navigate = useNavigate();
  const href = useRouterState({ select: (s) => s.location.href });
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { dark, toggle } = useTheme();
  const { user, isAdmin, unread, pendingBookings, openReports } = useNotificationCounts();
  const total = unread + pendingBookings + openReports;
  const initial = (user?.email ?? "?").slice(0, 1).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="relative flex h-10 items-center gap-2 rounded-full border border-border bg-card pl-3 pr-1 text-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        // Namnet börjar med den synliga texten, så att röststyrning ("Logga in") hittar knappen.
        aria-label={`${user ? "Konto" : "Logga in"}${total ? `, ${total} saker att se` : ""}`}
      >
        <span className="hidden sm:inline">{user ? "Konto" : "Logga in"}</span>
        <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {user ? initial : <User className="h-4 w-4" />}
        </span>
        {total > 0 && (
          <Count n={total} className="absolute -right-1.5 -top-1.5 ring-2 ring-background" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {user ? (
          <>
            <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
              {user.email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/bokningar" className="justify-between">
                Bokningar <Count n={pendingBookings} />
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/meddelanden" search={{}} className="justify-between">
                Meddelanden <Count n={unread} />
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/mina-annonser">Mina annonser</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/favoriter">Favoriter och sparade sökningar</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/konto">Mitt konto</Link>
            </DropdownMenuItem>
            {isAdmin && (
              <DropdownMenuItem asChild>
                <Link to="/admin" className="justify-between">
                  Moderering <Count n={openReports} />
                </Link>
              </DropdownMenuItem>
            )}
          </>
        ) : (
          <>
            <DropdownMenuItem asChild>
              <Link to="/auth" search={pathname === "/auth" ? {} : { redirect: href }}>
                Logga in eller skapa konto
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/favoriter">Favoriter</Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            toggle();
          }}
        >
          {dark ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
          {dark ? "Ljust läge" : "Mörkt läge"}
        </DropdownMenuItem>
        {user && (
          <DropdownMenuItem
            onSelect={async () => {
              await signOut();
              void navigate({ to: "/" });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" /> Logga ut
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Header() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const showSearch = pathname !== "/" && pathname !== "/sok" && !pathname.startsWith("/hyra/");

  return (
    <header className="print:hidden sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link to="/" aria-label="Hyrkoll, till startsidan" className="shrink-0">
          <Wordmark />
        </Link>
        {showSearch && <HeaderSearch />}
        <div className="ml-auto flex items-center gap-2">
          <Link
            to="/ny-annons"
            className="hidden items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90 sm:flex"
          >
            <Plus className="h-4 w-4" /> Hyr ut
          </Link>
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
