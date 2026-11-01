import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/** 1–5 stjärnor. Med `onChange` blir de knappar för att välja betyg. */
export function Stars({
  value,
  onChange,
  size = "sm",
  className,
}: {
  value: number;
  onChange?: (rating: number) => void;
  size?: "sm" | "lg";
  className?: string;
}) {
  const icon = size === "lg" ? "h-7 w-7" : "h-4 w-4";
  return (
    <span
      className={cn("inline-flex items-center gap-0.5", className)}
      role={onChange ? "radiogroup" : "img"}
      aria-label={onChange ? "Betyg" : `${value} av 5 stjärnor`}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= Math.round(value);
        const star = (
          <Star className={cn(icon, filled ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
        );
        return onChange ? (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={n === value}
            aria-label={`${n} ${n === 1 ? "stjärna" : "stjärnor"}`}
            onClick={() => onChange(n)}
            className="rounded p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {star}
          </button>
        ) : (
          <span key={n}>{star}</span>
        );
      })}
    </span>
  );
}
