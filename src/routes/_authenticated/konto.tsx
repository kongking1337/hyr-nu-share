import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { LogOut, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MIN_PASSWORD_LENGTH, authErrorMessage } from "@/lib/auth-errors";

export const Route = createFileRoute("/_authenticated/konto")({
  head: () => ({
    meta: [
      { title: "Mitt konto – Hyrkoll" },
      { name: "description", content: "Din profil, ditt lösenord och ditt konto på Hyrkoll." },
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
  const [password, setPassword] = useState("");
  const [confirmDelete, setConfirmDelete] = useState("");
  const [busy, setBusy] = useState(false);

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

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      toast.error(`Lösenordet måste vara minst ${MIN_PASSWORD_LENGTH} tecken.`);
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { toast.error(authErrorMessage(error)); return; }
    setPassword("");
    toast.success("Lösenordet är bytt.");
  }

  async function deleteAccount() {
    setBusy(true);
    const { error } = await supabase.rpc("delete_my_account");
    if (error) {
      setBusy(false);
      toast.error("Kontot kunde inte raderas. Försök igen eller kontakta oss.");
      return;
    }
    await supabase.auth.signOut();
    toast.success("Ditt konto och dina annonser är raderade.");
    navigate({ to: "/" });
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

      <section className="mt-10 space-y-3">
        <h2 className="font-display text-xl font-semibold">Byt lösenord</h2>
        <form onSubmit={changePassword} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-password">Nytt lösenord (minst {MIN_PASSWORD_LENGTH} tecken)</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" variant="outline" className="rounded-full" disabled={busy || !password}>
            Byt lösenord
          </Button>
        </form>
      </section>

      <section className="mt-10 space-y-3 rounded-3xl border border-destructive/40 p-5">
        <h2 className="font-display text-xl font-semibold">Radera konto</h2>
        <p className="text-sm text-muted-foreground">
          Ditt konto, din profil, dina annonser, favoriter, sparade sökningar och konversationer raderas för gott.
          Det går inte att ångra.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-delete">Skriv RADERA för att bekräfta</Label>
          <Input id="confirm-delete" value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} />
        </div>
        <Button
          variant="destructive"
          className="rounded-full"
          disabled={busy || confirmDelete.trim().toUpperCase() !== "RADERA"}
          onClick={deleteAccount}
        >
          <Trash2 className="mr-1 h-4 w-4" /> Radera mitt konto
        </Button>
      </section>
    </div>
  );
}
