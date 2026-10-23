import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { BadgeCheck, Building2, LogOut, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { kr } from "@/lib/pricing";

export const Route = createFileRoute("/_authenticated/konto")({
  head: () => ({
    meta: [
      { title: "Mitt konto – Hyrkoll" },
      { name: "description", content: "Profil, verifieringar, företagsuppgifter, inventarie och statistik." },
      { property: "og:title", content: "Mitt konto – Hyrkoll" },
      { property: "og:description", content: "Profil och företagsprofil." },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [company, setCompany] = useState({ name: "", org_number: "", logo_url: "", city: "" });

  const { data, refetch } = useQuery({
    queryKey: ["account", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [{ data: profile }, { data: companies }, { data: listings }, { data: bookings }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle(),
        supabase.from("companies").select("*").eq("owner_id", user!.id),
        supabase.from("listings").select("id, title, price_day, status").eq("owner_id", user!.id),
        supabase.from("bookings").select("id, total_price, status"),
      ]);
      return { profile, companies: companies ?? [], listings: listings ?? [], bookings: bookings ?? [] };
    },
  });

  useEffect(() => {
    if (data?.profile) {
      setName(data.profile.full_name ?? "");
      setCity(data.profile.city ?? "");
    }
  }, [data?.profile]);

  const revenue = (data?.bookings ?? []).reduce((s, b) => s + Number(b.total_price), 0);

  async function saveProfile() {
    const { error } = await supabase.from("profiles").update({ full_name: name, city }).eq("id", user!.id);
    toast[error ? "error" : "success"](error ? "Kunde inte spara" : "Profil sparad");
  }

  async function saveCompany() {
    const { error } = await supabase.from("companies").insert({ ...company, owner_id: user!.id });
    if (error) { toast.error("Kunde inte spara företaget"); return; }
    toast.success("Företagsprofil skapad");
    refetch();
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
        to="/bud"
        className="mt-6 flex items-center justify-between rounded-3xl border border-border p-5 transition-colors hover:bg-muted/60"
      >
        <span>
          <span className="block font-display text-lg font-semibold">Mina bud</span>
          <span className="block text-sm text-muted-foreground">
            Prisförslag och motbud för dina uthyrningar och hyror.
          </span>
        </span>
      </Link>

      <Link
        to="/mina-annonser"
        className="mt-6 flex items-center justify-between rounded-3xl border border-border p-5 transition-colors hover:bg-muted/60"
      >
        <span>
          <span className="block font-display text-lg font-semibold">Mina annonser</span>
          <span className="block text-sm text-muted-foreground">
            Dashboard med visningar, klick, bokningar, intäkter och snabbåtgärder.
          </span>
        </span>
        <span className="text-sm text-primary">Öppna →</span>
      </Link>

      <Tabs defaultValue="profil" className="mt-7">
        <TabsList>
          <TabsTrigger value="profil">Profil</TabsTrigger>
          <TabsTrigger value="foretag">Företag</TabsTrigger>
          <TabsTrigger value="statistik">Statistik</TabsTrigger>
        </TabsList>

        <TabsContent value="profil" className="space-y-4 pt-5">
          <div className="space-y-1.5"><Label>Namn</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Ort</Label><Input value={city} onChange={(e) => setCity(e.target.value)} /></div>
          <Button className="rounded-full" onClick={saveProfile}>Spara</Button>

          <div className="rounded-3xl border border-border p-5">
            <h2 className="font-display text-lg font-semibold">Verifiering</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <Verify label="E-post" ok={!!data?.profile?.email_verified} />
              <Verify label="Telefon" ok={!!data?.profile?.phone_verified} />
              <Verify label="ID-kontroll (BankID)" ok={!!data?.profile?.id_verified} />
              <Verify label="Företagsverifiering" ok={!!data?.companies.some((c) => c.verified)} />
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Verifieringsflöden är förberedda i datamodellen men aktiveras när identitetsleverantör är på plats.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-3xl border border-border p-5 text-sm">
            <Star className="h-4 w-4 fill-accent text-accent" />
            Profilbetyg {Number(data?.profile?.rating ?? 0).toFixed(1)} ({data?.profile?.review_count ?? 0} omdömen)
          </div>
        </TabsContent>

        <TabsContent value="foretag" className="space-y-4 pt-5">
          {(data?.companies ?? []).map((c) => (
            <div key={c.id} className="rounded-3xl border border-border p-5">
              <p className="flex items-center gap-2 font-display text-lg font-semibold">
                <Building2 className="h-5 w-5" /> {c.name}
                {c.verified && <BadgeCheck className="h-4 w-4 text-primary" />}
              </p>
              <p className="text-sm text-muted-foreground">Org.nr {c.org_number || "—"} · {c.city || "—"}</p>
              <p className="mt-2 text-sm">Inventarie: {data?.listings.length} annonser</p>
              <p className="mt-1 text-xs text-muted-foreground">Flera administratörer kan bjudas in (förberett).</p>
            </div>
          ))}
          <div className="space-y-3 rounded-3xl border border-border p-5">
            <h2 className="font-display text-lg font-semibold">Lägg till företagsprofil</h2>
            <Input placeholder="Företagsnamn" value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} />
            <Input placeholder="Organisationsnummer" value={company.org_number} onChange={(e) => setCompany({ ...company, org_number: e.target.value })} />
            <Input placeholder="Logotyp-URL" value={company.logo_url} onChange={(e) => setCompany({ ...company, logo_url: e.target.value })} />
            <Input placeholder="Ort" value={company.city} onChange={(e) => setCompany({ ...company, city: e.target.value })} />
            <Button className="rounded-full" onClick={saveCompany}>Spara företag</Button>
          </div>
        </TabsContent>

        <TabsContent value="statistik" className="grid gap-4 pt-5 sm:grid-cols-3">
          <Stat label="Mina annonser" value={String(data?.listings.length ?? 0)} />
          <Stat label="Bokningar" value={String(data?.bookings.length ?? 0)} />
          <Stat label="Bokningsvärde" value={kr(revenue)} />
          <div className="sm:col-span-3">
            <Link to="/hyr-ut" className="text-sm text-primary hover:underline">+ Lägg upp en ny annons</Link>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

const Verify = ({ label, ok }: { label: string; ok: boolean }) => (
  <li className="flex items-center justify-between">
    <span>{label}</span>
    <span className={ok ? "text-primary" : "text-muted-foreground"}>{ok ? "Verifierad" : "Ej verifierad"}</span>
  </li>
);

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-3xl border border-border p-5">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="font-display text-2xl font-semibold">{value}</p>
  </div>
);
