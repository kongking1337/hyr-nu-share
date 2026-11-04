import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Clock, MapPin, Repeat, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { BlockUserButton } from "@/components/BlockUserButton";
import { ListingCard } from "@/components/ListingCard";
import { ReportDialog } from "@/components/ReportDialog";
import { Stars } from "@/components/Stars";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { rowToUnified } from "@/lib/providers/internal";

export const Route = createFileRoute("/profil/$id")({
  head: () => ({
    meta: [
      { title: "Profil – Hyrkoll" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProfilePage,
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  const validId = UUID.test(id);
  const { data: profile, isLoading, isError, refetch } = useQuery({
    queryKey: ["public-profile", id],
    enabled: validId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("public_profile", { _user_id: id });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ["public-reviews", id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("public_reviews", { _user_id: id });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: listings = [] } = useQuery({
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
    if (!window.confirm("Ta bort omdömet? Det går inte att ångra.")) return;
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
      <div className="mx-auto max-w-5xl px-4 py-10">
        <Skeleton className="h-48 rounded-3xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-5xl p-10 text-center text-muted-foreground">
        <h1 className="font-display text-2xl font-semibold text-foreground">Profilen kunde inte hämtas</h1>
        <Button className="mt-4 rounded-full" onClick={() => void refetch()}>
          Försök igen
        </Button>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-5xl p-10 text-center text-muted-foreground">
        <h1 className="font-display text-2xl font-semibold text-foreground">Profilen finns inte</h1>
      </div>
    );
  }

  const mine = user?.id === profile.id;
  const rentals = profile.rentals_as_owner + profile.rentals_as_renter;
  const rating = profile.rating == null ? null : Number(profile.rating);

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10">
      <section className="rounded-3xl border border-border bg-card p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div
            aria-hidden
            className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-primary/15 font-display text-3xl font-semibold text-primary"
          >
            {profile.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <h1 className="font-display text-3xl font-semibold">{profile.name}</h1>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span>{profile.account_type === "company" ? "Företag" : "Privatperson"}</span>
              {profile.city && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" /> {profile.city}
                </span>
              )}
              <span>Medlem sedan {monthYear(profile.member_since)}</span>
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              {rating != null && profile.review_count > 0 ? (
                <span className="flex items-center gap-1.5">
                  <Stars value={rating} />
                  <span className="font-medium">{rating.toLocaleString("sv-SE")}</span>
                  <span className="text-muted-foreground">
                    ({profile.review_count} {profile.review_count === 1 ? "omdöme" : "omdömen"})
                  </span>
                </span>
              ) : (
                <span className="text-muted-foreground">Inga omdömen än</span>
              )}
              <span className="flex items-center gap-1 text-muted-foreground">
                <Repeat className="h-4 w-4" /> {rentals} avslutade {rentals === 1 ? "hyra" : "hyror"}
              </span>
              {profile.response_hours != null && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-4 w-4" /> {responseLabel(Number(profile.response_hours))}
                </span>
              )}
            </div>
            {profile.phone_verified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                <BadgeCheck className="h-4 w-4" /> Verifierat telefonnummer
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2 sm:flex-col sm:items-end">
            {mine ? (
              <Button asChild variant="outline" className="rounded-full">
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
          <div className="mt-6 border-t border-border pt-5">
            <h2 className="font-display text-lg font-semibold">Om mig</h2>
            <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{profile.bio}</p>
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold">
          Annonser <span className="text-base font-normal text-muted-foreground">({listings.length})</span>
        </h2>
        {listings.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Inga annonser just nu.</p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((l) => (
              <ListingCard key={l.id} result={l} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold">
          Omdömen <span className="text-base font-normal text-muted-foreground">({reviews.length})</span>
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Omdömen kan bara skrivas efter en avslutad hyra på Hyrkoll.
        </p>
        {reviews.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Inga omdömen än.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-3xl border border-border p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Stars value={r.rating} />
                    {r.subject_role && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {r.subject_role === "owner" ? "Som uthyrare" : "Som hyresgäst"}
                      </span>
                    )}
                  </div>
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-full text-destructive"
                      onClick={() => void deleteReview(r.id)}
                    >
                      <Trash2 className="mr-1 h-4 w-4" /> Ta bort
                    </Button>
                  )}
                </div>
                {r.body && <p className="mt-2 whitespace-pre-line text-sm">{r.body}</p>}
                <p className="mt-2 text-xs text-muted-foreground">
                  {r.author_name} · {r.listing_title} · {monthYear(r.published_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
