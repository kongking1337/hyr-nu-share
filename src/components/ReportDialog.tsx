import { Flag } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLoginPrompt } from "@/hooks/useLoginPrompt";
import { notifyNewReport } from "@/lib/notify.functions";
import { userMessage } from "@/lib/db-errors";

const REASONS = [
  "Bedrägeri eller misstänkt bedrägeri",
  "Förbjuden eller olaglig vara",
  "Stötande eller kränkande innehåll",
  "Spam eller dubblettannons",
  "Annat",
];

const USER_REASONS = [
  "Bedrägeri eller misstänkt bedrägeri",
  "Trakasserier eller hot",
  "Lämnade inte tillbaka saken eller skadade den",
  "Falskt eller kränkande omdöme",
  "Annat",
];

/**
 * Anmäl en annons, konversation eller användare med skäl. Anmälan syns bara för administratörer.
 * `compact` visar bara ikonen på små skärmar (texten finns kvar för skärmläsare).
 */
export function ReportDialog({
  targetType,
  targetId,
  label,
  compact = false,
}: {
  targetType: "listing" | "conversation" | "user";
  targetId: string;
  label: string;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const loginPrompt = useLoginPrompt();
  const [open, setOpen] = useState(false);
  const reasons = targetType === "user" ? USER_REASONS : REASONS;
  const [reason, setReason] = useState(reasons[0]!);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!user) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("reports")
      .insert({
        reporter_id: user.id,
        target_type: targetType,
        target_id: targetId,
        reason,
        details: details.trim() || null,
      })
      .select("id")
      .single();
    setBusy(false);
    if (error) {
      toast.error(
        error.code === "23505"
          ? "Du har redan anmält det här. Vi tittar på det."
          : userMessage(error, "Anmälan kunde inte skickas. Försök igen."),
      );
      return;
    }
    notifyNewReport({ data: { reportId: data.id } }).catch((e) => console.error("[notify]", e));
    setOpen(false);
    setDetails("");
    toast.success("Tack! Anmälan är skickad till moderering.");
  }

  const trigger = {
    variant: "ghost" as const,
    size: "sm" as const,
    className: "text-muted-foreground hover:text-foreground",
    title: compact ? label : undefined,
  };
  const content = (
    <>
      <Flag aria-hidden />{" "}
      <span className={compact ? "sr-only sm:not-sr-only" : undefined}>{label}</span>
    </>
  );

  if (!user) {
    return (
      <Button {...trigger} onClick={() => loginPrompt("Logga in för att anmäla.")}>
        {content}
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button {...trigger}>{content}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            Anmälan går bara till Hyrkolls moderatorer. Den andra personen får inte veta vem som
            anmält.
          </DialogDescription>
        </DialogHeader>
        <RadioGroup value={reason} onValueChange={setReason} aria-label="Skäl" className="gap-1">
          {reasons.map((r) => (
            <Label
              key={r}
              htmlFor={`reason-${r}`}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-3 font-normal transition-colors hover:bg-muted has-[[data-state=checked]]:border-foreground has-[[data-state=checked]]:bg-muted"
            >
              <RadioGroupItem id={`reason-${r}`} value={r} />
              {r}
            </Label>
          ))}
        </RadioGroup>
        <div className="space-y-1.5">
          <Label htmlFor="report-details">Berätta mer (valfritt)</Label>
          <p id="report-details-hint" className="text-xs text-muted-foreground">
            Vad hände, och när? Det hjälper moderatorerna att bedöma anmälan.
          </p>
          <Textarea
            id="report-details"
            rows={3}
            maxLength={2000}
            aria-describedby="report-details-hint"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Avbryt
          </Button>
          <Button variant="secondary" onClick={send} disabled={busy}>
            Skicka anmälan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
