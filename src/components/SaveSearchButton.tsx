import { BellPlus } from "lucide-react";
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
      toast.info("Logga in för att skapa en sökbevakning.");
      return;
    }
    const { error } = await supabase.from("saved_searches").insert({
      user_id: user.id,
      label,
      query: label,
      filters: filters as never,
    });
    toast[error ? "error" : "success"](
      error ? "Kunde inte spara sökbevakningen" : "Sökbevakning sparad – du får notiser vid nya träffar",
    );
  }

  return (
    <Button variant="ghost" size="sm" className="rounded-full" onClick={save}>
      <BellPlus className="mr-1 h-4 w-4" /> Bevaka sökning
    </Button>
  );
}
