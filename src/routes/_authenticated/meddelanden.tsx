import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Image as ImageIcon, Send, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/meddelanden")({
  head: () => ({
    meta: [
      { title: "Meddelanden – Hyrkoll" },
      { name: "description", content: "Chatta med uthyrare och hyresgäster, se boknings- och systemmeddelanden." },
      { property: "og:title", content: "Meddelanden – Hyrkoll" },
      { property: "og:description", content: "Konversationer om dina hyror." },
    ],
  }),
  component: MessagesPage,
});

function MessagesPage() {
  const { user } = useAuth();
  const [active, setActive] = useState<string | null>(null);
  const [text, setText] = useState("");

  const { data: conversations } = useQuery({
    queryKey: ["conversations", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("conversations")
        .select("*, listings(title)")
        .order("last_message_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: messages, refetch } = useQuery({
    queryKey: ["messages", active],
    enabled: !!active,
    queryFn: async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", active!)
        .order("created_at");
      return data ?? [];
    },
  });

  async function send() {
    if (!text.trim() || !active) return;
    await supabase.from("messages").insert({ conversation_id: active, sender_id: user!.id, body: text });
    setText("");
    refetch();
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-display text-3xl font-semibold">Meddelanden</h1>
      <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldAlert className="h-4 w-4" /> Telefonnummer och adress delas först när en bokning är bekräftad.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-[280px_1fr]">
        <div className="space-y-2 rounded-3xl border border-border p-3">
          {(conversations ?? []).map((c) => (
            <button
              key={c.id}
              onClick={() => setActive(c.id)}
              className={`w-full rounded-2xl px-3 py-3 text-left text-sm transition-colors ${
                active === c.id ? "bg-primary/12 text-primary" : "hover:bg-muted"
              }`}
            >
              <p className="font-medium">
                {(c as { listings: { title: string } | null }).listings?.title ?? "Konversation"}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(c.last_message_at).toLocaleDateString("sv-SE")}
              </p>
            </button>
          ))}
          {conversations?.length === 0 && (
            <p className="px-3 py-6 text-sm text-muted-foreground">
              Inga konversationer ännu. En chatt startas när du bokar eller får en förfrågan.
            </p>
          )}
        </div>

        <div className="flex min-h-[420px] flex-col rounded-3xl border border-border p-4">
          <div className="flex-1 space-y-2 overflow-y-auto">
            {(messages ?? []).map((m) => (
              <div
                key={m.id}
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  m.sender_id === user?.id ? "ml-auto bg-primary text-primary-foreground" : "bg-muted"
                }`}
              >
                {m.kind !== "text" && (
                  <p className="mb-1 text-[11px] uppercase opacity-70">
                    {m.kind === "booking" ? "Bokningsmeddelande" : "Systemmeddelande"}
                  </p>
                )}
                {m.image_url && <img src={m.image_url} alt="" className="mb-1 rounded-xl" />}
                {m.body}
              </div>
            ))}
            {!active && <p className="text-sm text-muted-foreground">Välj en konversation till vänster.</p>}
          </div>
          <div className="mt-3 flex gap-2">
            <Button variant="outline" size="icon" className="rounded-full" aria-label="Bifoga bild">
              <ImageIcon className="h-4 w-4" />
            </Button>
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Skriv ett meddelande…"
              onKeyDown={(e) => e.key === "Enter" && send()}
            />
            <Button className="rounded-full" onClick={send} disabled={!active}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
