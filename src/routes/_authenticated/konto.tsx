import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/konto")({
  head: () => ({
    meta: [
      { title: "Mitt konto – Hyrkoll" },
      { name: "description", content: "Din profil på Hyrkoll." },
      { property: "og:title", content: "Mitt konto – Hyrkoll" },
      { property: "og:description", content: "Din profil på Hyrkoll." },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");

  const { data: profile } = useQuery({
    queryKey: ["account", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle()).data,
  });

  useEffect(() => {
    if (profile) {
      setName(profile.full_name ?? "");
      setCity(profile.city ?? "");
    }
  }, [profile]);

  async function saveProfile() {
    const { error } = await supabase.from("profiles").update({ full_name: name, city }).eq("id", user!.id);
    toast[error ? "error" : "success"](error ? "Kunde inte spara" : "Profil sparad");
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Mitt konto</h1>
          <p className="mt-1 text-sm text-muted-foreground">{user?.email}</p>
        </div>
        <Button
          variant="outline"
          className="rounded-full"
          onClick={async () => {
            await supabase.auth.signOut();
            navigate({ to: "/" });
          }}
        >
          <LogOut className="mr-1 h-4 w-4" /> Logga ut
        </Button>
      </div>

      <Link
        to="/mina-annonser"
        className="mt-6 flex items-center justify-between rounded-3xl border border-border p-5 transition-colors hover:bg-muted/60"
      >
        <span>
          <span className="block font-display text-lg font-semibold">Mina annonser</span>
          <span className="block text-sm text-muted-foreground">
            Redigera, pausa, markera som såld och ta bort dina annonser.
          </span>
        </span>
        <span className="text-sm text-primary">Öppna →</span>
      </Link>

      <section className="mt-8 space-y-4">
        <h2 className="font-display text-xl font-semibold">Profil</h2>
        <div className="space-y-1.5">
          <Label>Namn</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            I dina annonser visas förnamn och första bokstaven i efternamnet, t.ex. "Anna S.".
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Ort</Label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <Button className="rounded-full" onClick={saveProfile}>Spara</Button>
      </section>
    </div>
  );
}
