import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Wordmark } from "@/components/Header";
import { Page } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
      <Shell title="Välj nytt lösenord">
        <div className="mt-6 space-y-4" aria-busy="true" aria-label="Kontrollerar länken">
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-full" />
        </div>
        <p className="sr-only">Kontrollerar länken …</p>
      </Shell>
    );

  if (!user || linkError) {
    return (
      <Shell
        title="Länken fungerar inte"
        description='Länken har gått ut eller redan använts. Begär en ny under "Glömt lösenordet?" på inloggningssidan.'
      >
        <Button asChild size="lg" className="mt-6 w-full">
          <Link to="/auth">Till inloggning</Link>
        </Button>
      </Shell>
    );
  }

  return (
    <Shell title="Välj nytt lösenord" description={`För ${user.email}`}>
      <form onSubmit={save} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="new-password">Nytt lösenord</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            aria-describedby="new-password-hint"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p id="new-password-hint" className="text-xs text-muted-foreground">
            Minst {MIN_PASSWORD_LENGTH} tecken.
          </p>
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
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          Spara lösenord
        </Button>
      </form>
    </Shell>
  );
}

/** Samma centrerade kort som inloggningssidan. */
function Shell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Page width="narrow">
      <div className="sm:rounded-2xl sm:border sm:border-border sm:bg-card sm:p-8">
        <Link
          to="/"
          aria-label="Hyrkoll, till startsidan"
          className="inline-block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Wordmark />
        </Link>
        <h1 className="mt-6 font-display text-3xl font-bold leading-tight tracking-tight">{title}</h1>
        {description && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>}
        {children}
      </div>
    </Page>
  );
}
