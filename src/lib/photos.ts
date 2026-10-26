import { supabase } from "@/integrations/supabase/client";

/**
 * Annonsbilder i Supabase Storage (bucket "listing-images", se migrationen
 * 20261030120000_listing_photos.sql). `listings.images` innehåller sökvägar som
 * "<användar-id>/<uuid>.webp" (eller .jpg); äldre annonser har hela URL:er.
 */
export const PHOTO_BUCKET = "listing-images";
export const MAX_PHOTOS = 8;
const MAX_SIDE = 1600;
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

export type ShrunkPhoto = { blob: Blob; ext: "webp" | "jpg" };

const encode = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * Förminskar till högst 1600 px och sparar om som WebP (eller JPEG). Det gör bilderna
 * snabba på mobilen och tar bort metadata som GPS-position.
 */
export async function shrinkPhoto(file: File): Promise<ShrunkPhoto> {
  if (!file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name)) {
    throw new PhotoError(`${file.name} är inte en bild.`);
  }
  if (file.size > MAX_INPUT_BYTES) throw new PhotoError(`${file.name} är för stor (max 25 MB).`);

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new PhotoError(`${file.name} gick inte att läsa. Prova en bild i JPG- eller PNG-format.`);
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new PhotoError("Bilden kunde inte bearbetas.");
  ctx.fillStyle = "#fff"; // genomskinliga PNG-bilder får vit bakgrund i stället för svart
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  // Webbläsare som inte kan skapa WebP lämnar tillbaka PNG, så kontrollera typen.
  const webp = await encode(canvas, "image/webp", WEBP_QUALITY);
  if (webp?.type === "image/webp") return { blob: webp, ext: "webp" };
  const jpeg = await encode(canvas, "image/jpeg", JPEG_QUALITY);
  if (!jpeg) throw new PhotoError("Bilden kunde inte bearbetas.");
  return { blob: jpeg, ext: "jpg" };
}

/** Förminskar och laddar upp en bild till användarens egen mapp. Returnerar sökvägen. */
export async function uploadPhoto(file: File, userId: string): Promise<string> {
  const { blob, ext } = await shrinkPhoto(file);
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, blob, { contentType: blob.type, cacheControl: "31536000", upsert: false });
  if (error) throw new PhotoError("Bilden kunde inte laddas upp. Försök igen.");
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
  if (unused.length) await supabase.storage.from(PHOTO_BUCKET).remove(unused);
}

/** Tar bort alla användarens bilder (när kontot raderas). */
export async function removeAllMyPhotos(userId: string): Promise<void> {
  const { data } = await supabase.storage.from(PHOTO_BUCKET).list(userId, { limit: 1000 });
  const paths = (data ?? []).map((f) => `${userId}/${f.name}`);
  if (paths.length) await supabase.storage.from(PHOTO_BUCKET).remove(paths);
}
