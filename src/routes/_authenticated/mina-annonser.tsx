import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Copy,
  ExternalLink,
  Package,
  Pause,
  Pencil,
  Play,
  Plus,
  Share2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AvailabilityDialog } from "@/components/AvailabilityDialog";
import { EmptyState, LoadingRows, Page, PageHeader } from "@/components/layout";
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
import { photoUrl, removeUnusedPhotos } from "@/lib/photos";
import { userMessage } from "@/lib/db-errors";
import { priceLabel } from "@/lib/pricing";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/mina-annonser")({
  head: () => ({
    meta: [
      { title: "Mina annonser – Hyrkoll" },
      { name: "description", content: "Redigera, pausa, duplicera och ta bort dina annonser." },
      { property: "og:title", content: "Mina annonser – Hyrkoll" },
      { property: "og:description", content: "Hantera dina annonser på Hyrkoll." },
    ],
  }),
  component: MyListings,
});

export const STATUS_META: Record<string, { label: string; className: string }> = {
  published: { label: "Publicerad", className: "bg-accent text-accent-foreground" },
  paused: { label: "Pausad", className: "bg-muted text-muted-foreground" },
  draft: { label: "Utkast", className: "border border-dashed border-input text-muted-foreground" },
  sold: { label: "Såld", className: "bg-muted text-muted-foreground" },
  removed: { label: "Borttagen av moderator", className: "bg-destructive/10 text-destructive" },
};

const TABS = [
  { key: "all", label: "Alla" },
  { key: "published", label: "Publicerade" },
  { key: "paused", label: "Pausade" },
  { key: "draft", label: "Utkast" },
];

const STATUS_TOAST: Record<string, string> = {
  paused: "Annonsen är pausad.",
  published: "Annonsen är publicerad.",
};

function MyListings() {
  const { user } = useAuth();
  const [tab, setTab] = useState("all");

  const { data, refetch, isLoading } = useQuery({
    queryKey: ["my-listings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: listings } = await supabase
        .from("listings")
        .select("*")
        .eq("owner_id", user!.id)
        .order("created_at", { ascending: false });
      return { listings: listings ?? [] };
    },
  });

  const listings = data?.listings ?? [];

  const filtered = tab === "all" ? listings : listings.filter((l) => (l.status ?? "published") === tab);

  async function setStatus(id: string, status: string) {
    const { error } = await supabase.from("listings").update({ status }).eq("id", id);
    if (error) { toast.error("Kunde inte uppdatera status."); return; }
    toast.success(STATUS_TOAST[status] ?? "Status uppdaterad.");
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
    const images = listings.find((l) => l.id === id)?.images ?? [];
    const { error } = await supabase.from("listings").delete().eq("id", id);
    if (error) { toast.error(userMessage(error, "Kunde inte ta bort annonsen.")); return; }
    void removeUnusedPhotos(user!.id, images);
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

  const countFor = (key: string) =>
    key === "all" ? listings.length : listings.filter((l) => (l.status ?? "published") === key).length;

  return (
    <Page>
      <PageHeader
        title="Mina annonser"
        description="Redigera, pausa, duplicera och ta bort dina annonser."
        actions={
          <Button asChild>
            <Link to="/ny-annons">
              <Plus aria-hidden /> Lägg upp annons
            </Link>
          </Button>
        }
      />

      {isLoading ? (
        <LoadingRows rows={3} />
      ) : listings.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Du har inga annonser än"
          action={
            <Button asChild>
              <Link to="/ny-annons">
                <Plus aria-hidden /> Lägg upp annons
              </Link>
            </Button>
          }
        >
          Fota något du sällan använder, sätt ett pris per dygn och låt grannarna hyra det.
        </EmptyState>
      ) : (
        <>
          <Tabs value={tab} onValueChange={setTab} className="mb-6">
            <TabsList aria-label="Visa annonser" className="h-auto flex-wrap justify-start gap-1 rounded-full p-1">
              {TABS.map((t) => (
                <TabsTrigger key={t.key} value={t.key} className="gap-1.5 rounded-full px-4 py-1.5">
                  {t.label}
                  <span className="text-xs tabular-nums text-muted-foreground">{countFor(t.key)}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {!filtered.length ? (
            <EmptyState
              title="Inga annonser med den statusen"
              action={
                <Button variant="outline" onClick={() => setTab("all")}>
                  Visa alla annonser
                </Button>
              }
            />
          ) : (
            <ul className="space-y-4">
              {filtered.map((l) => {
                const meta = STATUS_META[l.status ?? "published"] ?? STATUS_META["published"]!;
                const listingType = l.listing_type === "sale" ? "sale" : "rent";
                const price = priceLabel({ listingType, price: l.price, priceDay: Number(l.price_day ?? 0) });
                const active = l.status === "published" || l.status === "paused";

                return (
                  <li key={l.id}>
                    <article className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                      <div className="flex gap-4">
                        <img
                          src={photoUrl(l.images?.[0])}
                          alt={l.title}
                          loading="lazy"
                          decoding="async"
                          className={cn(
                            "h-20 w-20 shrink-0 rounded-xl bg-muted object-cover sm:h-28 sm:w-36",
                            l.status !== "published" && "opacity-70",
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
                                meta.className,
                              )}
                            >
                              {meta.label}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Publicerad {new Date(l.published_at ?? l.created_at).toLocaleDateString("sv-SE")}
                            </span>
                          </div>
                          <h3 className="mt-1.5 line-clamp-2 font-sans text-base font-semibold leading-snug tracking-normal sm:text-lg">
                            {l.title}
                          </h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            <span className="font-semibold text-foreground">{price}</span> · {l.city}
                          </p>
                        </div>
                      </div>

                      {l.status === "removed" && (
                        <p className="mt-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                          Dold av Hyrkolls moderatorer{l.moderation_reason ? `: ${l.moderation_reason}` : ""}. Tycker du
                          att det är fel?{" "}
                          <Link to="/kontakt" className="font-semibold underline underline-offset-4">
                            Kontakta oss
                          </Link>
                          .
                        </p>
                      )}

                      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
                        <Button size="sm" variant="outline" asChild>
                          <Link to="/ny-annons" search={{ id: l.id }}>
                            <Pencil aria-hidden /> Redigera
                          </Link>
                        </Button>
                        {active && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setStatus(l.id, l.status === "paused" ? "published" : "paused")}
                          >
                            {l.status === "paused" ? (
                              <>
                                <Play aria-hidden /> Aktivera
                              </>
                            ) : (
                              <>
                                <Pause aria-hidden /> Pausa
                              </>
                            )}
                          </Button>
                        )}
                        {active && <AvailabilityDialog listingId={l.id} title={l.title} />}
                        {l.status === "sold" && (
                          <Button size="sm" variant="outline" onClick={() => setStatus(l.id, "published")}>
                            <Play aria-hidden /> Publicera igen
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" asChild>
                          <Link to="/annons/$id" params={{ id: l.id }}>
                            <ExternalLink aria-hidden /> Visa annons
                          </Link>
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => duplicate(l)}>
                          <Copy aria-hidden /> Duplicera
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => share(l.id, l.title)}>
                          <Share2 aria-hidden /> Dela
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive sm:ml-auto"
                            >
                              <Trash2 aria-hidden /> Ta bort
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Ta bort annonsen?</AlertDialogTitle>
                              <AlertDialogDescription>”{l.title}” tas bort permanent.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Avbryt</AlertDialogCancel>
                              <AlertDialogAction onClick={() => remove(l.id)}>Ta bort</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Page>
  );
}
