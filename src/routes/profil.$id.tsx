import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Clock, MapPin, MessageSquareQuote, Package, Repeat, Trash2, UserX } from "lucide-react";
import { toast } from "sonner";
import { BlockUserButton } from "@/components/BlockUserButton";
import { ListingCard } from "@/components/ListingCard";
import { EmptyState, LoadingCards, LoadingRows, Page } from "@/components/layout";
import { ReportDialog } from "@/components/ReportDialog";
import { Stars } from "@/components/Stars";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { rowToUnified } from "@/lib/providers/internal";
import { DEFAULTS } from "@/lib/search/params";

export const Route = createFileRoute("/profil/$id")({
  head: () => ({
    meta: [
      { title: "Profil – Hyrkoll" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProfilePage,
});

/** "november 2026" */
const monthYear = (iso: string) =>
  new Date(iso).toLocaleDateString("sv-SE", { month: "long", year: "numeric" });

function responseLabel(hours: number): string {
  if (hours < 1) return "Svarar oftast inom en timme";
  const h = Math.round(hours);
  if (h < 24) return `Svarar oftast inom ${h} ${h === 1 ? "timme" : "timmar"}`;
  const d = Math.round(hours / 24);
  return `Svarar oftast inom ${d} ${d === 1 ? "dag" : "dagar"}`;
}

/** Offentlig profil: bara offentliga uppgifter (public_profile), aldrig e-post eller telefonnummer. */
function ProfilePage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const isAdmin = useIsAdmin();
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["public-profile", id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("public_profile", { _user_id: id });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  const { data: reviews = [], isPending: reviewsPending } = useQuery({
    queryKey: ["public-reviews", id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("public_reviews", { _user_id: id });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: listings = [], isPending: listingsPending } = useQuery({
    queryKey: ["profile-listings", id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("*")
        .eq("owner_id", id)
        .eq("status", "published")
        .eq("listing_type", "rent")
        .order("published_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(rowToUnified);
    },
  });

  async function deleteReview(reviewId: string) {
    const { error } = await supabase.rpc("admin_delete_review", { _review_id: reviewId });
    if (error) {
      toast.error("Omdömet kunde inte tas bort.");
      return;
    }
    toast.success("Omdömet är borttaget.");
    void queryClient.invalidateQueries({ queryKey: ["public-reviews", id] });
    void queryClient.invalidateQueries({ queryKey: ["public-profile", id] });
  }

  if (isLoading) {
    return (
      <Page width="wide">
        <div className="flex items-start gap-4 sm:gap-7" aria-busy="true" aria-label="Laddar profilen">
          <Skeleton className="h-16 w-16 shrink-0 rounded-full sm:h-24 sm:w-24" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-4 w-72 max-w-full" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <LoadingCards count={3} className="mt-14" />
      </Page>
    );
  }

  if (!profile) {
    return (
      <Page width="text">
        <EmptyState
          icon={UserX}
          title="Profilen finns inte"
          action={
            <Button asChild>
              <Link to="/sok" search={DEFAULTS}>
                Sök bland annonserna
              </Link>
            </Button>
          }
        >
          Kontot kan ha raderats, eller så är länken fel.
        </EmptyState>
      </Page>
    );
  }

  const mine = user?.id === profile.id;
  const rentals = profile.rentals_as_owner + profile.rentals_as_renter;
  const rating = profile.rating == null ? null : Number(profile.rating);
  const firstName = profile.name.split(" ")[0] ?? profile.name;

  return (
    <Page width="wide">
      <section aria-labelledby="profile-name" className="border-b border-border pb-8 sm:pb-10">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-5 sm:flex-nowrap sm:gap-7">
          <div
            aria-hidden
            className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-accent font-display text-3xl font-bold text-accent-foreground sm:h-24 sm:w-24 sm:text-5xl"
          >
            {profile.name.charAt(0).toUpperCase()}
          </div>

          <div className="min-w-0 flex-1 basis-48">
            <h1
              id="profile-name"
              className="break-words font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl"
            >
              {profile.name}
            </h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <span>{profile.account_type === "company" ? "Företag" : "Privatperson"}</span>
              {profile.city && (
                <>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> {profile.city}
                  </span>
                </>
              )}
              <span aria-hidden>·</span>
              <span>Medlem sedan {monthYear(profile.member_since)}</span>
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {rating != null && profile.review_count > 0 ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-sm">
                  <Stars value={rating} />
                  <span className="font-semibold">{rating.toLocaleString("sv-SE")}</span>
                  <span className="text-muted-foreground">
                    {profile.review_count} {profile.review_count === 1 ? "omdöme" : "omdömen"}
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-muted px-3 py-1.5 text-sm text-muted-foreground">
                  Inga omdömen än
                </span>
              )}
              {profile.phone_verified && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-sm font-medium">
                  <BadgeCheck className="h-4 w-4 text-primary" /> Verifierat telefonnummer
                </span>
              )}
            </div>

            <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Repeat className="h-4 w-4" aria-hidden />
                <dt className="sr-only">Avslutade hyror</dt>
                <dd>
                  {rentals} avslutade {rentals === 1 ? "hyra" : "hyror"}
                </dd>
              </div>
              {profile.response_hours != null && (
                <div className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4" aria-hidden />
                  <dt className="sr-only">Svarstid</dt>
                  <dd>{responseLabel(Number(profile.response_hours))}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="flex flex-wrap gap-2 sm:justify-end">
            {mine ? (
              <Button asChild variant="outline">
                <Link to="/konto">Redigera din profil</Link>
              </Button>
            ) : (
              user && (
                <>
                  <ReportDialog targetType="user" targetId={profile.id} label="Anmäl användare" />
                  <BlockUserButton userId={profile.id} name={profile.name} />
                </>
              )
            )}
          </div>
        </div>

        {profile.bio && (
          <div className="mt-8 max-w-[70ch] sm:pl-[7.75rem]">
            <h2 className="font-display text-lg font-bold">Om mig</h2>
            <p className="mt-2 whitespace-pre-line leading-relaxed text-muted-foreground">{profile.bio}</p>
          </div>
        )}
      </section>

      <section aria-labelledby="profile-listings" className="mt-10 sm:mt-12">
        <SectionTitle id="profile-listings" count={listingsPending ? undefined : listings.length}>
          Annonser
        </SectionTitle>
        {listingsPending ? (
          <LoadingCards count={3} className="mt-5" />
        ) : listings.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Inga annonser just nu"
            className="mt-5"
            action={
              mine ? (
                <Button asChild>
                  <Link to="/ny-annons">Lägg upp annons</Link>
                </Button>
              ) : (
                <Button asChild variant="outline">
                  <Link to="/sok" search={DEFAULTS}>
                    Sök bland andras annonser
                  </Link>
                </Button>
              )
            }
          >
            {mine
              ? "Har du något som står oanvänt? Lägg upp det så syns det här."
              : `${firstName} har inget att hyra ut just nu.`}
          </EmptyState>
        ) : (
          <div className="mt-5 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((l) => (
              <ListingCard key={l.id} result={l} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="profile-reviews" className="mt-12 sm:mt-16">
        <SectionTitle id="profile-reviews" count={reviewsPending ? undefined : reviews.length}>
          Omdömen
        </SectionTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Omdömen kan bara skrivas efter en avslutad hyra på Hyrkoll.
        </p>
        {reviewsPending ? (
          <LoadingRows rows={2} className="mt-5" />
        ) : reviews.length === 0 ? (
          <EmptyState icon={MessageSquareQuote} title="Inga omdömen än" className="mt-5">
            {mine
              ? "När du har hyrt ut eller hyrt något kan den andra skriva ett omdöme om dig."
              : `När ${firstName} har hyrt ut eller hyrt något visas omdömena här.`}
          </EmptyState>
        ) : (
          <ul className="mt-5 grid gap-4 md:grid-cols-2">
            {reviews.map((r) => (
              <li key={r.id} className="flex flex-col rounded-2xl border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted font-display font-bold"
                    >
                      {r.author_name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{r.author_name}</p>
                      <p className="text-xs text-muted-foreground">{monthYear(r.published_at)}</p>
                    </div>
                  </div>
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => void deleteReview(r.id)}
                    >
                      <Trash2 /> Ta bort
                    </Button>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Stars value={r.rating} />
                  {r.subject_role && (
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                      {r.subject_role === "owner" ? "Som uthyrare" : "Som hyresgäst"}
                    </span>
                  )}
                </div>
                {r.body && <p className="mt-3 whitespace-pre-line leading-relaxed">{r.body}</p>}
                <p className="mt-auto pt-3 text-xs text-muted-foreground">Hyrde {r.listing_title}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Page>
  );
}

function SectionTitle({ id, count, children }: { id: string; count?: number | undefined; children: string }) {
  return (
    <h2 id={id} className="font-display text-2xl font-bold">
      {children}
      {count != null && <span className="ml-2 text-base font-normal text-muted-foreground">{count}</span>}
    </h2>
  );
}
