import { ImagePlus, Loader2, Star, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MAX_PHOTOS, PhotoError, photoUrl, uploadPhoto } from "@/lib/photos";
import { cn } from "@/lib/utils";

/**
 * Välj bilder från mobilen eller datorn. Bilderna laddas upp direkt; den första är omslagsbild.
 * `onRemove` får sökvägen till bilder som tas bort, så att formuläret kan städa upp.
 */
export function PhotoUploader({
  userId,
  value,
  onChange,
  onRemove,
  onUploaded,
  onBusyChange,
}: {
  userId: string;
  value: string[];
  onChange: (next: string[]) => void;
  onRemove: (path: string) => void;
  onUploaded: (path: string) => void;
  onBusyChange: (busy: boolean) => void;
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

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {value.map((src, i) => (
          <div
            key={src}
            className="group relative aspect-square overflow-hidden rounded-2xl bg-muted"
          >
            <img src={photoUrl(src)} alt={`Bild ${i + 1}`} className="h-full w-full object-cover" />
            {i === 0 ? (
              <span className="absolute left-1.5 top-1.5 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-semibold">
                Omslagsbild
              </span>
            ) : (
              <button
                type="button"
                disabled={!!progress}
                onClick={() => makeCover(i)}
                className="absolute left-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-background/90"
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
              className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-background/90"
              aria-label={`Ta bort bild ${i + 1}`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        {room > 0 && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={!!progress}
            className={cn(
              "flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground",
              progress && "opacity-60",
            )}
          >
            {progress ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <ImagePlus className="h-5 w-5" />
            )}
            {progress ? `${progress.done} av ${progress.total}` : "Lägg till"}
          </button>
        )}
      </div>
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
        Upp till {MAX_PHOTOS} bilder. Den första blir omslagsbild. Bilderna förminskas och
        platsinformation tas bort innan de laddas upp.
      </p>
      {value.length === 0 && (
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          onClick={() => input.current?.click()}
        >
          <ImagePlus className="mr-1 h-4 w-4" /> Välj bilder
        </Button>
      )}
    </div>
  );
}
