import { Link } from "@tanstack/react-router";
import { Heart, Menu, MessageSquare, Moon, Plus, Scale, Sun, User } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { useCompare } from "@/hooks/useCompare";

const NAV = [
  { to: "/sok", label: "Sök & jämför" },
  { to: "/hyra/slapvagn", label: "Släpvagn" },
  { to: "/hyra/verktyg", label: "Verktyg" },
  { to: "/hyra/kamera", label: "Kamera" },
];

export function Header() {
  const { dark, toggle } = useTheme();
  const { user } = useAuth();
  const { items } = useCompare();
  const [open, setOpen] = useState(false);

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
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="rounded-full px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Växla mörkt läge">
            {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
          <Link to="/jamfor" className="relative hidden sm:block">
            <Button variant="ghost" size="icon" aria-label="Jämför">
              <Scale className="h-5 w-5" />
            </Button>
            {items.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 w-4 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                {items.length}
              </span>
            )}
          </Link>
          <Link to="/favoriter" className="hidden sm:block">
            <Button variant="ghost" size="icon" aria-label="Favoriter">
              <Heart className="h-5 w-5" />
            </Button>
          </Link>
          <Link to="/meddelanden" className="hidden sm:block">
            <Button variant="ghost" size="icon" aria-label="Meddelanden">
              <MessageSquare className="h-5 w-5" />
            </Button>
          </Link>
          <Link to="/hyr-ut" className="hidden sm:block">
            <Button className="rounded-full" size="sm">
              <Plus className="mr-1 h-4 w-4" /> Hyr ut
            </Button>
          </Link>
          <Link to={user ? "/konto" : "/auth"} className="hidden sm:block">
            <Button variant="outline" size="sm" className="rounded-full">
              <User className="mr-1 h-4 w-4" /> {user ? "Mitt konto" : "Logga in"}
            </Button>
          </Link>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="sm:hidden" aria-label="Meny">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <div className="mt-8 flex flex-col gap-1">
                {[
                  { to: "/sok", label: "Sök & jämför" },
                  { to: "/hyr-ut", label: "+ Hyr ut" },
                  { to: "/bokningar", label: "Bokningar" },
                  { to: "/meddelanden", label: "Meddelanden" },
                  { to: "/favoriter", label: "Favoriter" },
                  { to: "/jamfor", label: "Jämför" },
                  { to: user ? "/konto" : "/auth", label: user ? "Mitt konto" : "Logga in" },
                  { to: "/admin", label: "Admin" },
                ].map((n) => (
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
