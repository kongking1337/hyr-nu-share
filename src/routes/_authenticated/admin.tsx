import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Ban, Check, EyeOff, Flag, Inbox, MessagesSquare, RotateCcw, Search, ShieldCheck, UserCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { Count } from "@/components/Header";
import { EmptyState, LoadingRows, Page, PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useNotificationCounts } from "@/hooks/useNotificationCounts";
import type { Database } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";

type Report = Database["public"]["Functions"]["admin_reports"]["Returns"][number];

/**
 * Moderering. Bara administratörer släpps in; databasfunktionerna (admin_*) kontrollerar
 * dessutom själva att den som anropar är administratör.
 */
export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async ({ context }) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!data) throw redirect({ to: "/" });
  },
  head: () => ({
    meta: [{ title: "Moderering – Hyrkoll" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminPage,
});

const TARGET_LABEL: Record<string, string> = {
  listing: "Annons",
  conversation: "Konversation",
  user: "Användare",
  message: "Meddelande",
};

const STATUS_LABEL: Record<string, string> = {
  published: "Publicerad",
  paused: "Pausad",
  draft: "Utkast",
  sold: "Såld",
  removed: "Dold av moderator",
};

function useAdminActions() {
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all(
      ["admin-reports", "admin-listings", "admin-blocked", "admin-report-count", "admin-trust"].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    );
  const run = async (
    action: PromiseLike<{ error: { message: string } | null }>,
    success: string,
  ) => {
    const { error } = await action;
    if (error) {
      toast.error(error.message);
      return false;
    }
    toast.success(success);
    await refresh();
    return true;
  };
  return {
    hide: (listingId: string, reason: string) =>
      run(
        supabase.rpc("admin_set_listing_hidden", {
          _listing_id: listingId,
          _hidden: true,
          _reason: reason,
        }),
        "Annonsen är dold.",
      ),
    restore: (listingId: string) =>
      run(
        supabase.rpc("admin_set_listing_hidden", { _listing_id: listingId, _hidden: false }),
        "Annonsen är publicerad igen.",
      ),
    dismiss: (reportId: string) =>
      run(supabase.rpc("admin_dismiss_report", { _report_id: reportId }), "Anmälan är avfärdad."),
    block: (userId: string, name: string) => {
      if (
        !window.confirm(
          `Spärra ${name}? Alla hens annonser döljs och hen kan inte längre skicka meddelanden.`,
        )
      ) {
        return Promise.resolve(false);
      }
      return run(
        supabase.rpc("admin_set_user_blocked", { _user_id: userId, _blocked: true }),
        `${name} är spärrad.`,
      );
    },
    unblock: (userId: string) =>
      run(
        supabase.rpc("admin_set_user_blocked", { _user_id: userId, _blocked: false }),
        "Spärren är hävd.",
      ),
  };
}

function AdminPage() {
  const { openReports } = useNotificationCounts();
  const tab =
    "h-9 shrink-0 gap-2 rounded-full px-4 font-semibold data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-none";
  return (
    <Page width="wide">
      <PageHeader
        title="Moderering"
        description="Hantera anmälningar, dölj annonser och spärra användare. Annonsören ser skälet när en annons döljs."
      />
      <Tabs defaultValue="reports">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList className="h-auto justify-start gap-1 rounded-full p-1">
            <TabsTrigger value="reports" className={tab}>
              Anmälningar
              <Count n={openReports} />
            </TabsTrigger>
            <TabsTrigger value="listings" className={tab}>
              Annonser
            </TabsTrigger>
            <TabsTrigger value="blocked" className={tab}>
              Spärrade användare
            </TabsTrigger>
            <TabsTrigger value="trust" className={tab}>
              Förtroende
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="reports" className="mt-6">
          <ReportsTab />
        </TabsContent>
        <TabsContent value="listings" className="mt-6">
          <ListingsTab />
        </TabsContent>
        <TabsContent value="blocked" className="mt-6">
          <BlockedTab />
        </TabsContent>
        <TabsContent value="trust" className="mt-6">
          <TrustTab />
        </TabsContent>
      </Tabs>
    </Page>
  );
}

type Tone = "neutral" | "muted" | "danger";
const TONE: Record<Tone, string> = {
  neutral: "bg-muted text-foreground",
  muted: "bg-muted text-muted-foreground",
  danger: "bg-destructive/10 text-destructive",
};

/** Liten statusetikett. Rött bara för det som kräver uppmärksamhet (dold, spärrad, många anmälningar). */
function StatusBadge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", TONE[tone])}>
      {children}
    </span>
  );
}

function ListingStatusBadge({ status }: { status: string }) {
  const tone: Tone = status === "removed" ? "danger" : status === "published" ? "neutral" : "muted";
  return <StatusBadge tone={tone}>{STATUS_LABEL[status] ?? status}</StatusBadge>;
}

const dateTime = (iso: string) => new Date(iso).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" });

/** Knapp för åtgärder som går ut över någon (spärra): tydligt röd men inte fylld. */
const dangerOutline = "border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive";

function ReportsTab() {
  const [open, setOpen] = useState(true);
  const { data: reports, isLoading } = useQuery({
    queryKey: ["admin-reports", open],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_reports", { _open: open });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Visa anmälningar" className="flex gap-2">
        {[true, false].map((o) => (
          <Button
            key={String(o)}
            size="sm"
            variant={open === o ? "secondary" : "outline"}
            aria-pressed={open === o}
            onClick={() => setOpen(o)}
          >
            {o ? "Öppna" : "Hanterade"}
          </Button>
        ))}
      </div>
      {isLoading && <LoadingRows rows={3} />}
      {reports?.length === 0 && (
        <EmptyState icon={open ? ShieldCheck : Inbox} title={open ? "Inga öppna anmälningar" : "Inga hanterade anmälningar ännu"}>
          {open
            ? "Allt är genomgånget. Nya anmälningar dyker upp här och räknas i menyn."
            : "Anmälningar som du avfärdar eller åtgärdar hamnar här."}
        </EmptyState>
      )}
      {reports?.map((r) => (
        <ReportCard key={r.id} report={r} />
      ))}
    </div>
  );
}

function ReportCard({ report: r }: { report: Report }) {
  const actions = useAdminActions();
  const [showConversation, setShowConversation] = useState(false);
  const [hideReason, setHideReason] = useState(r.reason);
  const isOpen = !r.resolved_at;

  const { data: messages } = useQuery({
    queryKey: ["admin-conversation", r.target_id],
    enabled: showConversation,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_reported_conversation", {
        _conversation_id: r.target_id,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <article className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
        <StatusBadge>{TARGET_LABEL[r.target_type] ?? r.target_type}</StatusBadge>
        {r.reports_on_target > 1 && (
          <StatusBadge tone="danger">
            <Flag className="h-3 w-3" aria-hidden /> {r.reports_on_target} öppna anmälningar
          </StatusBadge>
        )}
        <span>
          {dateTime(r.created_at)} · anmäld av {r.reporter_name}
        </span>
      </div>

      <h3 className="mt-3 font-sans text-base font-semibold tracking-normal">{r.reason}</h3>
      {r.details && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{r.details}</p>}

      {(r.target_type === "listing" || r.reported_user_name) && (
        <dl className="mt-4 grid gap-2 rounded-xl bg-muted p-3 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
          {r.target_type === "listing" && (
            <>
              <dt className="text-muted-foreground">Annons</dt>
              <dd className="flex flex-wrap items-center gap-2">
                {r.listing_title ? (
                  <Link
                    to="/annons/$id"
                    params={{ id: r.target_id }}
                    className="rounded-sm font-medium underline decoration-border underline-offset-4 hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {r.listing_title}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">Borttagen</span>
                )}
                {r.listing_status && <ListingStatusBadge status={r.listing_status} />}
              </dd>
            </>
          )}
          {r.reported_user_name && (
            <>
              <dt className="text-muted-foreground">Anmäld användare</dt>
              <dd className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.reported_user_name}</span>
                {r.reported_user_blocked && <StatusBadge tone="danger">Spärrad</StatusBadge>}
              </dd>
            </>
          )}
        </dl>
      )}

      {r.target_type === "conversation" && (
        <div className="mt-4">
          <Button
            size="sm"
            variant="outline"
            aria-expanded={showConversation}
            onClick={() => setShowConversation((s) => !s)}
          >
            <MessagesSquare /> {showConversation ? "Dölj konversationen" : "Visa konversationen"}
          </Button>
          {showConversation && (
            <ul className="mt-3 space-y-3 rounded-xl bg-muted p-4 text-sm">
              {messages?.map((m, i) => (
                <li key={i}>
                  <p>
                    <span className="font-semibold">{m.sender_name}</span>{" "}
                    <span className="text-xs text-muted-foreground">{dateTime(m.created_at)}</span>
                  </p>
                  <p className="mt-0.5 whitespace-pre-line">{m.body}</p>
                </li>
              ))}
              {messages?.length === 0 && <li className="text-muted-foreground">Inga meddelanden.</li>}
            </ul>
          )}
        </div>
      )}

      {isOpen ? (
        <div className="mt-5 space-y-3 border-t border-border pt-4">
          {r.target_type === "listing" && r.listing_status && r.listing_status !== "removed" && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={hideReason}
                onChange={(e) => setHideReason(e.target.value)}
                className="sm:max-w-sm"
                aria-label="Skäl som visas för annonsören"
                placeholder="Skäl som visas för annonsören"
              />
              <Button variant="destructive" className="shrink-0" onClick={() => actions.hide(r.target_id, hideReason)}>
                <EyeOff /> Dölj annonsen
              </Button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => actions.dismiss(r.id)}>
              <Check /> Avfärda
            </Button>
            {r.reported_user_id && !r.reported_user_blocked && (
              <Button
                size="sm"
                variant="outline"
                className={dangerOutline}
                onClick={() => actions.block(r.reported_user_id!, r.reported_user_name ?? "användaren")}
              >
                <Ban /> Spärra {r.reported_user_name}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-5 border-t border-border pt-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{r.resolution}</span> · {dateTime(r.resolved_at!)}
        </p>
      )}
    </article>
  );
}

function ListingsTab() {
  const actions = useAdminActions();
  const [search, setSearch] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const { data: listings, isLoading } = useQuery({
    queryKey: ["admin-listings", search],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_listings", { _search: search.trim() });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Sök på rubrik …"
          aria-label="Sök annonser på rubrik"
          className="pl-10"
        />
      </div>
      {isLoading && <LoadingRows rows={4} />}
      {listings && listings.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {listings.map((l) => (
            <li key={l.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to="/annons/$id"
                    params={{ id: l.id }}
                    className="min-w-0 rounded-sm font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {l.title}
                  </Link>
                  <ListingStatusBadge status={l.status} />
                  {l.owner_blocked && <StatusBadge tone="danger">Ägaren spärrad</StatusBadge>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {l.city} · {l.owner_id ? l.owner_name : "Exempelannons"}
                </p>
                {l.moderation_reason && (
                  <p className="mt-1 text-sm text-destructive">Skäl: {l.moderation_reason}</p>
                )}
              </div>
              {l.status === "removed" ? (
                <Button size="sm" variant="outline" className="self-start lg:self-auto" onClick={() => actions.restore(l.id)}>
                  <RotateCcw /> Återställ
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Input
                    value={reasons[l.id] ?? ""}
                    onChange={(e) => setReasons((r) => ({ ...r, [l.id]: e.target.value }))}
                    placeholder="Skäl"
                    className="h-9 min-w-0 flex-1 lg:w-48 lg:flex-none"
                    aria-label={`Skäl för att dölja ${l.title}`}
                  />
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-9 shrink-0"
                    onClick={() => actions.hide(l.id, reasons[l.id] ?? "")}
                  >
                    <EyeOff /> Dölj
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {listings?.length === 0 && (
        <EmptyState icon={Search} title="Inga annonser hittades">
          {search.trim() ? "Prova ett annat ord ur rubriken." : "Det finns inga annonser än."}
        </EmptyState>
      )}
    </div>
  );
}

function BlockedTab() {
  const actions = useAdminActions();
  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-blocked"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_blocked_users");
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-4">
      {isLoading && <LoadingRows rows={2} />}
      {users && users.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-semibold">{u.name}</p>
                <p className="text-sm text-muted-foreground">
                  Spärrad {new Date(u.blocked_at).toLocaleDateString("sv-SE")}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => actions.unblock(u.id)}>
                Häv spärr
              </Button>
            </li>
          ))}
        </ul>
      )}
      {users?.length === 0 && (
        <EmptyState icon={UserCheck} title="Inga spärrade användare">
          Du kan spärra en användare från en anmälan eller under Förtroende.
        </EmptyState>
      )}
      <p className="max-w-2xl text-sm text-muted-foreground">
        När spärren hävs kommer annonserna inte tillbaka automatiskt. Återställ dem under Annonser om
        det behövs.
      </p>
    </div>
  );
}

/**
 * Dolt förtroendevärde 0–100 per användare (admin_trust_scores), lägst först. Syns bara
 * här, aldrig för användaren själv eller andra.
 */
function TrustTab() {
  const actions = useAdminActions();
  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-trust"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_trust_scores");
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Ett grovt värde för att hitta troliga bedragare tidigt. Börjar på 50. Upp: kontots ålder,
        avslutade hyror och bra omdömen. Ner: anmälningar (−5 öppna, −15 åtgärdade), dolda annonser
        (−10), användare som blockerat personen (−5) och spärr. Lägst först.
      </p>
      {isLoading && <LoadingRows rows={4} />}
      {users && users.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {users.map((u) => (
            <li key={u.user_id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span
                  className={cn(
                    "grid h-11 w-11 shrink-0 place-items-center rounded-full font-display font-bold tabular-nums",
                    u.score < 30
                      ? "bg-destructive/10 text-destructive"
                      : u.score < 50
                        ? "bg-accent text-accent-foreground"
                        : "bg-muted text-foreground",
                  )}
                  title="Förtroendevärde"
                  aria-label={`Förtroendevärde ${u.score} av 100`}
                >
                  {u.score}
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    {u.blocked ? (
                      <span className="font-semibold">{u.name}</span>
                    ) : (
                      <Link
                        to="/profil/$id"
                        params={{ id: u.user_id }}
                        className="rounded-sm font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {u.name}
                      </Link>
                    )}
                    {u.blocked && <StatusBadge tone="danger">Spärrad</StatusBadge>}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {u.member_days} dagar · {u.listings} annonser · {u.completed_rentals} hyror
                    {u.review_count > 0 && ` · ${u.rating} i snitt (${u.review_count})`}
                    {u.reports_open + u.reports_upheld > 0 &&
                      ` · anmälningar: ${u.reports_open} öppna, ${u.reports_upheld} åtgärdade`}
                    {u.removed_listings > 0 && ` · ${u.removed_listings} dolda annonser`}
                    {u.blocked_by > 0 && ` · blockerad av ${u.blocked_by}`}
                  </p>
                </div>
              </div>
              {!u.blocked && u.score < 30 && (
                <Button
                  size="sm"
                  variant="outline"
                  className={dangerOutline}
                  onClick={() => void actions.block(u.user_id, u.name)}
                >
                  <Ban /> Spärra
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {users?.length === 0 && <EmptyState icon={Users} title="Inga användare än" />}
    </div>
  );
}
