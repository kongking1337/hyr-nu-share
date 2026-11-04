import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CalendarDays, MessagesSquare, Send, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, LoadingRows, Page, PageHeader } from "@/components/layout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MAX_MESSAGE_LENGTH, sendMessage } from "@/lib/messages";
import { photoUrl } from "@/lib/photos";
import { userMessage } from "@/lib/db-errors";
import { ReportDialog } from "@/components/ReportDialog";
import { BlockUserButton, useIsBlocked } from "@/components/BlockUserButton";
import { DEFAULTS } from "@/lib/search/params";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/meddelanden")({
  validateSearch: (s: Record<string, unknown>): { c?: string } =>
    typeof s["c"] === "string" ? { c: s["c"] as string } : {},
  head: () => ({
    meta: [
      { title: "Meddelanden – Hyrkoll" },
      {
        name: "description",
        content: "Dina konversationer med uthyrare och de som vill hyra dina saker.",
      },
      { property: "og:title", content: "Meddelanden – Hyrkoll" },
      { property: "og:description", content: "Dina konversationer på Hyrkoll." },
    ],
  }),
  component: MessagesPage,
});

function formatTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
}

const dayKey = (iso: string) => new Date(iso).toDateString();

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
}

/** "I dag", "I går" eller t.ex. "måndag 3 november". */
function formatDay(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "I dag";
  if (d.toDateString() === yesterday.toDateString()) return "I går";
  return d.toLocaleDateString("sv-SE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
  });
}

function MessagesPage() {
  const { user } = useAuth();
  const { c: active } = Route.useSearch();
  const navigate = useNavigate({ from: "/meddelanden" });
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const { data: conversations, isLoading } = useQuery({
    queryKey: ["conversations", user?.id],
    enabled: !!user,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_conversations");
      if (error) throw error;
      return data ?? [];
    },
  });
  const current = conversations?.find((c) => c.id === active);

  // Den andras id (för profillänken och blockering). Bara de två i konversationen kan läsa den.
  const { data: parties } = useQuery({
    queryKey: ["conversation-parties", active],
    enabled: !!active,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("renter_id, owner_id")
        .eq("id", active!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const counterpartId = parties
    ? parties.owner_id === user?.id
      ? parties.renter_id
      : parties.owner_id
    : null;
  const { data: iBlocked } = useIsBlocked(counterpartId);

  const { data: messages, refetch } = useQuery({
    queryKey: ["messages", active],
    enabled: !!active,
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, sender_id, body, kind, booking_id, created_at")
        .eq("conversation_id", active!)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Öppnad konversation = läst. Uppdatera listan och räknaren i menyn.
  const lastMessageId = messages?.at(-1)?.id;
  useEffect(() => {
    if (!active || !lastMessageId) return;
    void supabase.rpc("mark_conversation_read", { _conversation_id: active }).then(() => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["unread-count"] });
    });
  }, [active, lastMessageId, queryClient]);

  // Rulla tråden (inte hela sidan) till senaste meddelandet.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastMessageId, active]);

  async function send() {
    if (!text.trim() || !active || !user) return;
    setSending(true);
    try {
      await sendMessage(active, user.id, text);
      setText("");
      await refetch();
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    } catch (e) {
      toast.error(userMessage(e, "Meddelandet kunde inte skickas. Försök igen."));
    } finally {
      setSending(false);
    }
  }

  const noConversations = !isLoading && !active && conversations?.length === 0;

  return (
    <Page className={cn(active && "px-0 py-0 sm:px-0 sm:py-0 md:px-6 md:py-12")}>
      <PageHeader
        title="Meddelanden"
        className={active ? "hidden md:flex" : ""}
        description={
          <span className="flex items-start gap-2 text-sm">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Betala aldrig i förskott till någon du inte känner, och träffas gärna på en offentlig
            plats.
          </span>
        }
      />

      {noConversations ? (
        <EmptyState
          icon={MessagesSquare}
          title="Inga meddelanden än"
          action={
            <Button asChild>
              <Link to="/sok" search={DEFAULTS}>
                Hitta något att hyra
              </Link>
            </Button>
          }
        >
          När du skriver till någon från en annons, eller någon skriver till dig, hamnar
          konversationen här.
        </EmptyState>
      ) : (
        <div
          className={cn(
            "grid overflow-hidden rounded-2xl border border-border bg-card md:h-[calc(100dvh-16rem)] md:max-h-[860px] md:min-h-[480px] md:grid-cols-[300px_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)] lg:grid-cols-[340px_minmax(0,1fr)]",
            active && "rounded-none border-0 md:rounded-2xl md:border",
          )}
        >
          {/* Konversationerna */}
          <nav
            aria-label="Konversationer"
            className={cn(
              "min-h-0 overflow-y-auto md:border-r md:border-border",
              active && "hidden md:block",
            )}
          >
            {isLoading ? (
              <LoadingRows rows={4} className="p-3" />
            ) : conversations?.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">
                Inga andra konversationer än.
              </p>
            ) : (
              <ul className="divide-y divide-border md:divide-y-0 md:p-2">
                {conversations?.map((c) => {
                  const selected = active === c.id;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => navigate({ search: { c: c.id } })}
                        aria-current={selected ? "true" : undefined}
                        className={cn(
                          "flex w-full gap-3 px-4 py-3.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:rounded-xl md:px-3",
                          selected ? "bg-muted" : "hover:bg-muted/60",
                        )}
                      >
                        {c.listing_image ? (
                          <img
                            src={photoUrl(c.listing_image)}
                            alt=""
                            loading="lazy"
                            className="h-12 w-12 shrink-0 rounded-xl bg-muted object-cover"
                          />
                        ) : (
                          <span className="h-12 w-12 shrink-0 rounded-xl bg-muted" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span
                              className={cn("truncate", c.unread ? "font-bold" : "font-semibold")}
                            >
                              {c.counterpart_name}
                            </span>
                            <span
                              className={cn(
                                "shrink-0 text-xs tabular-nums",
                                c.unread
                                  ? "font-semibold text-foreground"
                                  : "text-muted-foreground",
                              )}
                            >
                              {formatTime(c.last_message_at)}
                            </span>
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {c.listing_title}
                          </span>
                          <span className="mt-0.5 flex items-center gap-2">
                            <span
                              className={cn(
                                "min-w-0 flex-1 truncate",
                                c.unread ? "font-medium text-foreground" : "text-muted-foreground",
                              )}
                            >
                              {c.last_message}
                            </span>
                            {c.unread && (
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary"
                                aria-label="Oläst"
                              />
                            )}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </nav>

          {/* Tråden */}
          <section
            aria-label={current ? `Konversation med ${current.counterpart_name}` : "Konversation"}
            className={cn(
              "flex min-h-0 flex-col",
              active
                ? "h-[calc(100dvh-8.0625rem-env(safe-area-inset-bottom))] md:h-auto"
                : "hidden md:flex",
            )}
          >
            {!active ? (
              <div className="grid flex-1 place-items-center p-6">
                <EmptyState icon={MessagesSquare} title="Välj en konversation" className="border-0">
                  Klicka på en konversation till vänster för att läsa och svara.
                </EmptyState>
              </div>
            ) : (
              <>
                <header className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-2 sm:px-3 md:px-4 md:py-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 md:hidden"
                    onClick={() => navigate({ search: {} })}
                    aria-label="Alla konversationer"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                  {current?.listing_image && (
                    <img
                      src={photoUrl(current.listing_image)}
                      alt=""
                      className="hidden h-10 w-10 shrink-0 rounded-lg bg-muted object-cover sm:block"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    {current?.listing_id ? (
                      <Link
                        to="/annons/$id"
                        params={{ id: current.listing_id }}
                        className="block truncate font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {current.listing_title}
                      </Link>
                    ) : (
                      <p className="truncate font-semibold">
                        {current?.listing_title ?? "Konversation"}
                      </p>
                    )}
                    {current && (
                      <p className="truncate text-xs text-muted-foreground">
                        {counterpartId ? (
                          <Link
                            to="/profil/$id"
                            params={{ id: counterpartId }}
                            className="font-medium text-foreground hover:underline"
                          >
                            {current.counterpart_name}
                          </Link>
                        ) : (
                          current.counterpart_name
                        )}
                        {` · ${current.i_am_seller ? "intresserad av din annons" : "annonsör"}`}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center">
                    {counterpartId && current && (
                      <BlockUserButton
                        userId={counterpartId}
                        name={current.counterpart_name}
                        compact
                      />
                    )}
                    <ReportDialog
                      targetType="conversation"
                      targetId={active}
                      label="Anmäl"
                      compact
                    />
                  </div>
                </header>

                <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5">
                  {!messages ? (
                    <div className="space-y-3" aria-busy="true" aria-label="Laddar">
                      <Skeleton className="h-12 w-2/3 rounded-2xl" />
                      <Skeleton className="ml-auto h-12 w-1/2 rounded-2xl" />
                      <Skeleton className="h-16 w-3/5 rounded-2xl" />
                    </div>
                  ) : messages.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      Inga meddelanden än. Skriv det första nedan.
                    </p>
                  ) : (
                    <ol role="log" aria-label="Meddelanden" className="space-y-2">
                      {messages.map((m, i) => {
                        const mine = m.sender_id === user?.id;
                        const prev = messages[i - 1];
                        const newDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);
                        const sameSender =
                          !newDay && prev?.sender_id === m.sender_id && prev?.kind === "text";
                        return (
                          <li key={m.id} className={cn(!sameSender && !newDay && "pt-2")}>
                            {newDay && (
                              <p className="py-3 text-center text-xs font-medium text-muted-foreground">
                                {formatDay(m.created_at)}
                              </p>
                            )}
                            {m.kind !== "text" ? (
                              <div className="mx-auto max-w-md rounded-2xl border border-border bg-background px-4 py-3 text-center text-sm">
                                <p className="mb-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-muted-foreground">
                                  <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                                  {m.kind === "booking" ? "Bokning" : "Systemmeddelande"} ·{" "}
                                  {formatClock(m.created_at)}
                                </p>
                                <p className="whitespace-pre-line">{m.body}</p>
                                {m.kind === "booking" && (
                                  <Link
                                    to="/bokningar"
                                    className="mt-1.5 inline-block text-xs font-semibold text-primary underline-offset-4 hover:underline"
                                  >
                                    Visa bokningen →
                                  </Link>
                                )}
                              </div>
                            ) : (
                              <div
                                className={cn("flex flex-col", mine ? "items-end" : "items-start")}
                              >
                                <p className="sr-only">
                                  {mine
                                    ? "Du skrev:"
                                    : `${current?.counterpart_name ?? "Den andra"} skrev:`}
                                </p>
                                <div
                                  className={cn(
                                    "max-w-[85%] whitespace-pre-line break-words rounded-2xl px-3.5 py-2 text-sm sm:max-w-[70%]",
                                    mine
                                      ? "rounded-br-md bg-accent text-accent-foreground"
                                      : "rounded-bl-md bg-muted text-foreground",
                                  )}
                                >
                                  {m.body}
                                </div>
                                <span className="mt-0.5 px-1 text-[11px] tabular-nums text-muted-foreground">
                                  {formatClock(m.created_at)}
                                </span>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </div>

                {iBlocked && (
                  <p className="shrink-0 border-t border-border bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
                    Du har blockerat {current?.counterpart_name ?? "den här personen"}. Ta bort
                    blockeringen för att skriva igen.
                  </p>
                )}

                {!iBlocked && (
                  <form
                    className="shrink-0 border-t border-border bg-card p-2 sm:p-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void send();
                    }}
                  >
                    <div className="flex items-end gap-2">
                      <Textarea
                        rows={1}
                        value={text}
                        maxLength={MAX_MESSAGE_LENGTH}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void send();
                          }
                        }}
                        placeholder="Skriv ett meddelande …"
                        aria-label="Meddelande"
                        aria-describedby="composer-hint"
                        className="max-h-40 min-h-11 resize-none rounded-2xl [field-sizing:content]"
                      />
                      <Button
                        type="submit"
                        size="icon"
                        className="h-11 w-11 shrink-0"
                        disabled={sending || !text.trim()}
                        aria-label="Skicka"
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                    <p
                      id="composer-hint"
                      className="mt-1 hidden px-2 text-[11px] text-muted-foreground md:block"
                    >
                      Enter skickar, Skift+Enter ger ny rad.
                    </p>
                  </form>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </Page>
  );
}
