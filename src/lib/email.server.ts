/**
 * E-post från servern via Resend (https://resend.com).
 *
 * Kräver två värden i Cloudflare (Worker "hyrkoll" → Settings → Variables and Secrets):
 *   RESEND_API_KEY  (secret)  API-nyckel från Resend
 *   EMAIL_FROM                avsändare på en domän som är verifierad i Resend,
 *                             t.ex. "Hyrkoll <noreply@hyrkoll.se>"
 * Saknas de skickas inga mejl, men resten av sajten fungerar som vanligt.
 */
export type Email = { to: string; subject: string; text: string; html: string };

export function emailConfigured(): boolean {
  return !!process.env["RESEND_API_KEY"] && !!process.env["EMAIL_FROM"];
}

export async function sendEmail(email: Email): Promise<boolean> {
  const key = process.env["RESEND_API_KEY"];
  const from = process.env["EMAIL_FROM"];
  if (!key || !from) return false;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email.to],
      subject: email.subject,
      text: email.text,
      html: email.html,
    }),
  });
  if (!res.ok) {
    console.error(`[email] Resend svarade ${res.status}: ${await res.text()}`);
    return false;
  }
  return true;
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
