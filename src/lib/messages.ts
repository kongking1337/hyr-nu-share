import { supabase } from "@/integrations/supabase/client";
import { notifyNewMessage } from "@/lib/notify.functions";

export const MAX_MESSAGE_LENGTH = 2000;

/** Ber servern mejla mottagaren. Misslyckas det syns meddelandet ändå på sajten. */
function notify(conversationId: string) {
  notifyNewMessage({ data: { conversationId } }).catch((e) => console.error("[notify]", e));
}

/** Första meddelandet om en annons. Återanvänder konversationen om den redan finns. */
export async function startConversation(listingId: string, body: string): Promise<string> {
  const { data, error } = await supabase.rpc("start_conversation", {
    _listing_id: listingId,
    _body: body,
  });
  if (error || !data) throw new Error(error?.message ?? "Meddelandet kunde inte skickas");
  notify(data);
  return data;
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  body: string,
): Promise<void> {
  const { error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: senderId, body: body.trim() });
  if (error) throw new Error(error.message);
  notify(conversationId);
}

export type ThreadMessage = {
  id: string;
  sender_id: string | null;
  body: string;
  kind: string;
  booking_id: string | null;
  created_at: string;
};

/** En tråd som visas: meddelandena (äldst först) och om det finns äldre som inte hämtats. */
export type Thread = { messages: ThreadMessage[]; hasOlder: boolean };

const THREAD_COLUMNS = "id, sender_id, body, kind, booking_id, created_at";

/** Så många av de senaste meddelandena hämtas när en tråd öppnas. */
const THREAD_PAGE = 200;

/** Meddelanden kan sparas i lite olika ordning; så långt bakåt hämtas igen och slås ihop på id. */
const OVERLAP_MS = 30_000;

/**
 * Hämtar en tråd. Med `previous` hämtas bara meddelanden från strax före det senaste och slås
 * ihop med dem som redan finns, i stället för hela tråden igen (tråden frågas om var 10:e
 * sekund). `all` hämtar hela tråden, för "Visa äldre meddelanden".
 */
export async function fetchThread(
  conversationId: string,
  previous?: Thread,
  { all = false } = {},
): Promise<Thread> {
  const last = previous?.messages.at(-1);
  if (previous && last && !all) {
    const since = new Date(new Date(last.created_at).getTime() - OVERLAP_MS).toISOString();
    const { data, error } = await supabase
      .from("messages")
      .select(THREAD_COLUMNS)
      .eq("conversation_id", conversationId)
      .gte("created_at", since)
      .order("created_at");
    if (error) throw error;
    const known = new Set(previous.messages.map((m) => m.id));
    const added = (data ?? []).filter((m) => !known.has(m.id));
    if (!added.length) return previous;
    const messages = [...previous.messages, ...added].sort(
      (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
    );
    return { messages, hasOlder: previous.hasOlder };
  }
  if (all) {
    const { data, error } = await supabase
      .from("messages")
      .select(THREAD_COLUMNS)
      .eq("conversation_id", conversationId)
      .order("created_at");
    if (error) throw error;
    return { messages: data ?? [], hasOlder: false };
  }
  const { data, error } = await supabase
    .from("messages")
    .select(THREAD_COLUMNS)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(THREAD_PAGE + 1);
  if (error) throw error;
  const rows = data ?? [];
  return { messages: rows.slice(0, THREAD_PAGE).reverse(), hasOlder: rows.length > THREAD_PAGE };
}
