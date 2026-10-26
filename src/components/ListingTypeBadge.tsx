import { LISTING_TYPE_LABEL } from "@/lib/pricing";
import type { ListingType } from "@/lib/providers/types";
import { cn } from "@/lib/utils";

export function ListingTypeBadge({ type, className }: { type: ListingType; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold",
        type === "sale" ? "bg-primary text-primary-foreground" : "bg-foreground/85 text-background",
        className,
      )}
    >
      {LISTING_TYPE_LABEL[type]}
    </span>
  );
}
