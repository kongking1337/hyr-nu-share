import { createFileRoute, Link } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { LegalPage } from "@/components/LegalPage";
import { Button } from "@/components/ui/button";
import { SITE, contactText, operatorText } from "@/lib/site";

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
          <p>Hyrkoll drivs av {operatorText}.</p>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-muted p-5">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">E-post</p>
              <p className="break-all font-display text-xl font-bold">{SITE.contactEmail || contactText}</p>
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
        Skälet står under Mina annonser. Tycker du att beslutet är fel, mejla oss med annonsens
        rubrik och varför. Vi svarar så snart vi kan.
      </p>

      <h2>Myndigheter</h2>
      <p>Myndigheter når oss på samma e-postadress. Vi svarar på svenska och engelska.</p>

      <p>
        Läs även{" "}
        <Link to="/villkor">
          användarvillkoren
        </Link>{" "}
        och{" "}
        <Link to="/integritet">
          integritetspolicyn
        </Link>
        .
      </p>
    </LegalPage>
  );
}
