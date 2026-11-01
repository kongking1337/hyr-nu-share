import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PhotoUploader } from "@/components/PhotoUploader";
import { PHOTO_BUCKET, removeUnusedPhotos } from "@/lib/photos";
import { userMessage } from "@/lib/db-errors";
import { ACTIVE_CATEGORIES } from "@/lib/categories";
import { CITIES } from "@/lib/geo";
import { CATEGORY_ATTRIBUTES } from "@/lib/search/attributes";

export const Route = createFileRoute("/_authenticated/ny-annons")({
  validateSearch: (s: Record<string, unknown>): { id?: string } =>
    typeof s["id"] === "string" ? { id: s["id"] as string } : {},
  head: () => ({
    meta: [
      { title: "Lägg upp annons – Hyrkoll" },
      { name: "description", content: "Hyr ut något i Stockholm. Bilder, beskrivning, pris och plats på en sida." },
      { property: "og:title", content: "Lägg upp annons – Hyrkoll" },
      { property: "og:description", content: "Hyr ut något i Stockholm." },
    ],
  }),
  component: ListingForm,
});

const EMPTY = {
  title: "",
  description: "",
  category_slug: ACTIVE_CATEGORIES[0]?.slug ?? "verktyg",
  city: "Stockholm",
  area: "",
  price_day: "",
  price_week: "",
  deposit: "",
};

/** Heltal ≥ 0 i kronor, eller null om fältet är tomt/ogiltigt. */
function kronor(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function ListingForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id: editId } = Route.useSearch();

  const [form, setForm] = useState(EMPTY);
  const [attrs, setAttrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  // Bilder som laddats upp nu kan tas bort direkt; sparade bilder städas först när ändringen är sparad.
  const uploadedNow = useRef(new Set<string>());
  const removedSaved = useRef<string[]>([]);
  const set = (k: keyof typeof EMPTY, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const attrDefs = CATEGORY_ATTRIBUTES[form.category_slug] ?? [];

  /* Redigeringsläge: hämta befintlig annons */
  const { data: existing } = useQuery({
    queryKey: ["edit-listing", editId],
    enabled: !!editId,
    queryFn: async () => (await supabase.from("listings").select("*").eq("id", editId!).maybeSingle()).data,
  });
  const notOwner = !!existing && existing.owner_id !== user?.id;

  useEffect(() => {
    if (!existing) return;
    // En gammal "säljes"-annons blir en uthyrningsannons när den sparas (den har inget dygnspris än).
    setForm({
      title: existing.title,
      description: existing.description ?? "",
      category_slug: existing.category_slug,
      city: existing.city,
      area: existing.area ?? "",
      price_day: existing.price_day != null ? String(existing.price_day) : "",
      price_week: existing.price_week != null ? String(existing.price_week) : "",
      deposit: existing.deposit ? String(existing.deposit) : "",
    });
    setPhotos(existing.images ?? []);
    const a = (existing.attributes as Record<string, unknown>) ?? {};
    setAttrs(Object.fromEntries(Object.entries(a).map(([k, v]) => [k, String(v)])));
  }, [existing]);

  function validate(): string | null {
    const title = form.title.trim();
    if (title.length < 3) return "Skriv en rubrik på minst 3 tecken.";
    if (title.length > 100) return "Rubriken får vara högst 100 tecken.";
    if (form.description.length > 5000) return "Beskrivningen får vara högst 5 000 tecken.";
    if (kronor(form.price_day) == null) return "Ange ett pris per dygn i kronor.";
    if ((kronor(form.price_day) ?? 0) > 1_000_000 || (kronor(form.price_week) ?? 0) > 1_000_000) {
      return "Hyrespriset får vara högst 1 000 000 kr.";
    }
    if ((kronor(form.deposit) ?? 0) > 1_000_000) return "Depositionen får vara högst 1 000 000 kr.";
    if (form.price_week && kronor(form.price_week) == null) return "Veckopriset måste vara ett belopp i kronor.";
    if (form.deposit && kronor(form.deposit) == null) return "Depositionen måste vara ett belopp i kronor.";
    return null;
  }

  async function save(status?: "published" | "draft") {
    const problem = validate();
    if (problem) { toast.error(problem); return; }
    setBusy(true);
    const city = CITIES.find((c) => c.name === form.city) ?? CITIES[0]!;
    const payload = {
      listing_type: "rent",
      title: form.title.trim(),
      description: form.description.trim(),
      category_slug: form.category_slug,
      city: city.name,
      area: form.area.trim() || null,
      lat: city.lat,
      lng: city.lng,
      price: null,
      price_day: kronor(form.price_day),
      price_week: kronor(form.price_week),
      price_hour: null,
      price_month: null,
      deposit: kronor(form.deposit) ?? 0,
      attributes: attrs,
      images: photos,
      ...(status ? { status } : {}),
    };

    if (editId) {
      const { error } = await supabase.from("listings").update(payload).eq("id", editId);
      setBusy(false);
      if (error) { toast.error(userMessage(error, "Kunde inte spara annonsen.")); return; }
      void removeUnusedPhotos(user!.id, removedSaved.current);
      toast.success("Annonsen är uppdaterad.");
      navigate({ to: "/mina-annonser" });
      return;
    }

    const { data, error } = await supabase
      .from("listings")
      .insert({ ...payload, owner_id: user!.id, status: status ?? "published" })
      .select("id")
      .single();
    setBusy(false);
    if (error) { toast.error(userMessage(error, "Kunde inte spara annonsen.")); return; }
    if (status === "draft") {
      toast.success("Utkast sparat.");
      navigate({ to: "/mina-annonser" });
    } else {
      toast.success("Annonsen är publicerad!");
      navigate({ to: "/annons/$id", params: { id: data.id } });
    }
  }

  if (notOwner) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-muted-foreground">
        Du kan bara redigera dina egna annonser.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <h1 className="font-display text-3xl font-semibold">{editId ? "Redigera annons" : "Lägg upp annons"}</h1>

      <F label="Bilder">
        {user && <PhotoUploader
          userId={user.id}
          value={photos}
          onChange={setPhotos}
          onUploaded={(path) => uploadedNow.current.add(path)}
          onRemove={(path) => {
            if (uploadedNow.current.has(path)) {
              void supabase.storage.from(PHOTO_BUCKET).remove([path]);
            } else {
              removedSaved.current.push(path);
            }
          }}
          onBusyChange={setUploading}
        />}
      </F>

      <F label="Rubrik">
        <Input
          value={form.title}
          maxLength={100}
          placeholder="T.ex. Släpvagn 750 kg"
          onChange={(e) => set("title", e.target.value)}
        />
      </F>

      <F label="Beskrivning">
        <Textarea
          rows={6}
          value={form.description}
          maxLength={5000}
          placeholder="Skick, vad som ingår, mått, när det kan hämtas och lämnas tillbaka …"
          onChange={(e) => set("description", e.target.value)}
        />
      </F>

      <F label="Kategori">
        <Select value={form.category_slug} onValueChange={(v) => { set("category_slug", v); setAttrs({}); }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {ACTIVE_CATEGORIES.map((c) => (
              <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </F>

      <div className="grid gap-4 sm:grid-cols-3">
        <F label="Pris per dygn (kr)">
          <Input inputMode="numeric" value={form.price_day} onChange={(e) => set("price_day", e.target.value)} />
        </F>
        <F label="Pris per vecka (valfritt)">
          <Input inputMode="numeric" value={form.price_week} onChange={(e) => set("price_week", e.target.value)} />
        </F>
        <F label="Deposition (valfritt)">
          <Input inputMode="numeric" value={form.deposit} onChange={(e) => set("deposit", e.target.value)} />
        </F>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <F label="Kommun">
          <Select value={form.city} onValueChange={(v) => set("city", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CITIES.map((c) => <SelectItem key={c.slug} value={c.name}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </F>
        <F label="Område (valfritt)">
          <Input value={form.area} maxLength={60} placeholder="T.ex. Södermalm" onChange={(e) => set("area", e.target.value)} />
        </F>
      </div>

      {attrDefs.length > 0 && (
        <details className="rounded-3xl border border-border p-5">
          <summary className="cursor-pointer font-display text-base font-semibold">Fler detaljer (valfritt)</summary>
          <div className="mt-4 space-y-3">
            {attrDefs.map((d) => (
              <div key={d.key} className="space-y-1.5">
                <Label className="text-sm">{d.label}</Label>
                {d.type === "select" ? (
                  <Select value={attrs[d.key] ?? ""} onValueChange={(v) => setAttrs((a) => ({ ...a, [d.key]: v }))}>
                    <SelectTrigger><SelectValue placeholder="Välj" /></SelectTrigger>
                    <SelectContent>
                      {(d.options ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : d.type === "bool" ? (
                  <div className="flex items-center justify-between rounded-2xl bg-muted/60 px-4 py-2.5">
                    <span className="text-sm text-muted-foreground">Ja/nej</span>
                    <Switch
                      checked={attrs[d.key] === "true"}
                      onCheckedChange={(c) => setAttrs((a) => ({ ...a, [d.key]: String(c) }))}
                    />
                  </div>
                ) : (
                  <Input
                    inputMode="numeric"
                    value={attrs[d.key] ?? ""}
                    onChange={(e) => setAttrs((a) => ({ ...a, [d.key]: e.target.value }))}
                    placeholder={d.unit ?? ""}
                  />
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="flex flex-wrap gap-2">
        {editId ? (
          <>
            <Button className="flex-1 rounded-full" onClick={() => save()} disabled={busy || uploading}>Spara ändringar</Button>
            {existing?.status === "draft" && (
              <Button variant="outline" className="rounded-full" onClick={() => save("published")} disabled={busy || uploading}>
                Publicera
              </Button>
            )}
          </>
        ) : (
          <>
            <Button className="flex-1 rounded-full" onClick={() => save("published")} disabled={busy || uploading}>
              Publicera
            </Button>
            <Button variant="outline" className="rounded-full" onClick={() => save("draft")} disabled={busy || uploading}>
              Spara som utkast
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <Label>{label}</Label>
    {children}
  </div>
);
