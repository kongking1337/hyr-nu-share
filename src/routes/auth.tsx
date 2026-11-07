import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Captcha, captchaEnabled } from "@/components/Captcha";
import { Wordmark } from "@/components/Header";
import { Page } from "@/components/layout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MIN_PASSWORD_LENGTH, authErrorMessage } from "@/lib/auth-errors";
import { cn } from "@/lib/utils";

/**
 * Bara sökvägar inom sajten, så att länken inte kan skicka vidare någon annanstans.
 * Webbläsare läser "/\\" som "//", så bakstreck och styrtecken stoppas också.
 */
function safeRedirect(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//"))
    return undefined;
  if (value.includes("\\") || [...value].some((c) => c.charCodeAt(0) < 32)) return undefined;
  return value;
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
        content: "Skapa konto som privatperson eller företag för att hyra och hyra ut saker.",
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
  // Adressen dit bekräftelselänken gick, efter registrering (eller inloggning före bekräftelsen).
  const [confirmSentTo, setConfirmSentTo] = useState<string | null>(null);
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
      if (error.code === "email_not_confirmed") {
        setConfirmSentTo(email.trim());
        return;
      }
      toast.error(authErrorMessage(error));
      return;
    }
    goBack();
  }

  async function resendConfirmation() {
    if (!confirmSentTo) return;
    const captchaToken = takeCaptcha();
    if (captchaToken === false) return;
    setBusy(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: confirmSentTo,
      options: {
        emailRedirectTo: window.location.origin + (redirect ?? ""),
        ...(captchaToken ? { captchaToken } : {}),
      },
    });
    setBusy(false);
    if (error) {
      toast.error(authErrorMessage(error));
      return;
    }
    toast.success("Vi har skickat mejlet igen.");
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
      setConfirmSentTo(email.trim());
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
      <AuthShell title="Du är inloggad" description={`Inloggad som ${user.email}.`}>
        <Button size="lg" className="mt-6 w-full" onClick={goBack}>
          Fortsätt
        </Button>
      </AuthShell>
    );
  }

  if (confirmSentTo) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-14">
        <h1 className="font-display text-3xl font-semibold">Bekräfta din e-post</h1>
        <p className="text-sm text-muted-foreground">
          Vi har skickat en länk till{" "}
          <span className="font-medium text-foreground">{confirmSentTo}</span>. Klicka på den för
          att bekräfta kontot, så är du inloggad. Kolla skräpposten om mejlet inte har kommit inom
          några minuter.
        </p>
        <p className="text-sm text-muted-foreground">
          Har du redan ett konto med den adressen kommer inget nytt mejl. Logga in i stället, eller
          välj "Glömt lösenordet?" om du inte minns lösenordet.
        </p>
        {captcha}
        <div className="flex flex-wrap gap-2">
          <Button
            className="rounded-full"
            disabled={busy}
            onClick={() => void resendConfirmation()}
          >
            Skicka mejlet igen
          </Button>
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => {
              setConfirmSentTo(null);
              setMode("signin");
            }}
          >
            Till inloggning
          </Button>
        </div>
      </div>
    );
  }

  if (mode === "forgot") {
    return (
      <AuthShell
        title="Glömt lösenordet?"
        description={
          resetSent
            ? undefined
            : "Skriv din e-postadress så skickar vi en länk där du kan välja ett nytt lösenord."
        }
      >
        {resetSent ? (
          <div role="status" className="mt-6 flex gap-3 rounded-2xl bg-muted p-4 text-sm">
            <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
            <p>
              Om det finns ett konto för <span className="font-semibold">{email.trim()}</span> har
              vi skickat en länk för att välja ett nytt lösenord. Kolla inkorgen och skräpposten.
              Länken gäller i en timme.
            </p>
          </div>
        ) : (
          <form onSubmit={sendReset} className="mt-6 space-y-4">
            <Field
              id="reset-email"
              label="E-post"
              value={email}
              onChange={setEmail}
              type="email"
              autoComplete="email"
            />
            {captcha}
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              Skicka länk
            </Button>
          </form>
        )}
        <button
          type="button"
          className="mt-6 inline-flex items-center gap-1.5 rounded-sm text-sm font-semibold hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => {
            setMode("signin");
            setResetSent(false);
          }}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Tillbaka till inloggning
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Välkommen till Hyrkoll"
      description="Skapa konto som privatperson eller företag för att hyra, hyra ut och skicka meddelanden."
    >
      <Tabs value={mode} onValueChange={(v) => setMode(v as "signin" | "signup")} className="mt-6">
        <TabsList className="h-11 w-full rounded-full p-1">
          <TabsTrigger value="signin" className="h-full flex-1 rounded-full font-semibold">
            Logga in
          </TabsTrigger>
          <TabsTrigger value="signup" className="h-full flex-1 rounded-full font-semibold">
            Skapa konto
          </TabsTrigger>
        </TabsList>

        <TabsContent value="signin" className="mt-0">
          <form onSubmit={signIn} className="space-y-4 pt-6">
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
              aside={
                <button
                  type="button"
                  className="rounded-sm text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setMode("forgot")}
                >
                  Glömt lösenordet?
                </button>
              }
            />
            {captcha}
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              Logga in
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="signup" className="mt-0">
          <form onSubmit={signUp} className="space-y-4 pt-6">
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">Jag är</legend>
              <div className="grid grid-cols-2 gap-1 rounded-full border border-input p-1">
                {(["private", "company"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={accountType === t}
                    className={cn(
                      "h-9 rounded-full text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      accountType === t
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                    onClick={() => setAccountType(t)}
                  >
                    {t === "private" ? "Privatperson" : "Företag"}
                  </button>
                ))}
              </div>
            </fieldset>
            <Field
              id="signup-name"
              label={accountType === "company" ? "Företagets namn" : "Namn"}
              value={name}
              onChange={setName}
              autoComplete={accountType === "company" ? "organization" : "name"}
              maxLength={80}
            />
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
              label="Lösenord"
              hint={`Minst ${MIN_PASSWORD_LENGTH} tecken.`}
              value={password}
              onChange={setPassword}
              type="password"
              autoComplete="new-password"
            />
            <div className="flex items-start gap-3 rounded-2xl bg-muted p-4">
              <Checkbox
                id="accept-terms"
                checked={accepted}
                onCheckedChange={(v) => setAccepted(v === true)}
                className="mt-0.5 h-5 w-5 rounded-[5px]"
              />
              <Label
                htmlFor="accept-terms"
                className="cursor-pointer text-sm font-normal leading-snug"
              >
                Jag är minst 18 år och godkänner{" "}
                <Link
                  to="/villkor"
                  className="font-medium underline underline-offset-2 hover:text-primary"
                  target="_blank"
                >
                  användarvillkoren
                </Link>
                . Läs hur vi hanterar personuppgifter i{" "}
                <Link
                  to="/integritet"
                  className="font-medium underline underline-offset-2 hover:text-primary"
                  target="_blank"
                >
                  integritetspolicyn
                </Link>
                .
              </Label>
            </div>
            {captcha}
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              Skapa konto
            </Button>
            <p className="text-xs leading-relaxed text-muted-foreground">
              I dina annonser visas bara förnamn och första bokstaven i efternamnet. Din
              e-postadress visas aldrig.
            </p>
          </form>
        </TabsContent>
      </Tabs>

      {googleEnabled && (
        <>
          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> eller{" "}
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button variant="outline" size="lg" className="w-full" onClick={google}>
            Fortsätt med Google
          </Button>
        </>
      )}
    </AuthShell>
  );
}

/** Centrerat kort med ordmärket, rubrik och länk tillbaka till startsidan. */
function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string | undefined;
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
        <h1 className="mt-6 font-display text-3xl font-bold leading-tight tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
        )}
        {children}
      </div>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link
          to="/"
          className="rounded-sm hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Till startsidan
        </Link>
      </p>
    </Page>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  hint,
  aside,
  maxLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  /** Kort hjälptext under fältet, kopplad med aria-describedby. */
  hint?: string;
  /** Till exempel en länk till höger om etiketten. */
  aside?: ReactNode;
  maxLength?: number;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        {aside}
      </div>
      <Input
        id={id}
        type={type}
        value={value}
        required
        autoComplete={autoComplete}
        aria-describedby={hint ? `${id}-hint` : undefined}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
