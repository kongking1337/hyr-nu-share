import { Link, useRouterState } from "@tanstack/react-router";
import { CalendarDays, Heart, MessageSquare, Plus, Search } from "lucide-react";
import { Count } from "@/components/Header";
import { useNotificationCounts } from "@/hooks/useNotificationCounts";
import { DEFAULTS } from "@/lib/search/params";
import { cn } from "@/lib/utils";

/** Flikrad längst ner på mobilen. Kontot nås via menyn i sidhuvudet. */
export function BottomTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { unread, pendingBookings } = useNotificationCounts();

  const tabs = [
    { to: "/sok", label: "Sök", icon: Search, search: DEFAULTS },
    { to: "/favoriter", label: "Favoriter", icon: Heart },
    { to: "/ny-annons", label: "Hyr ut", icon: Plus, primary: true },
    { to: "/meddelanden", label: "Meddelanden", icon: MessageSquare, search: {}, count: unread },
    { to: "/bokningar", label: "Bokningar", icon: CalendarDays, count: pendingBookings },
  ];

  return (
    <nav
      aria-label="Huvudmeny"
      className="print:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-5">
        {tabs.map(({ to, label, icon: Icon, search, primary, count = 0 }) => {
          const active = pathname === to || pathname.startsWith(`${to}/`);
          return (
            <li key={to}>
              <Link
                to={to}
                search={search as never}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex flex-col items-center gap-0.5 py-2 text-[11px]",
                  active ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "grid h-7 w-7 place-items-center rounded-full",
                    primary && "bg-primary text-primary-foreground",
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                {label}
                <Count n={count} className="absolute left-1/2 top-1 ml-1.5 h-4 min-w-4 px-1 text-[10px]" />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
