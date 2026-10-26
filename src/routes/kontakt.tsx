import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";
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
    <LegalPage title="Kontakt">
      <p>
        Hyrkoll drivs av {operatorText}. E-post:{" "}
        {SITE.contactEmail ? (
          <a href={`mailto:${SITE.contactEmail}`} className="text-primary underline">
            {SITE.contactEmail}
          </a>
        ) : (
          contactText
        )}
        .
      </p>

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
        <Link to="/villkor" className="text-primary underline">
          användarvillkoren
        </Link>{" "}
        och{" "}
        <Link to="/integritet" className="text-primary underline">
          integritetspolicyn
        </Link>
        .
      </p>
    </LegalPage>
  );
}
