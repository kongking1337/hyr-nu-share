import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, Building2, CreditCard, Flag, Package, Star, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { kr } from "@/lib/pricing";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Adminpanel – Hyrkoll" },
      { name: "description", content: "KPI:er, annonser, företag, bokningar, betalningar, rapporter och källhälsa." },
      { property: "og:title", content: "Adminpanel – Hyrkoll" },
      { property: "og:description", content: "Överblick och moderering." },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { data } = useQuery({
    queryKey: ["admin"],
    queryFn: async () => {
      const [listings, bookings, companies, reviews, sources, categories, reports, profiles] = await Promise.all([
        supabase.from("listings").select("*").order("created_at", { ascending: false }),
        supabase.from("bookings").select("*"),
        supabase.from("companies").select("*"),
        supabase.from("reviews").select("*"),
        supabase.from("external_sources").select("*"),
        supabase.from("categories").select("*").order("sort"),
        supabase.from("reports").select("*"),
        supabase.from("profiles").select("*"),
      ]);
      return {
        listings: listings.data ?? [],
        bookings: bookings.data ?? [],
        companies: companies.data ?? [],
        reviews: reviews.data ?? [],
        sources: sources.data ?? [],
        categories: categories.data ?? [],
        reports: reports.data ?? [],
        profiles: profiles.data ?? [],
      };
    },
  });

  const gmv = (data?.bookings ?? []).reduce((s, b) => s + Number(b.total_price), 0);
  const commission = Math.round(gmv * 0.1);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-3xl font-semibold">Adminpanel</h1>
      <p className="mt-1 text-sm text-muted-foreground">Överblick, moderering och datakällornas hälsa.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi Icon={Package} label="Annonser" value={String(data?.listings.length ?? 0)} />
        <Kpi Icon={Users} label="Användare" value={String(data?.profiles.length ?? 0)} />
        <Kpi Icon={CreditCard} label="Bokningsvärde" value={kr(gmv)} />
        <Kpi Icon={Activity} label="Provision (10 %)" value={kr(commission)} />
      </div>

      <Tabs defaultValue="annonser" className="mt-8">
        <TabsList className="flex-wrap">
          <TabsTrigger value="annonser">Annonser</TabsTrigger>
          <TabsTrigger value="bokningar">Bokningar</TabsTrigger>
          <TabsTrigger value="foretag">Företag</TabsTrigger>
          <TabsTrigger value="betalningar">Betalningar</TabsTrigger>
          <TabsTrigger value="rapporter">Rapporter</TabsTrigger>
          <TabsTrigger value="recensioner">Recensioner</TabsTrigger>
          <TabsTrigger value="kategorier">Kategorier</TabsTrigger>
          <TabsTrigger value="kallor">Källor</TabsTrigger>
        </TabsList>

        <TabsContent value="annonser">
          <Grid head={["Titel", "Kategori", "Ort", "Dygnspris", "Status"]}>
            {(data?.listings ?? []).map((l) => (
              <TableRow key={l.id}>
                <TableCell>{l.title}</TableCell>
                <TableCell>{l.category_slug}</TableCell>
                <TableCell>{l.city}</TableCell>
                <TableCell>{kr(Number(l.price_day))}</TableCell>
                <TableCell>{l.status}</TableCell>
              </TableRow>
            ))}
          </Grid>
        </TabsContent>

        <TabsContent value="bokningar">
          <Grid head={["Period", "Dygn", "Totalt", "Status"]}>
            {(data?.bookings ?? []).map((b) => (
              <TableRow key={b.id}>
                <TableCell>{b.start_date} – {b.end_date}</TableCell>
                <TableCell>{b.days}</TableCell>
                <TableCell>{kr(Number(b.total_price))}</TableCell>
                <TableCell>{b.status}</TableCell>
              </TableRow>
            ))}
          </Grid>
        </TabsContent>

        <TabsContent value="foretag">
          <Grid head={["Företag", "Org.nr", "Ort", "Verifierat"]}>
            {(data?.companies ?? []).map((c) => (
              <TableRow key={c.id}>
                <TableCell className="flex items-center gap-2"><Building2 className="h-4 w-4" />{c.name}</TableCell>
                <TableCell>{c.org_number}</TableCell>
                <TableCell>{c.city}</TableCell>
                <TableCell>{c.verified ? "Ja" : "Nej"}</TableCell>
              </TableRow>
            ))}
          </Grid>
        </TabsContent>

        <TabsContent value="betalningar">
          <div className="mt-4 space-y-3 rounded-3xl border border-border p-5 text-sm">
            <p className="font-display text-lg font-semibold">Stripe Connect – integrationspunkter</p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Onboarding av uthyrare (Express-konton) vid publicering av första annonsen.</li>
              <li>Betalning vid bokning: grundpris + serviceavgift ({kr(commission)} hittills i provision).</li>
              <li>Deposition som separat auktorisering, frisläpps vid återlämning.</li>
              <li>Utbetalning till uthyrare efter hyresperiodens start.</li>
              <li>Återbetalning enligt avbokningsvillkor och tvistehantering.</li>
              <li>Försäkringspremie som separat post per dygn.</li>
            </ul>
            <p className="text-xs text-destructive">Betalningar är inte aktiverade – inga riktiga transaktioner sker.</p>
          </div>
        </TabsContent>

        <TabsContent value="rapporter">
          <Grid head={["Typ", "Objekt", "Orsak", "Status"]}>
            {(data?.reports ?? []).map((r) => (
              <TableRow key={r.id}>
                <TableCell className="flex items-center gap-2"><Flag className="h-4 w-4" />{r.target_type}</TableCell>
                <TableCell className="max-w-40 truncate">{r.target_id}</TableCell>
                <TableCell>{r.reason}</TableCell>
                <TableCell>{r.status}</TableCell>
              </TableRow>
            ))}
          </Grid>
        </TabsContent>

        <TabsContent value="recensioner">
          <Grid head={["Författare", "Betyg", "Text"]}>
            {(data?.reviews ?? []).slice(0, 40).map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.author_name}</TableCell>
                <TableCell className="flex items-center gap-1"><Star className="h-3 w-3 fill-accent text-accent" />{r.rating}</TableCell>
                <TableCell className="max-w-80 truncate">{r.body}</TableCell>
              </TableRow>
            ))}
          </Grid>
        </TabsContent>

        <TabsContent value="kategorier">
          <Grid head={["Kategori", "Slug", "Annonser"]}>
            {(data?.categories ?? []).map((c) => (
              <TableRow key={c.slug}>
                <TableCell>{c.name}</TableCell>
                <TableCell>{c.slug}</TableCell>
                <TableCell>{(data?.listings ?? []).filter((l) => l.category_slug === c.slug).length}</TableCell>
              </TableRow>
            ))}
          </Grid>
        </TabsContent>

        <TabsContent value="kallor">
          <Grid head={["Källa", "Typ", "Status", "Not"]}>
            {(data?.sources ?? []).map((s) => (
              <TableRow key={s.slug}>
                <TableCell>{s.name}</TableCell>
                <TableCell>{s.kind}</TableCell>
                <TableCell>
                  <span className={s.status === "demo" ? "text-primary" : "text-destructive"}>{s.status}</span>
                </TableCell>
                <TableCell className="max-w-96">{s.note}</TableCell>
              </TableRow>
            ))}
          </Grid>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({ Icon, label, value }: { Icon: typeof Users; label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-border p-5">
      <Icon className="h-5 w-5 text-primary" />
      <p className="mt-3 text-xs text-muted-foreground">{label}</p>
      <p className="font-display text-2xl font-semibold">{value}</p>
    </div>
  );
}

function Grid({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-3xl border border-border">
      <Table>
        <TableHeader>
          <TableRow>{head.map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
    </div>
  );
}
