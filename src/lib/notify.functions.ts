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

/**
 * Anropas efter att någon anmält något. Mejlar administratören (ADMIN_EMAIL i Cloudflare)
 * högst en gång per anmäld annons, användare eller konversation tills den är hanterad.
 */
export const notifyNewReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { reportId: string }) => {
    if (!UUID.test(String(input?.reportId))) throw new Error("Ogiltig anmälan");
    return { reportId: input.reportId };
  })
  .handler(async ({ data, context }) => {
    const { emailConfigured, escapeHtml, sendEmail } = await import("@/lib/email.server");
    const adminEmail = process.env["ADMIN_EMAIL"];
    if (!emailConfigured() || !adminEmail || !process.env["SUPABASE_SERVICE_ROLE_KEY"]) return { sent: false };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("claim_report_notification", {
      _report_id: data.reportId,
      _reporter: context.userId,
    });
    if (error) {
      console.error("[notify] claim_report_notification:", error.message);
      return { sent: false };
    }
    const report = rows?.[0];
    if (!report) return { sent: false };

    const { getRequest } = await import("@tanstack/react-start/server");
    const site = process.env["SITE_URL"] || new URL(getRequest().url).origin;
    const sent = await sendEmail({
      to: adminEmail,
      subject: `Ny anmälan på Hyrkoll: ${report.reason}`,
      text: `En ${report.target_type === "listing" ? "annons" : "konversation eller användare"} har anmälts för "${report.reason}".\n\nÖppna anmälningar just nu: ${report.open_reports}\n\nHantera: ${site}/admin\n`,
      html: `<p>En ${report.target_type === "listing" ? "annons" : "konversation eller användare"} har anmälts för <strong>${escapeHtml(report.reason)}</strong>.</p>
<p>Öppna anmälningar just nu: ${report.open_reports}</p>
<p><a href="${escapeHtml(`${site}/admin`)}">Hantera anmälningar</a></p>`,
    });
    return { sent };
  });
