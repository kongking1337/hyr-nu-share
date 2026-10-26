import { Bookmark } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function SaveSearchButton({
  label,
  filters,
}: {
  label: string;
  filters: Record<string, unknown>;
}) {
  const { user } = useAuth();

  async function save() {
    if (!user) {
      toast.info("Logga in för att spara sökningen.");
      return;
    }
    const { error } = await supabase.from("saved_searches").insert({
      user_id: user.id,
      label,
      query: label,
      filters: filters as never,
    });
    toast[error ? "error" : "success"](
      error ? "Kunde inte spara sökningen" : "Sökningen är sparad under Favoriter",
    );
  }

  return (
    <Button variant="ghost" size="sm" className="rounded-full" onClick={save}>
      <Bookmark className="mr-1 h-4 w-4" /> Spara sökning
    </Button>
  );
}
