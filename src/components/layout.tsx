import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const WIDTHS = {
  /** Formulär för inloggning och liknande. */
  narrow: "max-w-md",
  /** Läsbar text och enkla formulär: konto, villkor, avtal. */
  text: "max-w-3xl",
  /** Listor och sidor med en spalt till vänster/höger. */
  default: "max-w-5xl",
  /** Rutnät med annonser, sökresultat, admin. */
  wide: "max-w-6xl",
} as const;

/** Sidans ram: samma marginaler och luft överallt. Se docs/design.md. */
export function Page({
  width = "default",
  className,
  children,
}: {
  width?: keyof typeof WIDTHS;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full px-4 py-8 sm:px-6 sm:py-12", WIDTHS[width], className)}>{children}</div>
  );
}

/** Sidrubrik med valfri beskrivning och knappar till höger. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-8 flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-bold leading-tight sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Tomt läge: säg vad som saknas och vad man kan göra. */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-12 text-center",
        className,
      )}
    >
      {Icon && (
        <span className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-accent text-primary">
          <Icon className="h-6 w-6" />
        </span>
      )}
      <p className="font-display text-lg font-bold">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Laddar: grå rader i ungefär innehållets form. */
export function LoadingRows({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} aria-busy="true" aria-label="Laddar">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-4 rounded-2xl border border-border p-4">
          <Skeleton className="h-16 w-16 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2 py-1">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Laddar: rutnät med annonskort. */
export function LoadingCards({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3", className)} aria-busy="true" aria-label="Laddar">
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <Skeleton className="aspect-[4/3] rounded-2xl" />
          <Skeleton className="mt-3 h-4 w-3/4" />
          <Skeleton className="mt-2 h-4 w-1/3" />
        </div>
      ))}
    </div>
  );
}
