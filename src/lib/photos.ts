import { supabase } from "@/integrations/supabase/client";

/**
 * Annonsbilder i Supabase Storage (bucket "listing-images", se migrationen
 * 20261030120000_listing_photos.sql). `listings.images` innehåller sökvägar som
 * "<användar-id>/<uuid>.webp" (eller .jpg); äldre annonser har hela URL:er.
 */
export const PHOTO_BUCKET = "listing-images";
export const MAX_PHOTOS = 8;
const MAX_SIDE = 1600;
/** Den lilla kopian för kort, rader och miniatyrer. */
const THUMB_SIDE = 480;
// WebP blir ungefär en tredjedel mindre än JPEG vid samma kvalitet. Webbläsare som inte
// kan skapa WebP (t.ex. äldre Safari på iPhone) får JPEG i stället; alla kan visa båda.
const WEBP_QUALITY = 0.8;
const JPEG_QUALITY = 0.82;
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

export const PLACEHOLDER_PHOTO = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#e5e7eb"/><text x="200" y="157" font-family="sans-serif" font-size="20" fill="#6b7280" text-anchor="middle">Ingen bild</text></svg>',
)}`;

export class PhotoError extends Error {}

/** URL att visa för ett värde i `listings.images`. */
export function photoUrl(value: string | null | undefined): string {
  if (!value) return PLACEHOLDER_PHOTO;
  if (/^(https?:|data:)/.test(value)) return value;
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(value).data.publicUrl;
}

/**
 * Samma bild i en viss bredd. Exempelannonsernas bilder (Unsplash) kan hämtas i valfri bredd och i
 * WebP/AVIF; uppladdade bilder finns bara i full storlek och returneras oförändrade.
 */
export function sizedPhotoUrl(url: string, width: number): string {
  if (!url.startsWith("https://images.unsplash.com/")) return url;
  const u = new URL(url);
  u.searchParams.set("w", String(width));
  u.searchParams.set("auto", "format");
  u.searchParams.set("q", "70");
  return u.toString();
}

/** Den lilla kopian som sparas bredvid varje uppladdad bild: "<uuid>.webp" → "<uuid>.thumb.webp". */
export function thumbPath(path: string): string {
  return path.replace(/\.(webp|jpg)$/, ".thumb.$1");
}

const UPLOADED = `/storage/v1/object/public/${PHOTO_BUCKET}/`;

/**
 * src, srcSet och sizes för en <img>, så att webbläsaren hämtar en bild som passar rutan
 * (och skärmens upplösning) i stället för originalet. `sizes` beskriver hur bred rutan är.
 * Uppladdade bilder finns i två storlekar (THUMB_SIDE och MAX_SIDE); bilder som laddades upp
 * innan den lilla kopian fanns faller tillbaka på originalet om kopian saknas.
 */
export function photoSources(url: string, widths: number[], sizes: string) {
  if (url.includes(UPLOADED) && /\.(webp|jpg)$/.test(url)) {
    const original = (img: HTMLImageElement) => {
      if (!img.srcset) return;
      img.removeAttribute("srcset");
      img.src = url;
    };
    return {
      src: url,
      srcSet: `${thumbPath(url)} ${THUMB_SIDE}w, ${url} ${MAX_SIDE}w`,
      sizes,
      onError: (e: { currentTarget: HTMLImageElement }) => original(e.currentTarget),
      // Bilder i serverns HTML kan ha misslyckats innan sidan startade i webbläsaren; det
      // felet når aldrig onError, så kontrollera när bilden kopplas in.
      ref: (img: HTMLImageElement | null) => {
        if (img?.complete && img.naturalWidth === 0) original(img);
      },
    };
  }
  const resized = widths.map((w) => sizedPhotoUrl(url, w));
  if (resized[0] === url) return { src: url };
  return {
    src: resized[resized.length - 1],
    srcSet: resized.map((src, i) => `${src} ${widths[i]}w`).join(", "),
    sizes,
  };
}

export type ShrunkPhoto = { blob: Blob; ext: "webp" | "jpg" };

type Decoded = { source: CanvasImageSource; width: number; height: number; done: () => void };

/**
 * Läser bilden rättvänd. createImageBitmap med "from-image" kräver Safari 16 / Chrome 112;
 * äldre webbläsare (t.ex. iPhone med iOS 15) får gå via ett vanligt <img>, som också
 * vänder bilden enligt EXIF.
 */
async function decodePhoto(file: File): Promise<Decoded> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      done: () => bitmap.close(),
    };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return {
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        done: () => URL.revokeObjectURL(url),
      };
    } catch {
      URL.revokeObjectURL(url);
      throw new PhotoError(
        `${file.name} gick inte att läsa. Prova en bild i JPG- eller PNG-format.`,
      );
    }
  }
}

const encode = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/** Ritar bilden i högst `maxSide` px och sparar som WebP (eller JPEG). */
async function render(image: Decoded, maxSide: number): Promise<ShrunkPhoto> {
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new PhotoError("Bilden kunde inte bearbetas.");
  ctx.imageSmoothingQuality = "high"; // den lilla kopian blir annars taggig
  ctx.fillStyle = "#fff"; // genomskinliga PNG-bilder får vit bakgrund i stället för svart
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image.source, 0, 0, canvas.width, canvas.height);

  // Webbläsare som inte kan skapa WebP lämnar tillbaka PNG, så kontrollera typen.
  const webp = await encode(canvas, "image/webp", WEBP_QUALITY);
  if (webp?.type === "image/webp") return { blob: webp, ext: "webp" };
  const jpeg = await encode(canvas, "image/jpeg", JPEG_QUALITY);
  if (!jpeg) throw new PhotoError("Bilden kunde inte bearbetas.");
  return { blob: jpeg, ext: "jpg" };
}

/**
 * Förminskar till högst 1600 px och sparar om som WebP (eller JPEG), plus en liten kopia på
 * högst 480 px för kort och listor. Det gör bilderna snabba på mobilen och tar bort metadata
 * som GPS-position.
 */
export async function shrinkPhoto(file: File): Promise<{ main: ShrunkPhoto; thumb: ShrunkPhoto }> {
  if (!file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name)) {
    throw new PhotoError(`${file.name} är inte en bild.`);
  }
  if (file.size > MAX_INPUT_BYTES) throw new PhotoError(`${file.name} är för stor (max 25 MB).`);

  const image = await decodePhoto(file);
  try {
    const main = await render(image, MAX_SIDE);
    const thumb = await render(image, THUMB_SIDE);
    return { main, thumb };
  } finally {
    image.done();
  }
}

/**
 * Förminskar och laddar upp en bild till användarens egen mapp, med den lilla kopian bredvid
 * (thumbPath). Returnerar sökvägen till den stora bilden.
 */
export async function uploadPhoto(file: File, userId: string): Promise<string> {
  const { main, thumb } = await shrinkPhoto(file);
  const path = `${userId}/${crypto.randomUUID()}.${main.ext}`;
  const options = { cacheControl: "31536000", upsert: false };
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, main.blob, { ...options, contentType: main.blob.type });
  if (error) throw new PhotoError("Bilden kunde inte laddas upp. Försök igen.");
  // Den lilla kopian är en genväg: misslyckas den visas den stora bilden i stället.
  await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(thumbPath(path), thumb.blob, {
      ...options,
      contentType: thumb.blob.type,
    })
    .catch(() => undefined);
  return path;
}

/** Tar bort egna bilder som ingen av användarens annonser använder längre. */
export async function removeUnusedPhotos(userId: string, candidates: string[]): Promise<void> {
  const own = candidates.filter((p) => p.startsWith(`${userId}/`));
  if (!own.length) return;
  const { data, error } = await supabase.from("listings").select("images").eq("owner_id", userId);
  if (error) return;
  const inUse = new Set((data ?? []).flatMap((l) => l.images ?? []));
  const unused = own.filter((p) => !inUse.has(p));
  if (unused.length) {
    await supabase.storage.from(PHOTO_BUCKET).remove(unused.flatMap((p) => [p, thumbPath(p)]));
  }
}

/** Tar bort alla användarens bilder (när kontot raderas), 1000 filer i taget. */
export async function removeAllMyPhotos(userId: string): Promise<void> {
  for (;;) {
    const { data } = await supabase.storage.from(PHOTO_BUCKET).list(userId, { limit: 1000 });
    const paths = (data ?? []).map((f) => `${userId}/${f.name}`);
    if (!paths.length) return;
    const { error } = await supabase.storage.from(PHOTO_BUCKET).remove(paths);
    if (error || paths.length < 1000) return;
  }
}
