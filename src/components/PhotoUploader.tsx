import { ImagePlus, Loader2, Star, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { MAX_PHOTOS, PhotoError, photoUrl, uploadPhoto } from "@/lib/photos";
import { cn } from "@/lib/utils";

/**
 * Välj bilder från mobilen eller datorn. Bilderna laddas upp direkt; den första är omslagsbild.
 * `onRemove` får sökvägen till bilder som tas bort, så att formuläret kan städa upp.
 * `cover={false}` för bilder utan omslagsbild (t.ex. skicket vid en bokning).
 */
export function PhotoUploader({
  userId,
  value,
  onChange,
  onRemove,
  onUploaded,
  onBusyChange,
  cover = true,
}: {
  userId: string;
  value: string[];
  onChange: (next: string[]) => void;
  onRemove: (path: string) => void;
  onUploaded: (path: string) => void;
  onBusyChange: (busy: boolean) => void;
  cover?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const room = MAX_PHOTOS - value.length;

  async function addFiles(files: File[]) {
    if (!files.length) return;
    if (files.length > room)
      toast.info(`Högst ${MAX_PHOTOS} bilder. De ${files.length - room} sista hoppas över.`);
    const queue = files.slice(0, room);
    const added: string[] = [];
    onBusyChange(true);
    setProgress({ done: 0, total: queue.length });
    for (const [i, file] of queue.entries()) {
      try {
        const path = await uploadPhoto(file, userId);
        onUploaded(path);
        added.push(path);
        onChange([...value, ...added]);
      } catch (e) {
        toast.error(e instanceof PhotoError ? e.message : "Bilden kunde inte laddas upp.");
      }
      setProgress({ done: i + 1, total: queue.length });
    }
    setProgress(null);
    onBusyChange(false);
  }

  const remove = (index: number) => {
    onRemove(value[index]!);
    onChange(value.filter((_, i) => i !== index));
  };
  const makeCover = (index: number) =>
    onChange([value[index]!, ...value.filter((_, i) => i !== index)]);

  const control =
    "grid h-8 w-8 place-items-center rounded-full bg-background/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

  return (
    <div className="space-y-3">
      {value.length === 0 ? (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={!!progress}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-input bg-card px-4 py-8 text-center transition-colors hover:border-primary hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          <span className="grid h-11 w-11 place-items-center rounded-full bg-accent text-primary">
            {progress ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
          </span>
          <span className="font-semibold">
            {progress ? `Laddar upp ${progress.done} av ${progress.total} …` : "Välj bilder"}
          </span>
          <span className="text-xs text-muted-foreground">Från mobilen eller datorn</span>
        </button>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {value.map((src, i) => (
            <li key={src} className="group relative aspect-square overflow-hidden rounded-xl bg-muted">
              <img src={photoUrl(src)} alt={`Bild ${i + 1}`} className="h-full w-full object-cover" />
              {!cover ? null : i === 0 ? (
                <span className="absolute bottom-1.5 left-1.5 rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-semibold backdrop-blur">
                  Omslagsbild
                </span>
              ) : (
                <button
                  type="button"
                  disabled={!!progress}
                  onClick={() => makeCover(i)}
                  className={cn(control, "absolute left-1.5 top-1.5")}
                  aria-label={`Gör bild ${i + 1} till omslagsbild`}
                  title="Gör till omslagsbild"
                >
                  <Star className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                disabled={!!progress}
                onClick={() => remove(i)}
                className={cn(control, "absolute right-1.5 top-1.5")}
                aria-label={`Ta bort bild ${i + 1}`}
                title="Ta bort"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
          {room > 0 && (
            <li>
              <button
                type="button"
                onClick={() => input.current?.click()}
                disabled={!!progress}
                className={cn(
                  "flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-input text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  progress && "opacity-60",
                )}
              >
                {progress ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                {progress ? `${progress.done} av ${progress.total}` : "Lägg till"}
              </button>
            </li>
          )}
        </ul>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void addFiles(files);
        }}
      />
      <p className="text-xs text-muted-foreground">
        Upp till {MAX_PHOTOS} bilder.{cover && " Den första blir omslagsbild."} Bilderna förminskas och
        platsinformation tas bort innan de laddas upp.
      </p>
    </div>
  );
}
