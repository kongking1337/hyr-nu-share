import { Bookmark } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLoginPrompt } from "@/hooks/useLoginPrompt";
import { userMessage } from "@/lib/db-errors";

export function SaveSearchButton({
  label,
  filters,
}: {
  label: string;
  filters: Record<string, unknown>;
}) {
  const { user } = useAuth();
  const loginPrompt = useLoginPrompt();

  async function save() {
    if (!user) {
      loginPrompt("Logga in för att spara sökningen.");
      return;
    }
    const { error } = await supabase.from("saved_searches").insert({
      user_id: user.id,
      label: label.slice(0, 200),
      query: label.slice(0, 500),
      filters: filters as never,
    });
    if (error) {
      toast.error(userMessage(error, "Kunde inte spara sökningen. Försök igen."));
      return;
    }
    toast.success("Sökningen är sparad under Favoriter");
  }

  return (
    <Button variant="ghost" size="sm" className="rounded-full" onClick={save}>
      <Bookmark className="mr-1 h-4 w-4" /> Spara sökning
    </Button>
  );
}
