import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MIN_PASSWORD_LENGTH, authErrorMessage } from "@/lib/auth-errors";

/** Hit leder länken i mejlet "Återställ lösenord". Supabase loggar in användaren via länken. */
export const Route = createFileRoute("/nytt-losenord")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Välj nytt lösenord – Hyrkoll" }, { name: "robots", content: "noindex" }],
  }),
  component: NewPasswordPage,
});

function NewPasswordPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [linkError, setLinkError] = useState(false);

  // Utgångna eller redan använda länkar kommer tillbaka med ett fel i adressen.
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search);
    if (params.get("error") || params.get("error_code")) setLinkError(true);
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      toast.error(`Lösenordet måste vara minst ${MIN_PASSWORD_LENGTH} tecken.`);
      return;
    }
    if (password !== repeat) {
      toast.error("Lösenorden är inte likadana.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(authErrorMessage(error));
      return;
    }
    toast.success("Lösenordet är bytt.");
    navigate({ to: "/konto" });
  }

  if (loading)
    return (
      <div className="mx-auto max-w-md px-4 py-14 text-muted-foreground">Kontrollerar länken …</div>
    );

  if (!user || linkError) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-14">
        <h1 className="font-display text-3xl font-semibold">Länken fungerar inte</h1>
        <p className="text-sm text-muted-foreground">
          Länken har gått ut eller redan använts. Begär en ny under "Glömt lösenordet?" på
          inloggningssidan.
        </p>
        <Button asChild className="rounded-full">
          <Link to="/auth">Till inloggning</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="font-display text-3xl font-semibold">Välj nytt lösenord</h1>
      <p className="mt-2 text-sm text-muted-foreground">För {user.email}</p>
      <form onSubmit={save} className="mt-6 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="new-password">Nytt lösenord (minst {MIN_PASSWORD_LENGTH} tecken)</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="repeat-password">Upprepa lösenordet</Label>
          <Input
            id="repeat-password"
            type="password"
            autoComplete="new-password"
            required
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
        </div>
        <Button type="submit" className="w-full rounded-full" disabled={busy}>
          Spara lösenord
        </Button>
      </form>
    </div>
  );
}
