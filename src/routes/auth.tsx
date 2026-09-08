import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Logga in eller skapa konto – Hyrkoll" },
      { name: "description", content: "Skapa konto som privatperson eller företag och börja hyra ut." },
      { property: "og:title", content: "Logga in – Hyrkoll" },
      { property: "og:description", content: "Konto för privatpersoner och företag." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<"private" | "company">("private");
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
    navigate({ to: "/konto" });
  }

  async function signUp() {
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: name, account_type: accountType },
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    if (!data.session) return toast.success("Kolla din e-post och bekräfta kontot.");
    navigate({ to: "/konto" });
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) return toast.error("Google-inloggning misslyckades.");
    if (result.redirected) return;
    navigate({ to: "/konto" });
  }

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="font-display text-3xl font-semibold">Välkommen till Hyrkoll</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Skapa konto som privatperson eller företag för att boka, hyra ut och chatta.
      </p>

      <Tabs defaultValue="signin" className="mt-7">
        <TabsList className="w-full">
          <TabsTrigger value="signin" className="flex-1">Logga in</TabsTrigger>
          <TabsTrigger value="signup" className="flex-1">Skapa konto</TabsTrigger>
        </TabsList>

        <TabsContent value="signin" className="space-y-3 pt-4">
          <Field label="E-post" value={email} onChange={setEmail} type="email" />
          <Field label="Lösenord" value={password} onChange={setPassword} type="password" />
          <Button className="w-full rounded-full" onClick={signIn} disabled={busy}>Logga in</Button>
        </TabsContent>

        <TabsContent value="signup" className="space-y-3 pt-4">
          <Field label="Namn" value={name} onChange={setName} />
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
          <Field label="E-post" value={email} onChange={setEmail} type="email" />
          <Field label="Lösenord" value={password} onChange={setPassword} type="password" />
          <Button className="w-full rounded-full" onClick={signUp} disabled={busy}>Skapa konto</Button>
        </TabsContent>
      </Tabs>

      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> eller <span className="h-px flex-1 bg-border" />
      </div>
      <Button variant="outline" className="w-full rounded-full" onClick={google}>
        Fortsätt med Google
      </Button>
    </div>
  );
}

function Field({
  label, value, onChange, type = "text",
}: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
