import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import { PhotoUploader } from "@/components/PhotoUploader";
import { supabase } from "@/integrations/supabase/client";
import { userMessage } from "@/lib/db-errors";
import { PHOTO_BUCKET, photoUrl } from "@/lib/photos";

type Stage = "pickup" | "return";

/**
 * Bilder på sakens skick vid utlämning och återlämning. Var och en styr sina egna
 * bilder; den andras visas bara. Varje ändring sparas direkt (set_booking_photos).
 */
export function BookingPhotos({
  bookingId,
  userId,
  pickupPhotos,
  returnPhotos,
  showReturn,
  onSaved,
}: {
  bookingId: string;
  userId: string;
  pickupPhotos: string[];
  returnPhotos: string[];
  showReturn: boolean;
  onSaved: () => void;
}) {
  return (
    <div className="space-y-5 rounded-2xl bg-muted/50 p-4 sm:p-5">
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <Camera className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        Fota skicket så att ni båda har bevis om något går sönder.
      </p>
      <StagePhotos
        title="Vid utlämning"
        stage="pickup"
        bookingId={bookingId}
        userId={userId}
        photos={pickupPhotos}
        onSaved={onSaved}
      />
      {showReturn && (
        <StagePhotos
          title="Vid återlämning"
          stage="return"
          bookingId={bookingId}
          userId={userId}
          photos={returnPhotos}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

function StagePhotos({
  title,
  stage,
  bookingId,
  userId,
  photos,
  onSaved,
}: {
  title: string;
  stage: Stage;
  bookingId: string;
  userId: string;
  photos: string[];
  onSaved: () => void;
}) {
  const mine = photos.filter((p) => p.startsWith(`${userId}/`));
  const theirs = photos.filter((p) => !p.startsWith(`${userId}/`));
  // Lokalt läge så att uppladdningar syns direkt, även innan listan hämtats på nytt.
  const [value, setValue] = useState<string[] | null>(null);
  const current = value ?? mine;
  // Sparningar körs en i taget, så att den senaste listan alltid är den som gäller.
  const queue = useRef<Promise<void>>(Promise.resolve());

  function save(next: string[], removed: string[] = []) {
    setValue(next);
    queue.current = queue.current.then(() => store(next, removed));
  }

  async function store(next: string[], removed: string[]) {
    const { error } = await supabase.rpc("set_booking_photos", {
      _booking_id: bookingId,
      _stage: stage,
      _paths: next,
    });
    if (error) {
      toast.error(userMessage(error, "Bilderna kunde inte sparas."));
      setValue(null);
      return;
    }
    if (removed.length) void supabase.storage.from(PHOTO_BUCKET).remove(removed);
    onSaved();
  }

  return (
    <div className="space-y-3">
      <h4 className="font-sans text-sm font-semibold tracking-normal">{title}</h4>
      {theirs.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Den andras bilder</p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {theirs.map((p) => (
              <a
                key={p}
                href={photoUrl(p)}
                target="_blank"
                rel="noreferrer"
                className="block aspect-square overflow-hidden rounded-xl bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <img
                  src={photoUrl(p)}
                  alt="Den andras bild"
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </a>
            ))}
          </div>
        </div>
      )}
      {theirs.length > 0 && <p className="text-xs text-muted-foreground">Dina bilder</p>}
      <PhotoUploader
        userId={userId}
        value={current}
        onChange={(next) => {
          // Borttagningar sparas i onRemove; här sparas nya bilder och ny ordning.
          if (next.length >= current.length) save(next);
        }}
        onUploaded={() => undefined}
        onRemove={(path) =>
          save(
            current.filter((p) => p !== path),
            [path],
          )
        }
        onBusyChange={() => undefined}
        cover={false}
      />
    </div>
  );
}
