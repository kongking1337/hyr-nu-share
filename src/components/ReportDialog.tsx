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
import { notifyNewReport } from "@/lib/notify.functions";
import { userMessage } from "@/lib/db-errors";

const REASONS = [
  "Bedrägeri eller misstänkt bedrägeri",
  "Förbjuden eller olaglig vara",
  "Stötande eller kränkande innehåll",
  "Spam eller dubblettannons",
  "Annat",
];

/** Anmäl en annons eller konversation med skäl. Anmälan syns bara för administratörer. */
export function ReportDialog({
  targetType,
  targetId,
  label,
}: {
  targetType: "listing" | "conversation";
  targetId: string;
  label: string;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]!);
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

  if (!user) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        onClick={() => toast.info("Logga in för att anmäla.")}
      >
        <Flag className="mr-1 h-4 w-4" /> {label}
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          <Flag className="mr-1 h-4 w-4" /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            Anmälan går bara till Hyrkolls moderatorer. Den andra personen får inte veta vem som
            anmält.
          </DialogDescription>
        </DialogHeader>
        <RadioGroup value={reason} onValueChange={setReason} className="space-y-1">
          {REASONS.map((r) => (
            <div key={r} className="flex items-center gap-2.5">
              <RadioGroupItem id={`reason-${r}`} value={r} />
              <Label htmlFor={`reason-${r}`} className="cursor-pointer font-normal">
                {r}
              </Label>
            </div>
          ))}
        </RadioGroup>
        <div className="space-y-1.5">
          <Label htmlFor="report-details">Berätta mer (valfritt)</Label>
          <Textarea
            id="report-details"
            rows={3}
            maxLength={2000}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Avbryt
          </Button>
          <Button onClick={send} disabled={busy}>
            Skicka anmälan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
