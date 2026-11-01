import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { BadgeCheck, LogOut, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
    queryFn: async () => (await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle()).data,
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
    if (error) { toast.error(authErrorMessage(error)); return; }
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
      toast.error("Du har bokningar som inte är avslutade. Avboka dem eller avsluta hyran under Bokningar först.");
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
            Redigera, pausa och ta bort dina annonser.
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
          <Label>Ort (visas på din profil)</Label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} />
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
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button className="rounded-full" onClick={saveProfile}>Spara</Button>
          {user && (
            <Link to="/profil/$id" params={{ id: user.id }} className="text-sm text-primary hover:underline">
              Visa din profil →
            </Link>
          )}
        </div>
      </section>

      <PhoneSection verified={!!profile?.phone_verified} />

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

      <BlockedUsersSection />

      <section className="mt-10 space-y-3 rounded-3xl border border-destructive/40 p-5">
        <h2 className="font-display text-xl font-semibold">Radera konto</h2>
        <p className="text-sm text-muted-foreground">
          Ditt konto, din profil, dina annonser och bilder, favoriter, sparade sökningar och konversationer raderas
          för gott.
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
    const { error } = await supabase.auth.verifyOtp({ phone: sentTo, token: code.trim(), type: "phone_change" });
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
    <section className="mt-10 space-y-3">
      <h2 className="font-display text-xl font-semibold">Verifiera telefonnummer</h2>
      <p className="text-sm text-muted-foreground">
        Numret visas aldrig för andra. Andra ser bara att det är verifierat.
      </p>
      {verified && !sentTo && (
        <p className="flex items-center gap-1.5 text-sm font-medium text-primary">
          <BadgeCheck className="h-4 w-4" /> Verifierat ✓
        </p>
      )}
      {sentTo ? (
        <form onSubmit={verify} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="sms-code">Koden i SMS:et till {sentTo}</Label>
            <Input
              id="sms-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="rounded-full" disabled={busy || !code.trim()}>
              Verifiera
            </Button>
            <Button type="button" variant="ghost" className="rounded-full" onClick={() => setSentTo(null)}>
              Byt nummer
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={sendCode} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="phone">{verified ? "Byt till ett annat nummer" : "Mobilnummer"}</Label>
            <Input
              id="phone"
              type="tel"
              autoComplete="tel"
              placeholder="070-123 45 67"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <Button type="submit" variant="outline" className="rounded-full" disabled={busy || !phone.trim()}>
            Skicka kod
          </Button>
        </form>
      )}
    </section>
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
    <section className="mt-10 space-y-3">
      <h2 className="font-display text-xl font-semibold">Blockerade användare</h2>
      {isLoading ? null : !blocked?.length ? (
        <p className="text-sm text-muted-foreground">Du har inte blockerat någon.</p>
      ) : (
        <ul className="divide-y divide-border rounded-3xl border border-border">
          {blocked.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="font-medium">{b.name}</span>
              <Button size="sm" variant="ghost" className="rounded-full" onClick={() => unblock(b.id, b.name)}>
                Ta bort blockering
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
