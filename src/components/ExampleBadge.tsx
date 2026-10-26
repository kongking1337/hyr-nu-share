import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/** Märker exempelannonser (demodata utan riktig ägare) så att ingen tror att de är riktiga. */
export function ExampleBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-900 dark:bg-amber-900/60 dark:text-amber-100",
        className,
      )}
      title="Exempelannons som visar hur sajten fungerar. Den går inte att boka eller kontakta."
    >
      <Info className="h-3 w-3" /> Exempelannons
    </span>
  );
}
