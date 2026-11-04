import { Link, useNavigate } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { userMessage } from "@/lib/db-errors";
import { MAX_MESSAGE_LENGTH, startConversation } from "@/lib/messages";
import type { UnifiedResult } from "@/lib/providers/types";

/**
 * "Skicka meddelande" på annonssidan. E-postadresser och telefonnummer delas aldrig.
 * `quiet` ger en mörk knapp i stället för orange, när bokningsknappen redan är huvudvalet.
 */
export function ContactSeller({ listing, quiet = false }: { listing: UnifiedResult; quiet?: boolean }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const sale = listing.listingType === "sale";
  const [text, setText] = useState(
    sale
      ? "Hej! Finns den kvar? Jag är intresserad."
      : "Hej! Är den ledig att hyra? Jag skulle behöva den",
  );
  const [busy, setBusy] = useState(false);

  if (loading) return null;

  if (!user) {
    return (
      <Button asChild variant={quiet ? "outline" : "default"} size={quiet ? "default" : "lg"} className="w-full">
        <Link to="/auth" search={{ redirect: `/annons/${listing.id}` }}>
          <MessageSquare aria-hidden /> Logga in för att skicka meddelande
        </Link>
      </Button>
    );
  }

  if (user.id === listing.ownerId) {
    return (
      <div className="space-y-3 rounded-xl bg-muted p-4 text-sm">
        <p className="text-muted-foreground">Det här är din annons.</p>
        <Button asChild variant="secondary" className="w-full">
          <Link to="/ny-annons" search={{ id: listing.id }}>
            Redigera annonsen
          </Link>
        </Button>
      </div>
    );
  }

  async function send() {
    if (!text.trim()) {
      toast.error("Skriv ett meddelande.");
      return;
    }
    setBusy(true);
    try {
      const conversationId = await startConversation(listing.id, text);
      toast.success("Meddelandet är skickat.");
      navigate({ to: "/meddelanden", search: { c: conversationId } });
    } catch (e) {
      toast.error(userMessage(e, "Meddelandet kunde inte skickas. Försök igen."));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Textarea
        rows={4}
        value={text}
        maxLength={MAX_MESSAGE_LENGTH}
        onChange={(e) => setText(e.target.value)}
        aria-label={sale ? "Meddelande till säljaren" : "Meddelande till uthyraren"}
      />
      <Button
        variant={quiet ? "secondary" : "default"}
        size={quiet ? "default" : "lg"}
        className="w-full"
        onClick={send}
        disabled={busy}
      >
        <MessageSquare aria-hidden /> {busy ? "Skickar …" : "Skicka meddelande"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Svaret kommer under Meddelanden. Din e-postadress och ditt telefonnummer visas inte.
      </p>
    </div>
  );
}
