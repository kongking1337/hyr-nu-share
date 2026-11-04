import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { BadgeCheck, ChevronRight, LogOut, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LoadingRows, Page, PageHeader } from "@/components/layout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MIN_PASSWORD_LENGTH, authErrorMessage } from "@/lib/auth-errors";
import { addDays, todayISO } from "@/lib/bookings";
import { userMessage } from "@/lib/db-errors";
import { removeAllMyPhotos } from "@/lib/photos";

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
  const [bio, setBio] = useState("");
  const [password, setPassword] = useState("");
  const [confirmDelete, setConfirmDelete] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["account", user?.id],
    enabled: !!user,
    queryFn: async () =>
      (await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle()).data,
  });

  useEffect(() => {
    if (profile) {
      setName(profile.full_name ?? "");
      setCity(profile.city ?? "");
      setBio(profile.bio ?? "");
    }
  }, [profile]);

  async function saveProfile() {
    if (bio.length > MAX_BIO_LENGTH) {
      toast.error(`"Om mig" får vara högst ${MAX_BIO_LENGTH} tecken.`);
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: name, city, bio: bio.trim() || null })
      .eq("id", user!.id);
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
    if (error) {
      toast.error(authErrorMessage(error));
      return;
    }
    setPassword("");
    toast.success("Lösenordet är bytt.");
  }

  async function deleteAccount() {
    setBusy(true);
    // Mitt i en hyra går det inte att radera kontot (databasen stoppar det också).
    // Kolla först, så att bilderna inte hinner tas bort.
    const { data: bookings } = await supabase.rpc("my_bookings");
    const cutoff = addDays(todayISO(), -14);
    if ((bookings ?? []).some((b) => b.status === "confirmed" && b.end_date >= cutoff)) {
      setBusy(false);
      toast.error(
        "Du har bokningar som inte är avslutade. Avboka dem eller avsluta hyran under Bokningar först.",
      );
      return;
    }
    // Bildfilerna tas bort via Storage innan kontot raderas.
    await removeAllMyPhotos(user!.id).catch(() => undefined);
    const { error } = await supabase.rpc("delete_my_account");
    if (error) {
      setBusy(false);
      toast.error(userMessage(error, "Kontot kunde inte raderas. Försök igen eller kontakta oss."));
      return;
    }
    await supabase.auth.signOut();
    toast.success("Ditt konto och dina annonser är raderade.");
    navigate({ to: "/" });
  }

  return (
    <Page width="text">
      <PageHeader
        title="Mitt konto"
        description={user?.email}
        actions={
          <Button
            variant="outline"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/" });
            }}
          >
            <LogOut aria-hidden /> Logga ut
          </Button>
        }
      />

      <div className="space-y-6">
        <nav aria-label="Genvägar" className="grid gap-3 sm:grid-cols-2">
          <Shortcut
            to="/mina-annonser"
            title="Mina annonser"
            text="Redigera, pausa och ta bort dina annonser."
          />
          {user && (
            <Link
              to="/profil/$id"
              params={{ id: user.id }}
              className="group flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span>
                <span className="block font-display text-lg font-bold">Din profil</span>
                <span className="block text-sm text-muted-foreground">
                  Så ser andra dig och dina omdömen.
                </span>
              </span>
              <ChevronRight
                className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          )}
        </nav>

        <SettingsCard
          id="profil"
          title="Profil"
          description="Det här visas för andra på din profil och i dina annonser."
        >
          <div className="space-y-1.5">
            <Label htmlFor="full-name">Namn</Label>
            <Input
              id="full-name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-describedby="full-name-hint"
            />
            <p id="full-name-hint" className="text-xs text-muted-foreground">
              I dina annonser visas förnamn och första bokstaven i efternamnet, t.ex. "Anna S.".
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="city">Ort (visas på din profil)</Label>
            <Input
              id="city"
              autoComplete="address-level2"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bio">Om mig (visas på din profil)</Label>
            <Textarea
              id="bio"
              rows={4}
              maxLength={MAX_BIO_LENGTH}
              value={bio}
              placeholder="T.ex. vad du hyr ut, var du bor och när du brukar kunna lämna över saker."
              onChange={(e) => setBio(e.target.value)}
              aria-describedby="bio-count"
            />
            <p id="bio-count" className="text-right text-xs tabular-nums text-muted-foreground">
              {bio.length} / {MAX_BIO_LENGTH}
            </p>
          </div>
          <div>
            <Button onClick={saveProfile}>Spara profilen</Button>
          </div>
        </SettingsCard>

        <PhoneSection verified={!!profile?.phone_verified} />

        <SettingsCard id="losenord" title="Byt lösenord">
          <form onSubmit={changePassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-password">
                Nytt lösenord (minst {MIN_PASSWORD_LENGTH} tecken)
              </Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" variant="outline" disabled={busy || !password}>
              Byt lösenord
            </Button>
          </form>
        </SettingsCard>

        <BlockedUsersSection />
      </div>

      <section
        aria-labelledby="radera-konto"
        className="mt-16 space-y-4 rounded-2xl border-2 border-destructive/40 bg-destructive/5 p-5 sm:p-6"
      >
        <div>
          <h2
            id="radera-konto"
            className="flex items-center gap-2 font-display text-xl font-bold text-destructive"
          >
            <TriangleAlert className="h-5 w-5" aria-hidden /> Radera konto
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ditt konto, din profil, dina annonser och bilder, favoriter, sparade sökningar och
            konversationer raderas för gott. Det går inte att ångra.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-delete">Skriv RADERA för att bekräfta</Label>
          <Input
            id="confirm-delete"
            autoComplete="off"
            className="max-w-xs"
            value={confirmDelete}
            onChange={(e) => setConfirmDelete(e.target.value)}
          />
        </div>
        <Button
          variant="destructive"
          disabled={busy || confirmDelete.trim().toUpperCase() !== "RADERA"}
          onClick={deleteAccount}
        >
          <Trash2 aria-hidden /> Radera mitt konto
        </Button>
      </section>
    </Page>
  );
}

/** Ett avsnitt i inställningarna: rubrik, kort förklaring och innehåll. */
function SettingsCard({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h2 id={id} className="font-display text-xl font-bold">
        {title}
      </h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

function Shortcut({ to, title, text }: { to: "/mina-annonser"; title: string; text: string }) {
  return (
    <Link
      to={to}
      className="group flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span>
        <span className="block font-display text-lg font-bold">{title}</span>
        <span className="block text-sm text-muted-foreground">{text}</span>
      </span>
      <ChevronRight
        className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        aria-hidden
      />
    </Link>
  );
}

const MAX_BIO_LENGTH = 500;

/** Visa telefonverifiering bara om telefoninloggning (SMS) är påslagen i Supabase. */
function usePhoneEnabled(): boolean {
  const { data } = useQuery({
    queryKey: ["auth-settings-phone"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const url = import.meta.env["VITE_SUPABASE_URL"];
      const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
      const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
      if (!res.ok) return false;
      const settings = (await res.json()) as { external?: { phone?: boolean } };
      return settings.external?.phone === true;
    },
  });
  return !!data;
}

/** "070-123 45 67" → "+46701234567". Andra länders nummer behöver skrivas med +. */
function toE164(input: string): string | null {
  let n = input.replace(/[\s\-()]/g, "");
  if (n.startsWith("00")) n = `+${n.slice(2)}`;
  else if (n.startsWith("0")) n = `+46${n.slice(1)}`;
  else if (n.startsWith("46")) n = `+${n}`;
  // "+46 (0)70 …" och "+46 070 …": nollan efter landsnumret ska bort.
  if (n.startsWith("+460")) n = `+46${n.slice(4)}`;
  return /^\+\d{8,15}$/.test(n) ? n : null;
}

function PhoneSection({ verified }: { verified: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const enabled = usePhoneEnabled();
  const [phone, setPhone] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  if (!enabled) return null;

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    const number = toE164(phone);
    if (!number) {
      toast.error("Skriv ett giltigt mobilnummer, t.ex. 070-123 45 67.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ phone: number });
    setBusy(false);
    if (error) {
      toast.error(authErrorMessage(error));
      return;
    }
    setSentTo(number);
    toast.success("Vi har skickat en kod med SMS.");
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!sentTo || !code.trim()) return;
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({
      phone: sentTo,
      token: code.trim(),
      type: "phone_change",
    });
    setBusy(false);
    if (error) {
      toast.error(authErrorMessage(error));
      return;
    }
    setSentTo(null);
    setCode("");
    setPhone("");
    toast.success("Telefonnumret är verifierat.");
    void queryClient.invalidateQueries({ queryKey: ["account", user?.id] });
  }

  return (
    <SettingsCard
      id="telefon"
      title="Verifiera telefonnummer"
      description="Numret visas aldrig för andra. Andra ser bara att det är verifierat."
    >
      {verified && !sentTo && (
        <p className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm font-semibold">
          <BadgeCheck className="h-4 w-4 text-primary" aria-hidden /> Verifierat
        </p>
      )}
      {sentTo ? (
        <form onSubmit={verify} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sms-code">Koden i SMS:et till {sentTo}</Label>
            <Input
              id="sms-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="max-w-xs"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || !code.trim()}>
              Verifiera
            </Button>
            <Button type="button" variant="ghost" onClick={() => setSentTo(null)}>
              Byt nummer
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={sendCode} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="phone">{verified ? "Byt till ett annat nummer" : "Mobilnummer"}</Label>
            <Input
              id="phone"
              type="tel"
              autoComplete="tel"
              placeholder="070-123 45 67"
              className="max-w-xs"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <Button type="submit" variant="outline" disabled={busy || !phone.trim()}>
            Skicka kod
          </Button>
        </form>
      )}
    </SettingsCard>
  );
}

function BlockedUsersSection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: blocked, isLoading } = useQuery({
    queryKey: ["blocked-users", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_blocked_users");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function unblock(id: string, name: string) {
    const { error } = await supabase
      .from("user_blocks")
      .delete()
      .eq("blocker_id", user!.id)
      .eq("blocked_id", id);
    if (error) {
      toast.error(userMessage(error, "Det gick inte att ta bort blockeringen. Försök igen."));
      return;
    }
    toast.success(`Blockeringen av ${name} är borttagen.`);
    void queryClient.invalidateQueries({ queryKey: ["blocked-users"] });
    void queryClient.invalidateQueries({ queryKey: ["user-block"] });
  }

  return (
    <SettingsCard
      id="blockerade"
      title="Blockerade användare"
      description="De du har blockerat kan inte skriva till dig eller skicka förfrågningar."
    >
      {isLoading ? (
        <LoadingRows rows={1} />
      ) : !blocked?.length ? (
        <p className="text-sm text-muted-foreground">Du har inte blockerat någon.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {blocked.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="min-w-0 truncate font-medium">{b.name}</span>
              <Button size="sm" variant="ghost" onClick={() => unblock(b.id, b.name)}>
                Ta bort blockering
              </Button>
            </li>
          ))}
        </ul>
      )}
    </SettingsCard>
  );
}
