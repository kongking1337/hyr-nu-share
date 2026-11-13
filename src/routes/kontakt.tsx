import { createFileRoute, Link } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { LegalPage } from "@/components/LegalPage";
import { Button } from "@/components/ui/button";
import { SITE, addressText, contactText, operatorWithOrgText } from "@/lib/site";

export const Route = createFileRoute("/kontakt")({
  head: () => ({
    meta: [
      { title: "Kontakt – Hyrkoll" },
      {
        name: "description",
        content: "Kontakta Hyrkoll, anmäl innehåll eller överklaga ett modereringsbeslut.",
      },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  return (
    <LegalPage
      title="Kontakt"
      intro={
        <>
          <p>
            Hyrkoll drivs av {operatorWithOrgText}, {addressText}.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-muted p-5">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">E-post</p>
              <p className="break-all font-display text-xl font-bold">
                {SITE.contactEmail || contactText}
              </p>
            </div>
            {SITE.contactEmail && (
              <Button asChild>
                <a href={`mailto:${SITE.contactEmail}`}>
                  <Mail /> Mejla oss
                </a>
              </Button>
            )}
          </div>
        </>
      }
    >
      <h2>Anmäl en annons eller konversation</h2>
      <p>
        Snabbast är knappen Anmäl på annonsen eller i konversationen. Gäller det något olagligt,
        eller kan du inte använda knappen, mejla oss med länken till annonsen och vad det gäller.
      </p>

      <h2>Har vi dolt din annons eller spärrat ditt konto?</h2>
      <p>
        Gäller det en annons står skälet under Mina annonser. Spärrar vi ett konto får du skälet via
        e-post. Tycker du att beslutet är fel, mejla oss inom sex månader med vad beslutet gäller
        och varför du tycker att det är fel. Vi tittar på det igen och svarar med en motivering.
      </p>

      <h2>Frågor om dina personuppgifter</h2>
      <p>
        Vill du ha ett registerutdrag, få uppgifter rättade eller raderade, mejla oss. Mer om dina
        rättigheter står i <Link to="/integritet">integritetspolicyn</Link>.
      </p>

      <h2>Myndigheter och kontaktpunkt</h2>
      <p>
        E-postadressen ovan är vår kontaktpunkt för användare och för myndigheter i EU enligt
        förordningen om digitala tjänster (DSA, artikel 11 och 12). Vi svarar på svenska och
        engelska. Brev skickar du till {operatorWithOrgText}, {addressText}.
      </p>

      <p>
        Läs även <Link to="/villkor">användarvillkoren</Link> och{" "}
        <Link to="/integritet">integritetspolicyn</Link>.
      </p>
    </LegalPage>
  );
}
