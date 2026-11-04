import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MAX_MESSAGE_LENGTH, sendMessage } from "@/lib/messages";
import { photoUrl } from "@/lib/photos";
import { userMessage } from "@/lib/db-errors";
import { ReportDialog } from "@/components/ReportDialog";
import { BlockUserButton, useIsBlocked } from "@/components/BlockUserButton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/meddelanden")({
  validateSearch: (s: Record<string, unknown>): { c?: string } =>
    typeof s["c"] === "string" ? { c: s["c"] as string } : {},
  head: () => ({
    meta: [
      { title: "Meddelanden – Hyrkoll" },
      { name: "description", content: "Dina konversationer med uthyrare och de som vill hyra dina saker." },
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

/** Enter skickar bara med riktigt tangentbord; på mobilen ger Enter ny rad. */
const enterSends = () => typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches;

function MessagesPage() {
  const { user } = useAuth();
  const { c: active } = Route.useSearch();
  const navigate = useNavigate({ from: "/meddelanden" });
  const queryClient = useQueryClient();
  // Ett utkast per konversation, så att en halvskriven text inte följer med till någon annan.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const text = active ? (drafts[active] ?? "") : "";
  const setText = (value: string) => {
    if (active) setDrafts((d) => ({ ...d, [active]: value }));
  };
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const thread = useRef<HTMLDivElement>(null);

  const { data: conversations, isLoading, isError: conversationsFailed, refetch: refetchConversations } = useQuery({
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
  const counterpartId = parties ? (parties.owner_id === user?.id ? parties.renter_id : parties.owner_id) : null;
  const { data: iBlocked } = useIsBlocked(counterpartId);

  // Under en pågående hyra går det att skriva även efter en blockering, så att saken kan lämnas tillbaka.
  const { data: ongoingRental } = useQuery({
    queryKey: ["ongoing-rental", user?.id, counterpartId],
    enabled: !!iBlocked && !!user && !!counterpartId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("status", "confirmed")
        .in("owner_id", [user!.id, counterpartId!])
        .in("renter_id", [user!.id, counterpartId!]);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
  });
  const canWrite = !iBlocked || !!ongoingRental;

  const { data: messages, refetch, isError: messagesFailed } = useQuery({
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

  // Rulla bara i tråden (inte hela sidan): till botten när en konversation öppnas, och när
  // ett nytt meddelande kommer om man redan läser längst ner.
  const nearBottom = useRef(true);
  const shownConversation = useRef<string | undefined>(undefined);
  useEffect(() => {
    const el = thread.current;
    if (!el || !lastMessageId) return;
    if (shownConversation.current !== active || nearBottom.current) el.scrollTop = el.scrollHeight;
    shownConversation.current = active;
  }, [active, lastMessageId]);

  async function send() {
    const body = text;
    const conversation = active;
    if (!body.trim() || !conversation || !user || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setDrafts((d) => ({ ...d, [conversation]: "" }));
    nearBottom.current = true;
    try {
      await sendMessage(conversation, user.id, body);
      await refetch();
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    } catch (e) {
      // Texten kommer tillbaka så att inget behöver skrivas om.
      setDrafts((d) => ({ ...d, [conversation]: d[conversation] || body }));
      toast.error(userMessage(e, "Meddelandet kunde inte skickas. Försök igen."));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-display text-3xl font-semibold">Meddelanden</h1>
      <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldAlert className="h-4 w-4 shrink-0" /> Betala aldrig i förskott till någon du inte
        känner, och träffas gärna på en offentlig plats.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-[300px_1fr]">
        <div
          className={cn(
            "space-y-2 rounded-3xl border border-border p-3",
            active && "hidden md:block",
          )}
        >
          {isLoading && (
            <p className="px-3 py-6 text-sm text-muted-foreground">Hämtar konversationer …</p>
          )}
          {conversationsFailed && (
            <p className="px-3 py-6 text-sm text-muted-foreground">
              Konversationerna kunde inte hämtas.{" "}
              <button className="text-primary hover:underline" onClick={() => void refetchConversations()}>
                Försök igen
              </button>
            </p>
          )}
          {conversations?.map((c) => (
            <button
              key={c.id}
              onClick={() => navigate({ search: { c: c.id } })}
              className={cn(
                "flex w-full gap-3 rounded-2xl px-3 py-3 text-left text-sm transition-colors",
                active === c.id ? "bg-primary/12" : "hover:bg-muted",
              )}
            >
              {c.listing_image ? (
                <img
                  src={photoUrl(c.listing_image)}
                  alt=""
                  className="h-11 w-11 shrink-0 rounded-xl object-cover"
                />
              ) : (
                <span className="h-11 w-11 shrink-0 rounded-xl bg-muted" />
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className={cn("truncate", c.unread ? "font-semibold" : "font-medium")}>
                    {c.listing_title}
                  </span>
                  {c.unread && (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Oläst" />
                  )}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {c.counterpart_name} · {c.last_message}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {formatTime(c.last_message_at)}
                </span>
              </span>
            </button>
          ))}
          {conversations?.length === 0 && (
            <p className="px-3 py-6 text-sm text-muted-foreground">
              Inga meddelanden ännu. När du skriver till någon från en annons hamnar konversationen
              här.
            </p>
          )}
        </div>

        <div
          className={cn(
            "flex min-h-[460px] flex-col rounded-3xl border border-border p-4",
            !active && "hidden md:flex",
          )}
        >
          {active && (
            <div className="mb-3 flex items-center gap-2 border-b border-border pb-3">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => navigate({ search: {} })}
                aria-label="Alla konversationer"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                {current?.listing_id ? (
                  <Link
                    to="/annons/$id"
                    params={{ id: current.listing_id }}
                    className="block truncate font-medium hover:underline"
                  >
                    {current.listing_title}
                  </Link>
                ) : (
                  <p className="truncate font-medium">{current?.listing_title ?? "Konversation"}</p>
                )}
                {current && (
                  <p className="text-xs text-muted-foreground">
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
              <div className="ml-auto flex shrink-0 items-center gap-1">
                {counterpartId && current && (
                  <BlockUserButton userId={counterpartId} name={current.counterpart_name} />
                )}
                <ReportDialog targetType="conversation" targetId={active} label="Anmäl" />
              </div>
            </div>
          )}

          <div
            ref={thread}
            onScroll={(e) => {
              const el = e.currentTarget;
              nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            }}
            className="max-h-[60vh] flex-1 space-y-2 overflow-y-auto md:max-h-[65vh]"
          >
            {!active && (
              <p className="text-sm text-muted-foreground">Välj en konversation till vänster.</p>
            )}
            {active && messagesFailed && !messages && (
              <p className="text-sm text-muted-foreground">
                Meddelandena kunde inte hämtas.{" "}
                <button className="text-primary hover:underline" onClick={() => void refetch()}>
                  Försök igen
                </button>
              </p>
            )}
            {messages?.map((m) => {
              const mine = m.sender_id === user?.id;
              return (
                <div key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                  <div
                    className={cn(
                      "max-w-[80%] whitespace-pre-line rounded-2xl px-3 py-2 text-sm",
                      mine ? "bg-primary text-primary-foreground" : "bg-muted",
                    )}
                  >
                    {m.kind !== "text" && (
                      <p className="mb-1 text-[11px] uppercase opacity-70">
                        {m.kind === "booking" ? "Bokning" : "Systemmeddelande"}
                      </p>
                    )}
                    {m.body}
                    {m.kind === "booking" && (
                      <Link to="/bokningar" className="mt-1.5 block text-xs font-semibold underline-offset-4 hover:underline">
                        Visa bokningen →
                      </Link>
                    )}
                  </div>
                  <span className="mt-0.5 text-[11px] text-muted-foreground">
                    {formatTime(m.created_at)}
                  </span>
                </div>
              );
            })}
          </div>

          {active && iBlocked && (
            <p className="mt-3 rounded-2xl bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
              Du har blockerat {current?.counterpart_name ?? "den här personen"}.{" "}
              {ongoingRental
                ? "Ni kan skriva till varandra tills den pågående hyran är avslutad."
                : "Ta bort blockeringen för att skriva igen."}
            </p>
          )}

          {active && canWrite && (
            <div className="mt-3 flex items-end gap-2">
              <Textarea
                rows={2}
                value={text}
                maxLength={MAX_MESSAGE_LENGTH}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && enterSends()) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder={
                  enterSends() ? "Skriv ett meddelande … (Enter skickar, Skift+Enter ny rad)" : "Skriv ett meddelande …"
                }
                aria-label="Meddelande"
              />
              <Button
                className="rounded-full"
                onClick={send}
                disabled={sending || !text.trim()}
                aria-label="Skicka"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
