import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  BarChart3,
  Copy,
  ExternalLink,
  Eye,
  Heart,
  MousePointerClick,
  Pause,
  Pencil,
  Play,
  Share2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { kr } from "@/lib/pricing";
import { KpiCard, DemoNote } from "@/components/dashboard/KpiCard";
import { dashboardKpis, seriesFor, totals } from "@/lib/listing-analytics";
import { scoreListing } from "@/lib/listing-quality";
import { DEMO_LISTINGS } from "@/lib/demo-listings";

export const Route = createFileRoute("/_authenticated/mina-annonser")({
  head: () => ({
    meta: [
      { title: "Mina annonser – Hyrkoll" },
      { name: "description", content: "Uthyrardashboard med statistik, status och snabbåtgärder för alla dina annonser." },
      { property: "og:title", content: "Mina annonser – Hyrkoll" },
      { property: "og:description", content: "Visningar, klick, favoriter, bokningar och intäkter för dina annonser." },
    ],
  }),
  component: MyListings,
});

export const STATUS_META: Record<string, { label: string; className: string }> = {
  published: { label: "Publicerad", className: "bg-primary/15 text-primary" },
  paused: { label: "Pausad", className: "bg-muted text-muted-foreground" },
  draft: { label: "Utkast", className: "bg-accent/20 text-foreground" },
  fully_booked: { label: "Fullbokad", className: "bg-secondary text-secondary-foreground" },
  review: { label: "Under granskning", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  ended: { label: "Avslutad", className: "bg-destructive/10 text-destructive" },
};

const TABS = [
  { key: "all", label: "Alla" },
  { key: "published", label: "Publicerade" },
  { key: "paused", label: "Pausade" },
  { key: "draft", label: "Utkast" },
  { key: "fully_booked", label: "Fullbokade" },
  { key: "review", label: "Granskas" },
  { key: "ended", label: "Avslutade" },
];

function MyListings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("all");
  const [seeding, setSeeding] = useState(false);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ["my-listings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [{ data: listings }, { data: bookings }] = await Promise.all([
        supabase.from("listings").select("*").eq("owner_id", user!.id).order("created_at", { ascending: false }),
        supabase.from("bookings").select("*").order("start_date", { ascending: true }),
      ]);
      return { listings: listings ?? [], bookings: bookings ?? [] };
    },
  });

  const listings = data?.listings ?? [];
  const kpis = useMemo(() => dashboardKpis(listings, 30), [listings]);

  const top = useMemo(
    () =>
      listings
        .map((l) => ({ l, t: totals(seriesFor(l, 30)) }))
        .sort((a, b) => b.t.views - a.t.views)
        .slice(0, 3),
    [listings],
  );

  const upcoming = (data?.bookings ?? [])
    .filter((b) => listings.some((l) => l.id === b.listing_id) && b.status === "confirmed")
    .slice(0, 4);

  const filtered = tab === "all" ? listings : listings.filter((l) => (l.status ?? "published") === tab);

  async function seedDemo() {
    setSeeding(true);
    const rows = DEMO_LISTINGS.map((d) => ({
      ...d,
      owner_id: user!.id,
      owner_name: user!.email?.split("@")[0] ?? "Uthyrare",
    }));
    const { error } = await supabase.from("listings").insert(rows);
    setSeeding(false);
    if (error) { toast.error("Kunde inte lägga till demoannonser."); return; }
    toast.success("Sex demoannonser tillagda på ditt konto.");
    refetch();
  }

  async function setStatus(id: string, status: string) {
    const { error } = await supabase.from("listings").update({ status }).eq("id", id);
    if (error) { toast.error("Kunde inte uppdatera status."); return; }
    toast.success(status === "paused" ? "Annonsen är pausad." : "Annonsen är aktiv igen.");
    refetch();
  }

  async function duplicate(l: (typeof listings)[number]) {
    const { id, created_at, published_at, ...rest } = l as Record<string, unknown> as any;
    void id; void created_at; void published_at;
    const { error } = await supabase
      .from("listings")
      .insert({ ...rest, title: `${l.title} (kopia)`, status: "draft", booking_count: 0 });
    if (error) { toast.error("Kunde inte duplicera annonsen."); return; }
    toast.success("Kopia skapad som utkast.");
    refetch();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("listings").delete().eq("id", id);
    if (error) { toast.error("Kunde inte ta bort annonsen."); return; }
    toast.success("Annonsen är borttagen.");
    refetch();
  }

  async function share(id: string, title: string) {
    const url = `${window.location.origin}/annons/${id}`;
    try {
      if (navigator.share) await navigator.share({ title, url });
      else { await navigator.clipboard.writeText(url); toast.success("Länken är kopierad."); }
    } catch { /* avbruten delning */ }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Mina annonser</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Visningar → klick → favoriter → bokningar → intäkter, samlat på ett ställe.
          </p>
        </div>
        <div className="flex gap-2">
          {listings.length === 0 && (
            <Button variant="outline" className="rounded-full" onClick={seedDemo} disabled={seeding}>
              <Sparkles className="mr-1 h-4 w-4" /> Fyll på med demoannonser
            </Button>
          )}
          <Button variant="outline" className="rounded-full" onClick={() => navigate({ to: "/bud" })}>
            Mina bud
          </Button>
          <Button className="rounded-full" onClick={() => navigate({ to: "/hyr-ut" })}>
            + Ny annons
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Visningar denna månad" value={String(kpis.views)} delta={kpis.viewsDelta} />
        <KpiCard label="Bokningar" value={String(kpis.bookings)} delta={kpis.bookingsDelta} />
        <KpiCard label="Intäkter" value={kr(kpis.revenue)} delta={kpis.revenueDelta} />
        <KpiCard label="Aktiva annonser" value={String(kpis.active)} hint={`${listings.length} totalt`} />
        <KpiCard label="Snittbetyg" value={kpis.rating ? kpis.rating.toFixed(1) : "–"} hint="Från verifierade omdömen" />
        <KpiCard label="Konverteringsgrad" value={`${kpis.conversion.toFixed(1)} %`} delta={kpis.conversionDelta} />
        <KpiCard label="Favoriter" value={String(kpis.favorites)} delta={kpis.favoritesDelta} />
        <KpiCard label="Bokningsförfrågningar" value={String(kpis.requests)} delta={kpis.requestsDelta} />
      </div>

      <div className="mt-4">
        <DemoNote>
          Trafiksiffror (visningar, klick, favoriter, delningar) är demodata tills en mätpunkt för besök har kopplats
          in. Bokningar och annonsstatus är riktiga uppgifter från ditt konto.
        </DemoNote>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-border p-5">
          <h2 className="font-display text-lg font-semibold">Senaste aktivitet</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {top.flatMap(({ l, t }) => [
              <li key={`${l.id}-v`}>{t.views} visningar av <span className="text-foreground">{l.title}</span> senaste 30 dagarna</li>,
              t.requests > 0 ? (
                <li key={`${l.id}-r`}>{t.requests} bokningsförfrågningar på <span className="text-foreground">{l.title}</span></li>
              ) : null,
            ]).filter(Boolean).slice(0, 5)}
            {!listings.length && <li>Ingen aktivitet ännu.</li>}
          </ul>
        </div>

        <div className="rounded-3xl border border-border p-5">
          <h2 className="font-display text-lg font-semibold">Kommande bokningar</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {upcoming.map((b) => (
              <li key={b.id} className="flex justify-between">
                <span className="text-muted-foreground">{b.start_date} – {b.end_date}</span>
                <span className="font-medium">{kr(Number(b.total_price))}</span>
              </li>
            ))}
            {!upcoming.length && <li className="text-sm text-muted-foreground">Inga bekräftade bokningar framåt.</li>}
          </ul>
        </div>

        <div className="rounded-3xl border border-border p-5">
          <h2 className="font-display text-lg font-semibold">Toppannonser</h2>
          <ol className="mt-3 space-y-2 text-sm">
            {top.map(({ l, t }, i) => (
              <li key={l.id} className="flex justify-between gap-2">
                <span className="truncate">{i + 1}. {l.title}</span>
                <span className="shrink-0 text-muted-foreground">{t.views} visn.</span>
              </li>
            ))}
            {!top.length && <li className="text-sm text-muted-foreground">Lägg upp din första annons.</li>}
          </ol>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mt-8">
        <TabsList className="flex-wrap">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
              <span className="ml-1 text-xs text-muted-foreground">
                {t.key === "all" ? listings.length : listings.filter((l) => (l.status ?? "published") === t.key).length}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="mt-5 space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Hämtar dina annonser …</p>}
        {!isLoading && !filtered.length && (
          <div className="rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Inga annonser med den statusen.
          </div>
        )}

        {filtered.map((l) => {
          const t = totals(seriesFor(l, 30));
          const meta = STATUS_META[l.status ?? "published"] ?? STATUS_META["published"]!;
          const quality = scoreListing({
            images: l.images ?? [],
            title: l.title,
            description: l.description ?? "",
            price_day: l.price_day,
            price_week: l.price_week,
            price_hour: l.price_hour,
            deposit: l.deposit,
            city: l.city,
            area: l.area,
            category_slug: l.category_slug,
            attributes: (l.attributes as Record<string, unknown>) ?? {},
          });
          const next = (data?.bookings ?? []).find((b) => b.listing_id === l.id && b.status === "confirmed");

          return (
            <div key={l.id} className="rounded-3xl border border-border p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row">
                <img
                  src={l.images?.[0] ?? ""}
                  alt={l.title}
                  loading="lazy"
                  className="h-40 w-full rounded-2xl object-cover sm:h-28 sm:w-40"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={`rounded-full border-0 ${meta.className}`}>{meta.label}</Badge>
                    <span className="text-xs text-muted-foreground">
                      Publicerad {new Date(l.published_at ?? l.created_at).toLocaleDateString("sv-SE")}
                    </span>
                    <span className="text-xs text-muted-foreground">· Kvalitet {quality.total}/100</span>
                  </div>
                  <h3 className="mt-1 truncate font-display text-lg font-semibold">{l.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {kr(l.price_day)}/dygn · {l.city}
                    {next ? ` · Nästa bokning ${next.start_date}` : " · Ledig"}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> {t.views} visningar</span>
                    <span className="flex items-center gap-1"><MousePointerClick className="h-3.5 w-3.5" /> {t.clicks} klick</span>
                    <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" /> {t.favorites} favoriter</span>
                    <span>{t.requests} förfrågningar</span>
                    <span>{t.bookings} bokningar</span>
                    <span className="text-foreground">{kr(t.revenue)} intäkter</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="rounded-full" asChild>
                  <Link to="/hyr-ut" search={{ id: l.id }}><Pencil className="mr-1 h-4 w-4" /> Redigera</Link>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => setStatus(l.id, l.status === "paused" ? "published" : "paused")}
                >
                  {l.status === "paused" ? <><Play className="mr-1 h-4 w-4" /> Aktivera</> : <><Pause className="mr-1 h-4 w-4" /> Pausa</>}
                </Button>
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => duplicate(l)}>
                  <Copy className="mr-1 h-4 w-4" /> Duplicera
                </Button>
                <Button size="sm" variant="outline" className="rounded-full" asChild>
                  <Link to="/annons/$id" params={{ id: l.id }}><ExternalLink className="mr-1 h-4 w-4" /> Visa annons</Link>
                </Button>
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => share(l.id, l.title)}>
                  <Share2 className="mr-1 h-4 w-4" /> Dela
                </Button>
                <Button size="sm" variant="outline" className="rounded-full" asChild>
                  <Link to="/annonser/$id/statistik" params={{ id: l.id }}>
                    <BarChart3 className="mr-1 h-4 w-4" /> Statistik
                  </Link>
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="ghost" className="rounded-full text-destructive">
                      <Trash2 className="mr-1 h-4 w-4" /> Ta bort
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Ta bort annonsen?</AlertDialogTitle>
                      <AlertDialogDescription>
                        ”{l.title}” tas bort permanent. Befintliga bokningar påverkas inte.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Avbryt</AlertDialogCancel>
                      <AlertDialogAction onClick={() => remove(l.id)}>Ta bort</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
