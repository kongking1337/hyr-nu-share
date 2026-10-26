import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Captcha, captchaEnabled } from "@/components/Captcha";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MIN_PASSWORD_LENGTH, authErrorMessage } from "@/lib/auth-errors";

/** Bara sökvägar inom sajten, så att länken inte kan skicka vidare någon annanstans. */
function safeRedirect(value: unknown): string | undefined {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : undefined;
}

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { redirect?: string } => {
    const redirect = safeRedirect(s["redirect"]);
    return redirect ? { redirect } : {};
  },
  head: () => ({
    meta: [
      { title: "Logga in eller skapa konto – Hyrkoll" },
      {
        name: "description",
        content: "Skapa konto som privatperson eller företag för att köpa, sälja och hyra.",
      },
      { property: "og:title", content: "Logga in – Hyrkoll" },
      { property: "og:description", content: "Konto för privatpersoner och företag." },
    ],
  }),
  component: AuthPage,
});

/** Visa Google-knappen bara om Google-inloggning är aktiverad i Supabase. */
function useGoogleEnabled(): boolean {
  const { data } = useQuery({
    queryKey: ["auth-settings"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const url = import.meta.env["VITE_SUPABASE_URL"];
      const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
      const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
      if (!res.ok) return false;
      const settings = (await res.json()) as { external?: { google?: boolean } };
      return !!settings.external?.google;
    },
  });
  return !!data;
}

function AuthPage() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const { user } = useAuth();
  const googleEnabled = useGoogleEnabled();
  const goBack = () => (redirect ? navigate({ to: redirect }) : navigate({ to: "/konto" }));

  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<"private" | "company">("private");
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [accepted, setAccepted] = useState(false);
  // Captcha-token gäller ett försök; nyckeln ritar om rutan efter varje försök.
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const captcha = <Captcha key={`${mode}-${captchaKey}`} onToken={setCaptchaToken} />;

  /** Returnerar token, eller undefined om captcha inte används. false = inte klar än. */
  function takeCaptcha(): string | undefined | false {
    if (!captchaEnabled) return undefined;
    if (!captchaToken) {
      toast.error("Bekräfta först att du inte är en robot.");
      return false;
    }
    const token = captchaToken;
    setCaptchaToken(null);
    setCaptchaKey((k) => k + 1);
    return token;
  }

  async function signIn(e: FormEvent) {
    e.preventDefault();
    const captchaToken = takeCaptcha();
    if (captchaToken === false) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
      options: captchaToken ? { captchaToken } : {},
    });
    setBusy(false);
    if (error) {
      toast.error(authErrorMessage(error));
      return;
    }
    goBack();
  }

  async function signUp(e: FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      toast.error(`Lösenordet måste vara minst ${MIN_PASSWORD_LENGTH} tecken.`);
      return;
    }
    if (!accepted) {
      toast.error("Du behöver vara minst 18 år och godkänna användarvillkoren.");
      return;
    }
    const captchaToken = takeCaptcha();
    if (captchaToken === false) return;
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        ...(captchaToken ? { captchaToken } : {}),
        emailRedirectTo: window.location.origin + (redirect ?? ""),
        data: { full_name: name.trim(), account_type: accountType },
      },
    });
    setBusy(false);
    if (error) {
      toast.error(authErrorMessage(error));
      return;
    }
    if (!data.session) {
      toast.success("Nästan klart! Klicka på länken i mejlet vi skickade för att bekräfta kontot.");
      return;
    }
    goBack();
  }

  async function sendReset(e: FormEvent) {
    e.preventDefault();
    const captchaToken = takeCaptcha();
    if (captchaToken === false) return;
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/nytt-losenord`,
      ...(captchaToken ? { captchaToken } : {}),
    });
    setBusy(false);
    // Samma besked oavsett om kontot finns, så att ingen kan ta reda på vem som har konto.
    if (error && error.code !== "user_not_found") {
      toast.error(authErrorMessage(error));
      return;
    }
    setResetSent(true);
  }

  async function google() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + (redirect ?? "") },
    });
    if (error) toast.error(authErrorMessage(error));
  }

  if (user) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-14">
        <h1 className="font-display text-3xl font-semibold">Du är inloggad</h1>
        <p className="text-sm text-muted-foreground">Inloggad som {user.email}.</p>
        <Button className="rounded-full" onClick={goBack}>
          Fortsätt
        </Button>
      </div>
    );
  }

  if (mode === "forgot") {
    return (
      <div className="mx-auto max-w-md px-4 py-14">
        <h1 className="font-display text-3xl font-semibold">Glömt lösenordet?</h1>
        {resetSent ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Om det finns ett konto för {email.trim()} har vi skickat en länk för att välja ett nytt
            lösenord. Kolla inkorgen och skräpposten. Länken gäller i en timme.
          </p>
        ) : (
          <form onSubmit={sendReset} className="mt-6 space-y-3">
            <p className="text-sm text-muted-foreground">
              Skriv din e-postadress så skickar vi en länk där du kan välja ett nytt lösenord.
            </p>
            <Field
              id="reset-email"
              label="E-post"
              value={email}
              onChange={setEmail}
              type="email"
              autoComplete="email"
            />
            {captcha}
            <Button type="submit" className="w-full rounded-full" disabled={busy}>
              Skicka länk
            </Button>
          </form>
        )}
        <button
          type="button"
          className="mt-6 text-sm text-primary hover:underline"
          onClick={() => {
            setMode("signin");
            setResetSent(false);
          }}
        >
          ← Tillbaka till inloggning
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="font-display text-3xl font-semibold">Välkommen till Hyrkoll</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Skapa konto som privatperson eller företag för att köpa, sälja, hyra och skicka meddelanden.
      </p>

      <Tabs value={mode} onValueChange={(v) => setMode(v as "signin" | "signup")} className="mt-7">
        <TabsList className="w-full">
          <TabsTrigger value="signin" className="flex-1">
            Logga in
          </TabsTrigger>
          <TabsTrigger value="signup" className="flex-1">
            Skapa konto
          </TabsTrigger>
        </TabsList>

        <TabsContent value="signin">
          <form onSubmit={signIn} className="space-y-3 pt-4">
            <Field
              id="signin-email"
              label="E-post"
              value={email}
              onChange={setEmail}
              type="email"
              autoComplete="email"
            />
            <Field
              id="signin-password"
              label="Lösenord"
              value={password}
              onChange={setPassword}
              type="password"
              autoComplete="current-password"
            />
            {captcha}
            <Button type="submit" className="w-full rounded-full" disabled={busy}>
              Logga in
            </Button>
            <button
              type="button"
              className="text-sm text-primary hover:underline"
              onClick={() => setMode("forgot")}
            >
              Glömt lösenordet?
            </button>
          </form>
        </TabsContent>

        <TabsContent value="signup">
          <form onSubmit={signUp} className="space-y-3 pt-4">
            <Field
              id="signup-name"
              label="Namn"
              value={name}
              onChange={setName}
              autoComplete="name"
            />
            <div className="grid grid-cols-2 gap-2">
              {(["private", "company"] as const).map((t) => (
                <Button
                  key={t}
                  type="button"
                  variant={accountType === t ? "default" : "outline"}
                  className="rounded-full"
                  onClick={() => setAccountType(t)}
                >
                  {t === "private" ? "Privatperson" : "Företag"}
                </Button>
              ))}
            </div>
            <Field
              id="signup-email"
              label="E-post"
              value={email}
              onChange={setEmail}
              type="email"
              autoComplete="email"
            />
            <Field
              id="signup-password"
              label={`Lösenord (minst ${MIN_PASSWORD_LENGTH} tecken)`}
              value={password}
              onChange={setPassword}
              type="password"
              autoComplete="new-password"
            />
            <div className="flex items-start gap-2.5">
              <Checkbox
                id="accept-terms"
                checked={accepted}
                onCheckedChange={(v) => setAccepted(v === true)}
                className="mt-0.5"
              />
              <Label htmlFor="accept-terms" className="cursor-pointer text-sm font-normal leading-snug">
                Jag är minst 18 år och godkänner{" "}
                <Link to="/villkor" className="text-primary underline" target="_blank">
                  användarvillkoren
                </Link>
                . Läs hur vi hanterar personuppgifter i{" "}
                <Link to="/integritet" className="text-primary underline" target="_blank">
                  integritetspolicyn
                </Link>
                .
              </Label>
            </div>
            {captcha}
            <Button type="submit" className="w-full rounded-full" disabled={busy}>
              Skapa konto
            </Button>
            <p className="text-xs text-muted-foreground">
              I dina annonser visas bara förnamn och första bokstaven i efternamnet. Din
              e-postadress visas aldrig.
            </p>
          </form>
        </TabsContent>
      </Tabs>

      {googleEnabled && (
        <>
          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> eller{" "}
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button variant="outline" className="w-full rounded-full" onClick={google}>
            Fortsätt med Google
          </Button>
        </>
      )}

      <p className="mt-8 text-center text-xs text-muted-foreground">
        <Link to="/" className="hover:underline">
          ← Till startsidan
        </Link>
      </p>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        required
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
