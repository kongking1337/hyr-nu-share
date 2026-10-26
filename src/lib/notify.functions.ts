import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Anropas av webbläsaren efter att ett meddelande skickats. Databasen
 * (claim_message_notification) avgör om mottagaren ska få ett mejl: högst ett per
 * oläst konversation. Därför går det inte att spamma någon genom att anropa
 * funktionen många gånger. Mejlet innehåller ingen meddelandetext och inga adresser.
 */
export const notifyNewMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { conversationId: string }) => {
    if (!UUID.test(String(input?.conversationId))) throw new Error("Ogiltig konversation");
    return { conversationId: input.conversationId };
  })
  .handler(async ({ data, context }) => {
    const { emailConfigured, escapeHtml, sendEmail } = await import("@/lib/email.server");
    if (!emailConfigured() || !process.env["SUPABASE_SERVICE_ROLE_KEY"]) return { sent: false };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("claim_message_notification", {
      _conversation_id: data.conversationId,
      _sender: context.userId,
    });
    if (error) {
      console.error("[notify] claim_message_notification:", error.message);
      return { sent: false };
    }
    const target = rows?.[0];
    if (!target) return { sent: false };

    const { getRequest } = await import("@tanstack/react-start/server");
    const site = process.env["SITE_URL"] || new URL(getRequest().url).origin;
    const link = `${site}/meddelanden?c=${data.conversationId}`;
    const title = target.listing_title;

    const sent = await sendEmail({
      to: target.email,
      subject: `Nytt meddelande om ”${title}” på Hyrkoll`,
      text: `Hej!\n\nDu har fått ett nytt meddelande om ”${title}” på Hyrkoll.\n\nLäs och svara här: ${link}\n\nDu får högst ett mejl per konversation tills du har läst den.\n`,
      html: `<p>Hej!</p>
<p>Du har fått ett nytt meddelande om <strong>”${escapeHtml(title)}”</strong> på Hyrkoll.</p>
<p><a href="${escapeHtml(link)}">Läs och svara</a></p>
<p style="color:#666;font-size:12px">Du får högst ett mejl per konversation tills du har läst den.</p>`,
    });
    return { sent };
  });
