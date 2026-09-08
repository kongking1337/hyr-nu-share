import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CITIES } from "@/lib/geo";
import { CATEGORY_SYNONYMS } from "@/lib/search-parse";

export const Route = createFileRoute("/_authenticated/hyr-ut")({
  head: () => ({
    meta: [
      { title: "Hyr ut din grej – Hyrkoll" },
      { name: "description", content: "Lägg upp en annons med bilder, pris, deposition, tillgänglighet och leverans." },
      { property: "og:title", content: "Hyr ut din grej – Hyrkoll" },
      { property: "og:description", content: "Publicera en annons på några minuter." },
    ],
  }),
  component: CreateListing,
});

function CreateListing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: "",
    description: "",
    category_slug: "verktyg",
    city: "Stockholm",
    area: "",
    price_hour: "",
    price_day: "",
    price_week: "",
    price_month: "",
    deposit: "0",
    insurance_fee: "0",
    delivery_fee: "0",
    images: "",
  });
  const [delivery, setDelivery] = useState(false);
  const [instant, setInstant] = useState(true);
  const [busy, setBusy] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function publish() {
    if (!form.title || !form.price_day) { toast.error("Titel och dagspris krävs."); return; }
    setBusy(true);
    const city = CITIES.find((c) => c.name === form.city)!;
    const images = form.images
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const { data, error } = await supabase
      .from("listings")
      .insert({
        owner_id: user!.id,
        owner_name: user!.email?.split("@")[0] ?? "Uthyrare",
        title: form.title,
        description: form.description,
        category_slug: form.category_slug,
        city: form.city,
        area: form.area || null,
        lat: city.lat,
        lng: city.lng,
        price_hour: form.price_hour ? Number(form.price_hour) : null,
        price_day: Number(form.price_day),
        price_week: form.price_week ? Number(form.price_week) : null,
        price_month: form.price_month ? Number(form.price_month) : null,
        deposit: Number(form.deposit || 0),
        insurance_fee: Number(form.insurance_fee || 0),
        delivery_available: delivery,
        delivery_fee: Number(form.delivery_fee || 0),
        instant_book: instant,
        images: images.length ? images : ["https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=1200"],
      })
      .select("id")
      .single();
    setBusy(false);
    if (error) { toast.error("Kunde inte publicera annonsen."); return; }
    toast.success("Annonsen är publicerad!");
    navigate({ to: "/annons/$id", params: { id: data.id } });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-display text-3xl font-semibold">Hyr ut din grej</h1>
      <p className="mt-2 text-sm text-muted-foreground">Fyll i uppgifterna nedan och publicera direkt.</p>

      <div className="mt-7 space-y-5">
        <div className="rounded-3xl border border-dashed border-border p-5">
          <Label className="flex items-center gap-2"><ImagePlus className="h-4 w-4" /> Bilder (länkar, en per rad)</Label>
          <Textarea
            className="mt-2"
            rows={3}
            placeholder="https://…"
            value={form.images}
            onChange={(e) => set("images", e.target.value)}
          />
        </div>

        <F label="Titel"><Input value={form.title} onChange={(e) => set("title", e.target.value)} /></F>
        <F label="Beskrivning">
          <Textarea rows={4} value={form.description} onChange={(e) => set("description", e.target.value)} />
        </F>

        <div className="grid gap-4 sm:grid-cols-2">
          <F label="Kategori">
            <Select value={form.category_slug} onValueChange={(v) => set("category_slug", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_SYNONYMS).map(([slug, def]) => (
                  <SelectItem key={slug} value={slug}>{def.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </F>
          <F label="Ort">
            <Select value={form.city} onValueChange={(v) => set("city", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CITIES.map((c) => <SelectItem key={c.slug} value={c.name}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
          <F label="Område"><Input value={form.area} onChange={(e) => set("area", e.target.value)} /></F>
          <F label="Pris per timme (kr)"><Input value={form.price_hour} onChange={(e) => set("price_hour", e.target.value)} /></F>
          <F label="Pris per dygn (kr)"><Input value={form.price_day} onChange={(e) => set("price_day", e.target.value)} /></F>
          <F label="Pris per vecka (kr)"><Input value={form.price_week} onChange={(e) => set("price_week", e.target.value)} /></F>
          <F label="Pris per månad (kr)"><Input value={form.price_month} onChange={(e) => set("price_month", e.target.value)} /></F>
          <F label="Deposition (kr)"><Input value={form.deposit} onChange={(e) => set("deposit", e.target.value)} /></F>
          <F label="Försäkring per dygn (kr)"><Input value={form.insurance_fee} onChange={(e) => set("insurance_fee", e.target.value)} /></F>
          <F label="Leveransavgift (kr)"><Input value={form.delivery_fee} onChange={(e) => set("delivery_fee", e.target.value)} /></F>
        </div>

        <div className="flex items-center justify-between rounded-2xl bg-muted/60 px-4 py-3">
          <Label htmlFor="lev">Erbjuder leverans (annars upphämtning)</Label>
          <Switch id="lev" checked={delivery} onCheckedChange={setDelivery} />
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-muted/60 px-4 py-3">
          <Label htmlFor="dir">Tillåt direktbokning</Label>
          <Switch id="dir" checked={instant} onCheckedChange={setInstant} />
        </div>

        <Button className="w-full rounded-full" onClick={publish} disabled={busy}>Publicera annons</Button>
        <p className="text-xs text-muted-foreground">
          Utbetalningar hanteras via Stripe Connect när betalningar aktiveras. Serviceavgift dras automatiskt.
        </p>
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
