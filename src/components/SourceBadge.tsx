import { Globe, ShieldCheck } from "lucide-react";
import type { UnifiedResult } from "@/lib/providers/types";
import { cn } from "@/lib/utils";

export function SourceBadge({ source, className }: { source: UnifiedResult["source"]; className?: string }) {
  const internal = source.kind === "internal";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium",
        internal
          ? "bg-primary/12 text-primary"
          : "bg-accent/30 text-accent-foreground dark:bg-accent/20 dark:text-accent",
        className,
      )}
    >
      {internal ? <ShieldCheck className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
      {internal ? `På ${source.name}` : `Från extern webbplats · ${source.name}`}
    </span>
  );
}
