import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

/**
 * Annonsens bilder: en avgränsad huvudbild (4:3, högst 520 px hög) med bläddring
 * och miniatyrer under. Piltangenterna bläddrar när fokus är i galleriet.
 * `images` är färdiga URL:er.
 */
export function PhotoGallery({ images, title }: { images: string[]; title: string }) {
  const [index, setIndex] = useState(0);
  const count = images.length;
  const go = (step: number) => setIndex((i) => (i + step + count) % count);

  function onKeyDown(e: KeyboardEvent) {
    if (count < 2) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    }
  }

  const nav =
    "absolute top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-background/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="space-y-3" onKeyDown={onKeyDown}>
      <div className="relative aspect-[4/3] max-h-[520px] w-full overflow-hidden rounded-2xl bg-muted">
        <img
          src={images[index]}
          alt={count > 1 ? `${title} – bild ${index + 1} av ${count}` : title}
          className="h-full w-full object-contain"
        />
        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              className={cn(nav, "left-3")}
              aria-label="Föregående bild"
            >
              <ChevronLeft aria-hidden className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              className={cn(nav, "right-3")}
              aria-label="Nästa bild"
            >
              <ChevronRight aria-hidden className="h-5 w-5" />
            </button>
            <span
              aria-hidden
              className="absolute bottom-3 right-3 rounded-full bg-background/90 px-2.5 py-1 text-xs font-semibold tabular-nums backdrop-blur"
            >
              {index + 1} / {count}
            </span>
          </>
        )}
      </div>
      {count > 1 && (
        <ul className="flex gap-2 overflow-x-auto p-1" aria-label="Alla bilder">
          {images.map((src, i) => (
            <li key={src} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Visa bild ${i + 1}`}
                aria-current={i === index ? "true" : undefined}
                className={cn(
                  "block h-14 w-[4.5rem] overflow-hidden rounded-xl bg-muted ring-offset-2 ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-16 sm:w-20",
                  i === index ? "ring-2 ring-foreground" : "opacity-60 hover:opacity-100",
                )}
              >
                <img
                  src={src}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
