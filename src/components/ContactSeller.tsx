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

/** "Skicka meddelande" på annonssidan. E-postadresser och telefonnummer delas aldrig. */
export function ContactSeller({ listing }: { listing: UnifiedResult }) {
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
      <Button asChild className="w-full rounded-full">
        <Link to="/auth" search={{ redirect: `/annons/${listing.id}` }}>
          <MessageSquare className="mr-1 h-4 w-4" /> Logga in för att skicka meddelande
        </Link>
      </Button>
    );
  }

  if (user.id === listing.ownerId) {
    return (
      <p className="rounded-2xl bg-muted/60 p-3 text-sm text-muted-foreground">
        Det här är din annons.{" "}
        <Link to="/ny-annons" search={{ id: listing.id }} className="text-primary hover:underline">
          Redigera
        </Link>
      </p>
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
    <div className="space-y-2">
      <Textarea
        rows={4}
        value={text}
        maxLength={MAX_MESSAGE_LENGTH}
        onChange={(e) => setText(e.target.value)}
        aria-label={sale ? "Meddelande till säljaren" : "Meddelande till uthyraren"}
      />
      <Button className="w-full rounded-full" onClick={send} disabled={busy}>
        <MessageSquare className="mr-1 h-4 w-4" /> Skicka meddelande
      </Button>
      <p className="text-xs text-muted-foreground">
        Svaret kommer under Meddelanden. Din e-postadress och ditt telefonnummer visas inte.
      </p>
    </div>
  );
}
