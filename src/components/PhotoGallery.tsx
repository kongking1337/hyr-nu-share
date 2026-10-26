import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** Stor bild med bläddring och miniatyrer. `images` är färdiga URL:er. */
export function PhotoGallery({ images, title }: { images: string[]; title: string }) {
  const [index, setIndex] = useState(0);
  const count = images.length;
  const go = (step: number) => setIndex((i) => (i + step + count) % count);

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-3xl bg-muted">
        <img
          src={images[index]}
          alt={count > 1 ? `${title} – bild ${index + 1} av ${count}` : title}
          className="aspect-[4/3] w-full object-contain"
        />
        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-background/90 shadow"
              aria-label="Föregående bild"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-background/90 shadow"
              aria-label="Nästa bild"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <span className="absolute bottom-3 right-3 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium">
              {index + 1} / {count}
            </span>
          </>
        )}
      </div>
      {count > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Visa bild ${i + 1}`}
              className={cn(
                "h-16 w-20 shrink-0 overflow-hidden rounded-xl border-2",
                i === index ? "border-primary" : "border-transparent opacity-70 hover:opacity-100",
              )}
            >
              <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
