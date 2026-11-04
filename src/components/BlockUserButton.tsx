import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { userMessage } from "@/lib/db-errors";

/** Har jag blockerat `userId`? Databasen visar bara mina egna blockeringar. */
export function useIsBlocked(userId: string | null | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["user-block", user?.id, userId],
    enabled: !!user && !!userId && userId !== user.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_blocks")
        .select("blocked_id")
        .eq("blocked_id", userId!);
      if (error) throw error;
      return (data ?? []).length > 0;
    },
  });
}

/** "Blockera" / "Ta bort blockering". Bara den som blockerar ser blockeringen i en lista. */
export function BlockUserButton({
  userId,
  name,
  onChange,
}: {
  userId: string;
  name: string;
  onChange?: () => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: blocked, isLoading } = useIsBlocked(userId);
  const [busy, setBusy] = useState(false);

  if (!user || user.id === userId || isLoading) return null;

  function done() {
    void queryClient.invalidateQueries({ queryKey: ["user-block"] });
    void queryClient.invalidateQueries({ queryKey: ["blocked-users"] });
    onChange?.();
  }

  async function block() {
    setBusy(true);
    const { error } = await supabase
      .from("user_blocks")
      .insert({ blocker_id: user!.id, blocked_id: userId });
    setBusy(false);
    if (error) {
      toast.error(userMessage(error, "Det gick inte att blockera. Försök igen."));
      return;
    }
    toast.success(`${name} är blockerad.`);
    done();
  }

  async function unblock() {
    setBusy(true);
    const { error } = await supabase
      .from("user_blocks")
      .delete()
      .eq("blocker_id", user!.id)
      .eq("blocked_id", userId);
    setBusy(false);
    if (error) {
      toast.error(userMessage(error, "Det gick inte att ta bort blockeringen. Försök igen."));
      return;
    }
    toast.success(`Blockeringen av ${name} är borttagen.`);
    done();
  }

  if (blocked) {
    return (
      <Button size="sm" variant="ghost" className="rounded-full" disabled={busy} onClick={unblock}>
        <Ban className="mr-1 h-4 w-4" /> Ta bort blockering
      </Button>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="rounded-full text-muted-foreground"
          disabled={busy}
        >
          <Ban className="mr-1 h-4 w-4" /> Blockera
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Blockera {name}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                Ni kan inte skicka meddelanden till varandra, {name} kan inte skicka
                bokningsförfrågningar till dig och öppna förfrågningar mellan er avslutas.
              </p>
              <p>
                Godkända bokningar ligger kvar, och så länge en hyra pågår kan ni fortfarande skriva
                till varandra så att saken kan lämnas tillbaka. Avboka under Bokningar om det
                behövs.
              </p>
              <p>
                {name} får inget besked om blockeringen, men märker att meddelanden och
                förfrågningar inte går fram. Du kan ta bort blockeringen när du vill.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Avbryt</AlertDialogCancel>
          <AlertDialogAction onClick={block}>Blockera</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
