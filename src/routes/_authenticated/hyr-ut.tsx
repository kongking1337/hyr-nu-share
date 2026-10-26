import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { CATEGORY_ATTRIBUTES } from "@/lib/search/attributes";
import { qualityLabel, scoreListing } from "@/lib/listing-quality";
import { VALIDITY_OPTIONS } from "@/lib/offers";

export const Route = createFileRoute("/_authenticated/hyr-ut")({
  validateSearch: (s: Record<string, unknown>): { id?: string } =>
    typeof s['id'] === "string" ? { id: s['id'] as string } : {},
  head: () => ({
    meta: [
      { title: "Hyr ut din grej – Hyrkoll" },
      { name: "description", content: "Lägg upp en annons med bilder, beskrivning, pris och plats." },
      { property: "og:title", content: "Hyr ut din grej – Hyrkoll" },
      { property: "og:description", content: "Lägg upp en annons på några minuter." },
    ],
  }),
  component: ListingWizard,
});

const STEPS = ["Bilder", "Innehåll", "Pris & plats", "Publicera"];

function ListingWizard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id: editId } = Route.useSearch();

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [attrs, setAttrs] = useState<Record<string, string>>({});
  // Budgivning – publika fält på annonsen, privata trösklar sparas separat
  const [allowOffers, setAllowOffers] = useState(false);
  const [validity, setValidity] = useState("24");
  const [minTotal, setMinTotal] = useState("");
  const [minPerDay, setMinPerDay] = useState("");
  const [autoAccept, setAutoAccept] = useState("");

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
    delivery_fee: "0",
    images: "",
  });
  const [delivery, setDelivery] = useState(false);
  const [instant, setInstant] = useState(true);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const images = useMemo(() => form.images.split(/[\n,]/).map((s) => s.trim()).filter(Boolean), [form.images]);
  const attrDefs = CATEGORY_ATTRIBUTES[form.category_slug] ?? [];

  /* Redigeringsläge: hämta befintlig annons */
  const { data: existing } = useQuery({
    queryKey: ["edit-listing", editId],
    enabled: !!editId,
    queryFn: async () => (await supabase.from("listings").select("*").eq("id", editId!).maybeSingle()).data,
  });

  useEffect(() => {
    if (!existing) return;
    setForm({
      title: existing.title,
      description: existing.description ?? "",
      category_slug: existing.category_slug,
      city: existing.city,
      area: existing.area ?? "",
      price_hour: existing.price_hour ? String(existing.price_hour) : "",
      price_day: String(existing.price_day),
      price_week: existing.price_week ? String(existing.price_week) : "",
      price_month: existing.price_month ? String(existing.price_month) : "",
      deposit: String(existing.deposit ?? 0),
      delivery_fee: String(existing.delivery_fee ?? 0),
      images: (existing.images ?? []).join("\n"),
    });
    setDelivery(!!existing.delivery_available);
    setInstant(!!existing.instant_book);
    setAllowOffers(!!(existing as { allow_offers?: boolean }).allow_offers);
    setValidity(String((existing as { offer_validity_hours?: number }).offer_validity_hours ?? 24));
    const a = (existing.attributes as Record<string, unknown>) ?? {};
    setAttrs(Object.fromEntries(Object.entries(a).map(([k, v]) => [k, String(v)])));
    setStep(1);
  }, [existing]);

  const quality = scoreListing({ ...form, images, attributes: attrs, delivery_available: delivery });

  async function saveOfferSettings(listingId: string) {
    if (!allowOffers) return;
    await supabase.from("listing_offer_settings").upsert(
      {
        listing_id: listingId,
        min_offer_total: minTotal ? Number(minTotal) : null,
        min_offer_per_day: minPerDay ? Number(minPerDay) : null,
        auto_accept_total: autoAccept ? Number(autoAccept) : null,
      },
      { onConflict: "listing_id" },
    );
  }

  async function publish(status: "published" | "draft") {
    if (!form.title || !form.price_day) { toast.error("Titel och dygnspris krävs."); return; }
    setBusy(true);
    const city = CITIES.find((c) => c.name === form.city)!;
    const payload = {
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
      delivery_available: delivery,
      delivery_fee: Number(form.delivery_fee || 0),
      instant_book: instant,
      allow_offers: allowOffers,
      offer_validity_hours: Number(validity),
      status,
      attributes: attrs,
      quality_score: quality.total,
      images: images.length ? images : ["https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=1200"],
    };

    if (editId) {
      const { error } = await supabase.from("listings").update(payload).eq("id", editId);
      setBusy(false);
      if (error) { toast.error("Kunde inte spara ändringarna."); return; }
      await saveOfferSettings(editId);
      toast.success("Annonsen är uppdaterad.");
      navigate({ to: "/annons/$id", params: { id: editId } });
      return;
    }

    const { data, error } = await supabase
      .from("listings")
      .insert({ ...payload, owner_id: user!.id })
      .select("id")
      .single();
    setBusy(false);
    if (error) { toast.error("Kunde inte publicera annonsen."); return; }
    await saveOfferSettings(data.id);
    toast.success(status === "draft" ? "Utkast sparat." : "Annonsen är publicerad!");
    navigate({ to: status === "draft" ? "/mina-annonser" : "/annons/$id", params: { id: data.id } } as never);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display text-3xl font-semibold">{editId ? "Redigera annons" : "Hyr ut din grej"}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Bilder → beskrivning → pris och plats → publicera.</p>

      <div className="mt-5 flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <button
            key={s}
            onClick={() => setStep(i)}
            className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
              i === step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {i + 1}. {s}
          </button>
        ))}
      </div>

      {/* Steg 1 – bilder */}
      {step === 0 && (
        <div className="mt-6 space-y-5">
          <div className="rounded-3xl border border-dashed border-border p-5">
            <Label className="flex items-center gap-2"><ImagePlus className="h-4 w-4" /> Bilder (länkar, en per rad)</Label>
            <Textarea className="mt-2" rows={3} placeholder="https://…" value={form.images} onChange={(e) => set("images", e.target.value)} />
            {images.length > 0 && (
              <div className="mt-3 flex gap-2 overflow-x-auto">
                {images.map((src) => (
                  <img key={src} src={src} alt="" loading="lazy" className="h-20 w-20 rounded-xl object-cover" />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Steg 2 – innehåll */}
      {step === 1 && (
        <div className="mt-6 space-y-5">
          <F label="Titel"><Input value={form.title} onChange={(e) => set("title", e.target.value)} /></F>
          <F label="Beskrivning"><Textarea rows={5} value={form.description} onChange={(e) => set("description", e.target.value)} /></F>

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

          {attrDefs.length > 0 && (
            <div className="space-y-3 rounded-3xl border border-border p-5">
              <h3 className="font-display text-base font-semibold">Specifikationer</h3>
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
          )}

        </div>
      )}

      {/* Steg 3 – pris & plats */}
      {step === 2 && (
        <div className="mt-6 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
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

          <div className="rounded-3xl border border-border p-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="bud">Tillåt prisförslag / bud</Label>
              <Switch id="bud" checked={allowOffers} onCheckedChange={setAllowOffers} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Hyrestagare kan lägga bud på totalpriset för sin period. Du kan alltid acceptera, neka eller lämna motbud.
            </p>

            {allowOffers && (
              <div className="mt-4 space-y-3">
                <F label="Giltighetstid för bud">
                  <Select value={validity} onValueChange={setValidity}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {VALIDITY_OPTIONS.map((v) => (
                        <SelectItem key={v.value} value={String(v.value)}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </F>
                <div className="grid gap-3 sm:grid-cols-2">
                  <F label="Dolt minimum – totalt för perioden (kr)">
                    <Input value={minTotal} onChange={(e) => setMinTotal(e.target.value)} placeholder="valfritt" />
                  </F>
                  <F label="Dolt minimum – per dygn (kr)">
                    <Input value={minPerDay} onChange={(e) => setMinPerDay(e.target.value)} placeholder="valfritt" />
                  </F>
                  <F label="Automatisk acceptans från (kr totalt)">
                    <Input value={autoAccept} onChange={(e) => setAutoAccept(e.target.value)} placeholder="valfritt" />
                  </F>
                </div>
                <p className="rounded-2xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                  Ditt dolda minimum och din automatgräns visas aldrig publikt och avslöjas aldrig för hyrestagaren – de
                  används bara för att markera för låga bud och för att acceptera bud automatiskt.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Steg 4 – publicera */}
      {step === 3 && (
        <div className="mt-6 space-y-5">
          <div className="rounded-3xl border border-border p-5">
            <h2 className="font-display text-lg font-semibold">Annonskvalitet</h2>
            <p className="mt-1 font-display text-3xl font-semibold">
              {quality.total}<span className="text-base text-muted-foreground">/100 · {qualityLabel(quality.total)}</span>
            </p>
            <div className="mt-3 space-y-2">
              {quality.parts.map((p) => (
                <div key={p.key}>
                  <div className="flex justify-between text-sm"><span>{p.label}</span><span className="text-muted-foreground">{p.score}/{p.max}</span></div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(p.score / p.max) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
            {quality.tips.length > 0 && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {quality.tips.map((t) => <li key={t}>{t}</li>)}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button className="flex-1 rounded-full" onClick={() => publish("published")} disabled={busy}>
              {editId ? "Spara ändringar" : "Publicera annons"}
            </Button>
            <Button variant="outline" className="rounded-full" onClick={() => publish("draft")} disabled={busy}>
              Spara som utkast
            </Button>
          </div>
        </div>
      )}

      <div className="mt-8 flex justify-between">
        <Button variant="ghost" className="rounded-full" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          Tillbaka
        </Button>
        <Button variant="outline" className="rounded-full" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))} disabled={step === STEPS.length - 1}>
          Nästa
        </Button>
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

const Row = ({ label, value, unknown }: { label: string; value: string; unknown?: boolean }) => (
  <div className="rounded-2xl bg-muted/60 px-3 py-2">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className={unknown ? "text-sm text-muted-foreground" : "text-sm font-medium"}>{value}</dd>
  </div>
);
