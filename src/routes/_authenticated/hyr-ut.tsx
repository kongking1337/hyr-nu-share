import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Car, Check, ImagePlus, Loader2, Pencil, ScanLine, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CITIES } from "@/lib/geo";
import { CATEGORY_SYNONYMS } from "@/lib/search-parse";
import { CATEGORY_ATTRIBUTES } from "@/lib/search/attributes";
import { kr } from "@/lib/pricing";
import { qualityLabel, scoreListing } from "@/lib/listing-quality";
import { getPriceAdvice } from "@/lib/price-advice";
import {
  DEMO_IDENTIFICATIONS,
  STATUS_LABEL,
  VEHICLE_CATEGORIES,
  buildDescription,
  buildTitles,
  identifyFromImages,
  lookupBarcode,
  lookupVehicle,
  maskVin,
  type DataStatus,
  type Identification,
  type VehicleInfo,
} from "@/lib/ai-assist";

export const Route = createFileRoute("/_authenticated/hyr-ut")({
  validateSearch: (s: Record<string, unknown>): { id?: string } =>
    typeof s['id'] === "string" ? { id: s['id'] as string } : {},
  head: () => ({
    meta: [
      { title: "Hyr ut din grej – Hyrkoll" },
      { name: "description", content: "Ta bild, låt AI föreslå, bekräfta och publicera. Pris, deposition, tillgänglighet och leverans i ett flöde." },
      { property: "og:title", content: "Hyr ut din grej – Hyrkoll" },
      { property: "og:description", content: "AI-assisterat annonsflöde i fem steg." },
    ],
  }),
  component: ListingWizard,
});

const STEPS = ["Bilder", "Identifiering", "Innehåll", "Pris & plats", "Publicera"];

function StatusChip({ status }: { status: DataStatus }) {
  const cls =
    status === "confirmed"
      ? "bg-primary/15 text-primary"
      : status === "likely"
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
        : "bg-muted text-muted-foreground";
  return <Badge className={`rounded-full border-0 text-[10px] ${cls}`}>{STATUS_LABEL[status]}</Badge>;
}

function ListingWizard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id: editId } = Route.useSearch();

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [ident, setIdent] = useState<Identification | null>(null);
  const [identConfirmed, setIdentConfirmed] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [barcode, setBarcode] = useState("");
  const [regnr, setRegnr] = useState("");
  const [vehicle, setVehicle] = useState<VehicleInfo | null>(null);
  const [titleOptions, setTitleOptions] = useState<string[]>([]);
  const [attrs, setAttrs] = useState<Record<string, string>>({});

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
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const images = useMemo(() => form.images.split(/[\n,]/).map((s) => s.trim()).filter(Boolean), [form.images]);
  const isVehicle = VEHICLE_CATEGORIES.includes(form.category_slug);
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
      insurance_fee: String(existing.insurance_fee ?? 0),
      delivery_fee: String(existing.delivery_fee ?? 0),
      images: (existing.images ?? []).join("\n"),
    });
    setDelivery(!!existing.delivery_available);
    setInstant(!!existing.instant_book);
    const a = (existing.attributes as Record<string, unknown>) ?? {};
    setAttrs(Object.fromEntries(Object.entries(a).map(([k, v]) => [k, String(v)])));
    setIdentConfirmed(true);
    setStep(2);
  }, [existing]);

  const quality = scoreListing({ ...form, images, attributes: attrs, delivery_available: delivery });

  const { data: advice } = useQuery({
    queryKey: ["wizard-advice", form.category_slug, form.city, form.price_day],
    enabled: step >= 3,
    queryFn: () =>
      getPriceAdvice({
        category: form.category_slug,
        city: form.city,
        priceDay: Number(form.price_day || 0),
        condition: (answers['skick']?.toLowerCase() as "nyskick" | "bra" | "sliten") ?? undefined,
        brand: attrs['marke'] ?? null,
      }),
  });

  function runAnalysis(pick?: string) {
    setAnalyzing(true);
    setIdentConfirmed(false);
    window.setTimeout(() => {
      const result = identifyFromImages(images, pick);
      setIdent(result);
      setAnalyzing(false);
      setStep(1);
    }, 900);
  }

  function acceptIdent() {
    if (!ident) return;
    setIdentConfirmed(true);
    setForm((f) => ({ ...f, category_slug: ident.category }));
    setAttrs(ident.attributes);
    setTitleOptions(ident.titles);
    setStep(2);
  }

  function generateTitle() {
    const opts = ident
      ? ident.titles
      : buildTitles({ brand: attrs['marke'], productType: form.category_slug, city: form.city });
    setTitleOptions(opts);
    if (opts[0]) set("title", opts[0]);
  }

  function generateDescription() {
    const includes = Object.entries(answers)
      .filter(([k, v]) => k !== "skick" && v && v !== "Nej")
      .map(([, v]) => v);
    set(
      "description",
      buildDescription({
        seed: ident?.descriptionSeed,
        brand: attrs['marke'],
        model: ident?.model,
        productType: ident?.productType,
        city: form.city,
        condition: answers['skick'],
        includes,
        delivery,
        deposit: Number(form.deposit || 0),
      }),
    );
  }

  function applyRecommendedPrice() {
    if (!advice) { toast.info("För få liknande annonser för ett prisförslag just nu."); return; }
    set("price_day", String(advice.recommended.mid));
    set("price_week", String(Math.round((advice.recommended.mid * 5) / 10) * 10));
    toast.success("Rekommenderat pris ifyllt – du kan ändra fritt.");
  }

  function fetchVehicle() {
    const v = lookupVehicle(regnr);
    if (!v) { toast.error("Ange ett giltigt registreringsnummer."); return; }
    setVehicle(v);
    setAttrs((a) => ({
      ...a,
      marke: v.marke,
      modell: v.modell,
      arsmodell: String(v.arsmodell),
      drivmedel: v.drivmedel,
      vaxellada: v.vaxellada,
      platser: String(v.saten),
    }));
    toast.success("Demofordonsdata hämtad – bekräfta uppgifterna.");
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
      insurance_fee: Number(form.insurance_fee || 0),
      delivery_available: delivery,
      delivery_fee: Number(form.delivery_fee || 0),
      instant_book: instant,
      status,
      attributes: attrs,
      quality_score: quality.total,
      vehicle: vehicle ? { ...vehicle, vin: maskVin(vehicle.vin), demo: true } : null,
      images: images.length ? images : ["https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=1200"],
    };

    if (editId) {
      const { error } = await supabase.from("listings").update(payload).eq("id", editId);
      setBusy(false);
      if (error) { toast.error("Kunde inte spara ändringarna."); return; }
      toast.success("Annonsen är uppdaterad.");
      navigate({ to: "/annons/$id", params: { id: editId } });
      return;
    }

    const { data, error } = await supabase
      .from("listings")
      .insert({ ...payload, owner_id: user!.id, owner_name: user!.email?.split("@")[0] ?? "Uthyrare" })
      .select("id")
      .single();
    setBusy(false);
    if (error) { toast.error("Kunde inte publicera annonsen."); return; }
    toast.success(status === "draft" ? "Utkast sparat." : "Annonsen är publicerad!");
    navigate({ to: status === "draft" ? "/mina-annonser" : "/annons/$id", params: { id: data.id } } as never);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display text-3xl font-semibold">{editId ? "Redigera annons" : "Hyr ut din grej"}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Ta bild → AI föreslår → du bekräftar → publicera.</p>

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

      <p className="mt-4 rounded-2xl bg-muted/60 px-4 py-3 text-xs text-muted-foreground">
        AI-förslagen nedan är en demo som körs lokalt i appen. Riktig bildigenkänning, streckkodsuppslag och
        fordonsdata kräver en ansluten AI- eller produktdatakälla. Allt som är märkt {STATUS_LABEL.likely} måste
        bekräftas av dig innan publicering.
      </p>

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

          <div className="rounded-3xl border border-border p-5">
            <Label className="flex items-center gap-2"><ScanLine className="h-4 w-4" /> Streckkod / EAN / artikelnummer</Label>
            <div className="mt-2 flex gap-2">
              <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="7350000000000" />
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => {
                  const r = lookupBarcode(barcode);
                  if (!r) { toast.error("Ange en kod."); return; }
                  setIdent(r); setStep(1);
                }}
              >
                Slå upp
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Demouppslag – kräver ansluten produktdatabas för skarp drift.</p>
          </div>

          <div className="space-y-2">
            <Button className="w-full rounded-full" onClick={() => runAnalysis()} disabled={analyzing}>
              {analyzing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
              Analysera bilder med AI (demo)
            </Button>
            <div className="flex flex-wrap gap-2">
              {DEMO_IDENTIFICATIONS.map((d) => (
                <Button key={d.key} size="sm" variant="outline" className="rounded-full" onClick={() => runAnalysis(d.key)}>
                  Demo: {d.brand} {d.model}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Steg 2 – identifiering */}
      {step === 1 && (
        <div className="mt-6 space-y-4">
          {!ident && <p className="text-sm text-muted-foreground">Kör en analys i steg 1 först.</p>}
          {ident && (
            <div className="rounded-3xl border border-border p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold">{ident.brand} {ident.model}</h2>
                <StatusChip status="likely" />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {ident.productType} · träffsäkerhet {(ident.confidence * 100).toFixed(0)} % (demo)
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <Row label="Kategori" value={CATEGORY_SYNONYMS[ident.category]?.name ?? ident.category} />
                <Row label="Märke" value={ident.brand} />
                <Row label="Modell" value={ident.model} />
                <Row label="Serienummer" value="—" unknown />
              </dl>
              <div className="mt-4 flex gap-2">
                <Button className="rounded-full" onClick={acceptIdent}><Check className="mr-1 h-4 w-4" /> Stämmer</Button>
                <Button variant="outline" className="rounded-full" onClick={() => { setIdent(null); setStep(2); }}>
                  <Pencil className="mr-1 h-4 w-4" /> Ändra manuellt
                </Button>
              </div>
            </div>
          )}

          {ident && (
            <div className="rounded-3xl border border-border p-5">
              <h3 className="font-display text-base font-semibold">Några snabba frågor</h3>
              <p className="text-xs text-muted-foreground">Vi gissar inte – svara så fylls uppgifterna i som bekräftade.</p>
              <div className="mt-3 space-y-3">
                {ident.followUps.map((f) => (
                  <div key={f.key}>
                    <Label className="text-sm">{f.question}</Label>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {f.options.map((o) => (
                        <Button
                          key={o}
                          size="sm"
                          variant={answers[f.key] === o ? "default" : "outline"}
                          className="rounded-full"
                          onClick={() => setAnswers((a) => ({ ...a, [f.key]: o }))}
                        >
                          {o}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Steg 3 – innehåll */}
      {step === 2 && (
        <div className="mt-6 space-y-5">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="rounded-full" onClick={generateTitle}>
              <Sparkles className="mr-1 h-4 w-4" /> Generera rubrik med AI
            </Button>
            <Button size="sm" variant="outline" className="rounded-full" onClick={generateDescription}>
              <Sparkles className="mr-1 h-4 w-4" /> Skriv beskrivning med AI
            </Button>
          </div>

          {titleOptions.length > 0 && (
            <div className="space-y-2 rounded-3xl border border-border p-4">
              <p className="text-xs text-muted-foreground">Välj ett förslag och redigera fritt:</p>
              {titleOptions.map((t) => (
                <button
                  key={t}
                  onClick={() => set("title", t)}
                  className={`block w-full rounded-2xl px-3 py-2 text-left text-sm ${form.title === t ? "bg-primary/10" : "hover:bg-muted"}`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

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
              <p className="text-xs text-muted-foreground">
                Fält som AI föreslagit är märkta {STATUS_LABEL.likely} tills du sparar dem.
              </p>
              {attrDefs.map((d) => (
                <div key={d.key} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm">{d.label}</Label>
                    <StatusChip status={attrs[d.key] ? (ident?.attributes[d.key] === attrs[d.key] ? "likely" : "confirmed") : "unknown"} />
                  </div>
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

          {isVehicle && (
            <div className="space-y-3 rounded-3xl border border-border p-5">
              <h3 className="flex items-center gap-2 font-display text-base font-semibold">
                <Car className="h-4 w-4" /> Fordonsuppgifter
              </h3>
              <div className="flex gap-2">
                <Input placeholder="ABC12X" value={regnr} onChange={(e) => setRegnr(e.target.value)} />
                <Button variant="outline" className="rounded-full" onClick={fetchVehicle}>Hämta fordonsinformation</Button>
              </div>
              {vehicle && (
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <Row label="Märke" value={vehicle.marke} />
                  <Row label="Modell" value={vehicle.modell} />
                  <Row label="Årsmodell" value={String(vehicle.arsmodell)} />
                  <Row label="Drivmedel" value={vehicle.drivmedel} />
                  <Row label="Växellåda" value={vehicle.vaxellada} />
                  <Row label="Effekt" value={vehicle.effekt} />
                  <Row label="Kaross" value={vehicle.kaross} />
                  <Row label="Säten" value={String(vehicle.saten)} />
                  <Row label="Fordonstyp" value={vehicle.fordonstyp} />
                  <Row label="VIN (maskeras publikt)" value={maskVin(vehicle.vin)} />
                </dl>
              )}
              <p className="text-xs text-muted-foreground">
                Demodata. Fordons- och VIN-uppslag kräver en godkänd datakälla. Fullständigt VIN visas aldrig i den
                publika annonsen.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Steg 4 – pris & plats */}
      {step === 3 && (
        <div className="mt-6 space-y-5">
          <Button size="sm" variant="outline" className="rounded-full" onClick={applyRecommendedPrice}>
            <Sparkles className="mr-1 h-4 w-4" /> Rekommenderat pris
          </Button>

          {advice && (
            <div className="rounded-3xl border border-border p-5 text-sm">
              <p className="font-display text-base font-semibold">
                Förslag {kr(advice.recommended.min)}–{kr(advice.recommended.max)} per dygn
              </p>
              <p className="mt-1 text-muted-foreground">
                Median {kr(advice.median)}, billigast {kr(advice.cheapest)} bland {advice.sample} liknande annonser.
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {advice.reasons.map((r) => <li key={r}>{r}</li>)}
              </ul>
            </div>
          )}

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
        </div>
      )}

      {/* Steg 5 – publicera */}
      {step === 4 && (
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

          {!identConfirmed && ident && (
            <p className="rounded-2xl bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
              Du har obekräftade AI-förslag. Gå tillbaka till steg 2 och bekräfta innan du publicerar.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button className="flex-1 rounded-full" onClick={() => publish("published")} disabled={busy}>
              {editId ? "Spara ändringar" : "Publicera annons"}
            </Button>
            <Button variant="outline" className="rounded-full" onClick={() => publish("draft")} disabled={busy}>
              Spara som utkast
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Utbetalningar hanteras via Stripe Connect när betalningar aktiveras. Serviceavgift dras automatiskt.
          </p>
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
