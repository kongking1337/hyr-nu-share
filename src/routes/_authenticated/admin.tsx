import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
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
      ["admin-reports", "admin-listings", "admin-blocked", "admin-report-count"].map((key) =>
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
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-display text-3xl font-semibold">Moderering</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Hantera anmälningar, dölj annonser och spärra användare. Annonsören ser skälet när en annons
        döljs.
      </p>
      <Tabs defaultValue="reports" className="mt-6">
        <TabsList>
          <TabsTrigger value="reports">Anmälningar</TabsTrigger>
          <TabsTrigger value="listings">Annonser</TabsTrigger>
          <TabsTrigger value="blocked">Spärrade användare</TabsTrigger>
        </TabsList>
        <TabsContent value="reports" className="pt-4">
          <ReportsTab />
        </TabsContent>
        <TabsContent value="listings" className="pt-4">
          <ListingsTab />
        </TabsContent>
        <TabsContent value="blocked" className="pt-4">
          <BlockedTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

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
    <div className="space-y-3">
      <div className="flex gap-2">
        {[true, false].map((o) => (
          <Button
            key={String(o)}
            size="sm"
            variant={open === o ? "default" : "outline"}
            className="rounded-full"
            onClick={() => setOpen(o)}
          >
            {o ? "Öppna" : "Hanterade"}
          </Button>
        ))}
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Hämtar …</p>}
      {reports?.length === 0 && (
        <p className="rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {open ? "Inga öppna anmälningar." : "Inga hanterade anmälningar ännu."}
        </p>
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
    <article className="space-y-3 rounded-3xl border border-border p-5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-foreground">
          {TARGET_LABEL[r.target_type] ?? r.target_type}
        </span>
        <span>{new Date(r.created_at).toLocaleString("sv-SE")}</span>
        <span>· anmäld av {r.reporter_name}</span>
        {r.reports_on_target > 1 && (
          <span className="font-semibold text-destructive">
            · {r.reports_on_target} öppna anmälningar
          </span>
        )}
      </div>
      <p className="font-medium">{r.reason}</p>
      {r.details && (
        <p className="whitespace-pre-line text-sm text-muted-foreground">{r.details}</p>
      )}

      {r.target_type === "listing" && (
        <p className="text-sm">
          Annons:{" "}
          {r.listing_title ? (
            <Link
              to="/annons/$id"
              params={{ id: r.target_id }}
              className="text-primary hover:underline"
            >
              {r.listing_title}
            </Link>
          ) : (
            "borttagen"
          )}
          {r.listing_status && (
            <span className="text-muted-foreground">
              {" "}
              · {STATUS_LABEL[r.listing_status] ?? r.listing_status}
            </span>
          )}
        </p>
      )}
      {r.reported_user_name && (
        <p className="text-sm">
          Anmäld användare: {r.reported_user_name}
          {r.reported_user_blocked && <span className="text-destructive"> · spärrad</span>}
        </p>
      )}

      {r.target_type === "conversation" && (
        <div>
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => setShowConversation((s) => !s)}
          >
            {showConversation ? "Dölj konversationen" : "Visa konversationen"}
          </Button>
          {showConversation && (
            <ul className="mt-3 space-y-2 rounded-2xl bg-muted/60 p-3 text-sm">
              {messages?.map((m, i) => (
                <li key={i}>
                  <span className="font-medium">{m.sender_name}</span>{" "}
                  <span className="text-xs text-muted-foreground">
                    {new Date(m.created_at).toLocaleString("sv-SE")}
                  </span>
                  <p className="whitespace-pre-line">{m.body}</p>
                </li>
              ))}
              {messages?.length === 0 && (
                <li className="text-muted-foreground">Inga meddelanden.</li>
              )}
            </ul>
          )}
        </div>
      )}

      {isOpen ? (
        <div className="space-y-2 border-t border-border pt-3">
          {r.target_type === "listing" && r.listing_status && r.listing_status !== "removed" && (
            <div className="flex flex-wrap gap-2">
              <Input
                value={hideReason}
                onChange={(e) => setHideReason(e.target.value)}
                className="max-w-sm"
                aria-label="Skäl som visas för annonsören"
                placeholder="Skäl som visas för annonsören"
              />
              <Button
                size="sm"
                variant="destructive"
                className="rounded-full"
                onClick={() => actions.hide(r.target_id, hideReason)}
              >
                Dölj annonsen
              </Button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={() => actions.dismiss(r.id)}
            >
              Avfärda
            </Button>
            {r.reported_user_id && !r.reported_user_blocked && (
              <Button
                size="sm"
                variant="outline"
                className="rounded-full text-destructive"
                onClick={() =>
                  actions.block(r.reported_user_id!, r.reported_user_name ?? "användaren")
                }
              >
                Spärra {r.reported_user_name}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <p className="border-t border-border pt-3 text-sm text-muted-foreground">
          {r.resolution} · {new Date(r.resolved_at!).toLocaleString("sv-SE")}
        </p>
      )}
    </article>
  );
}

function ListingsTab() {
  const actions = useAdminActions();
  const [search, setSearch] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const { data: listings } = useQuery({
    queryKey: ["admin-listings", search],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_listings", { _search: search.trim() });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-3">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Sök på rubrik …"
        className="max-w-sm"
      />
      {listings?.map((l) => (
        <div
          key={l.id}
          className="flex flex-wrap items-center gap-3 rounded-2xl border border-border p-3 text-sm"
        >
          <div className="min-w-0 flex-1">
            <Link to="/annons/$id" params={{ id: l.id }} className="font-medium hover:underline">
              {l.title}
            </Link>
            <p
              className={cn(
                "text-xs text-muted-foreground",
                l.status === "removed" && "text-destructive",
              )}
            >
              {STATUS_LABEL[l.status] ?? l.status} · {l.city} ·{" "}
              {l.owner_id ? l.owner_name : "Exempelannons"}
              {l.owner_blocked && " · spärrad"}
              {l.moderation_reason && ` · skäl: ${l.moderation_reason}`}
            </p>
          </div>
          {l.status === "removed" ? (
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={() => actions.restore(l.id)}
            >
              Återställ
            </Button>
          ) : (
            <div className="flex gap-2">
              <Input
                value={reasons[l.id] ?? ""}
                onChange={(e) => setReasons((r) => ({ ...r, [l.id]: e.target.value }))}
                placeholder="Skäl"
                className="h-9 w-40"
                aria-label={`Skäl för att dölja ${l.title}`}
              />
              <Button
                size="sm"
                variant="destructive"
                className="rounded-full"
                onClick={() => actions.hide(l.id, reasons[l.id] ?? "")}
              >
                Dölj
              </Button>
            </div>
          )}
        </div>
      ))}
      {listings?.length === 0 && (
        <p className="text-sm text-muted-foreground">Inga annonser hittades.</p>
      )}
    </div>
  );
}

function BlockedTab() {
  const actions = useAdminActions();
  const { data: users } = useQuery({
    queryKey: ["admin-blocked"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_blocked_users");
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-3">
      {users?.map((u) => (
        <div
          key={u.id}
          className="flex items-center justify-between gap-3 rounded-2xl border border-border p-3 text-sm"
        >
          <span>
            {u.name}{" "}
            <span className="text-xs text-muted-foreground">
              · spärrad {new Date(u.blocked_at).toLocaleDateString("sv-SE")}
            </span>
          </span>
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => actions.unblock(u.id)}
          >
            Häv spärr
          </Button>
        </div>
      ))}
      {users?.length === 0 && (
        <p className="text-sm text-muted-foreground">Inga spärrade användare.</p>
      )}
      <p className="text-xs text-muted-foreground">
        När spärren hävs kommer annonserna inte tillbaka automatiskt. Återställ dem under "Annonser"
        om det behövs.
      </p>
    </div>
  );
}
