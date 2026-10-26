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
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/meddelanden")({
  validateSearch: (s: Record<string, unknown>): { c?: string } =>
    typeof s["c"] === "string" ? { c: s["c"] as string } : {},
  head: () => ({
    meta: [
      { title: "Meddelanden – Hyrkoll" },
      { name: "description", content: "Dina konversationer med köpare, säljare och uthyrare." },
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

function MessagesPage() {
  const { user } = useAuth();
  const { c: active } = Route.useSearch();
  const navigate = useNavigate({ from: "/meddelanden" });
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

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

  const { data: messages, refetch } = useQuery({
    queryKey: ["messages", active],
    enabled: !!active,
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, sender_id, body, kind, created_at")
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

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [lastMessageId]);

  async function send() {
    if (!text.trim() || !active || !user) return;
    setSending(true);
    try {
      await sendMessage(active, user.id, text);
      setText("");
      await refetch();
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    } catch {
      toast.error("Meddelandet kunde inte skickas. Försök igen.");
    } finally {
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
                <p className="text-xs text-muted-foreground">
                  {current
                    ? `${current.counterpart_name} · ${current.i_am_seller ? "intresserad av din annons" : "annonsör"}`
                    : ""}
                </p>
              </div>
            </div>
          )}

          <div className="flex-1 space-y-2 overflow-y-auto">
            {!active && (
              <p className="text-sm text-muted-foreground">Välj en konversation till vänster.</p>
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
                      <p className="mb-1 text-[11px] uppercase opacity-70">Systemmeddelande</p>
                    )}
                    {m.body}
                  </div>
                  <span className="mt-0.5 text-[11px] text-muted-foreground">
                    {formatTime(m.created_at)}
                  </span>
                </div>
              );
            })}
            <div ref={bottom} />
          </div>

          {active && (
            <div className="mt-3 flex items-end gap-2">
              <Textarea
                rows={2}
                value={text}
                maxLength={MAX_MESSAGE_LENGTH}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="Skriv ett meddelande … (Enter skickar, Skift+Enter ny rad)"
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
