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
