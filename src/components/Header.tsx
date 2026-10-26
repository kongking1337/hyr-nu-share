import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Heart, LayoutList, Menu, MessageSquare, Moon, Plus, Search, Sun, User } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useTheme } from "@/hooks/useTheme";
import { DEFAULTS } from "@/lib/search/params";

export function Header() {
  const { dark, toggle } = useTheme();
  const { user } = useAuth();
  const isAdmin = useIsAdmin();
  const [open, setOpen] = useState(false);

  const { data: unread = 0 } = useQuery({
    queryKey: ["unread-count", user?.id],
    enabled: !!user,
    refetchInterval: 60_000,
    queryFn: async () => (await supabase.rpc("unread_conversation_count")).data ?? 0,
  });

  const mobileLinks = [
    { to: "/sok", label: "Sök" },
    { to: "/ny-annons", label: "+ Lägg upp annons" },
    ...(user ? [{ to: "/mina-annonser", label: "Mina annonser" }] : []),
    { to: "/meddelanden", label: unread ? `Meddelanden (${unread} olästa)` : "Meddelanden" },
    { to: "/favoriter", label: "Favoriter" },
    { to: user ? "/konto" : "/auth", label: user ? "Mitt konto" : "Logga in" },
    ...(isAdmin ? [{ to: "/admin", label: "Admin" }] : []),
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-2xl bg-primary text-primary-foreground font-display text-lg font-bold">
            H
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">Hyrkoll</span>
        </Link>

        <nav className="ml-4 hidden items-center gap-1 md:flex">
          <Link
            to="/sok"
            search={DEFAULTS}
            className="flex items-center gap-1 rounded-full px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Search className="h-4 w-4" /> Sök
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Växla mörkt läge">
            {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
          <Link to="/favoriter" className="hidden sm:block">
            <Button variant="ghost" size="icon" aria-label="Favoriter">
              <Heart className="h-5 w-5" />
            </Button>
          </Link>
          <Link to="/meddelanden" search={{}} className="relative hidden sm:block">
            <Button variant="ghost" size="icon" aria-label={unread ? `Meddelanden, ${unread} olästa` : "Meddelanden"}>
              <MessageSquare className="h-5 w-5" />
            </Button>
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                {unread}
              </span>
            )}
          </Link>
          {user && (
            <Link to="/mina-annonser" className="hidden md:block">
              <Button variant="ghost" size="sm" className="rounded-full">
                <LayoutList className="mr-1 h-4 w-4" /> Mina annonser
              </Button>
            </Link>
          )}
          <Link to="/ny-annons" className="hidden sm:block">
            <Button className="rounded-full" size="sm">
              <Plus className="mr-1 h-4 w-4" /> Lägg upp annons
            </Button>
          </Link>
          <Link to={user ? "/konto" : "/auth"} className="hidden sm:block">
            <Button variant="outline" size="sm" className="rounded-full">
              <User className="mr-1 h-4 w-4" /> {user ? "Mitt konto" : "Logga in"}
            </Button>
          </Link>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="relative sm:hidden" aria-label={unread ? `Meny, ${unread} olästa meddelanden` : "Meny"}>
                <Menu className="h-5 w-5" />
                {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <div className="mt-8 flex flex-col gap-1">
                {mobileLinks.map((n) => (
                  <Link
                    key={n.to}
                    to={n.to}
                    onClick={() => setOpen(false)}
                    className="rounded-xl px-3 py-3 text-sm hover:bg-muted"
                  >
                    {n.label}
                  </Link>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
