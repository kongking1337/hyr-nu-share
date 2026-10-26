import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";
import { contactText, operatorText } from "@/lib/site";

export const Route = createFileRoute("/integritet")({
  head: () => ({
    meta: [
      { title: "Integritetspolicy – Hyrkoll" },
      {
        name: "description",
        content: "Vilka personuppgifter Hyrkoll behandlar, varför, och vilka rättigheter du har.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage title="Integritetspolicy">
      <h2>Vem ansvarar för dina uppgifter?</h2>
      <p>
        Personuppgiftsansvarig är {operatorText}. Du når oss på {contactText}.
      </p>

      <h2>Vilka uppgifter vi behandlar</h2>
      <ul>
        <li>
          Konto: e-postadress, lösenord (lagras krypterat, vi kan inte se det), namn, ort och
          kontotyp.
        </li>
        <li>
          Annonser: rubrik, beskrivning, pris, kategori, kommun och område samt bilder.
          Platsinformation (GPS) tas bort ur bilderna innan de laddas upp.
        </li>
        <li>Meddelanden mellan dig och andra användare.</li>
        <li>Anmälningar du gör, och anmälningar som gäller dig eller dina annonser.</li>
        <li>Favoriter och sparade sökningar.</li>
        <li>
          Tekniska uppgifter som IP-adress och tidpunkt i serverloggar, för säkerhet och felsökning.
        </li>
      </ul>

      <h2>Varför vi behandlar dem</h2>
      <ul>
        <li>
          För att tillhandahålla tjänsten enligt användarvillkoren: konto, annonser och meddelanden
          (avtal).
        </li>
        <li>
          För att skydda användare och sajten mot bedrägerier, spam och missbruk, och för att
          hantera anmälningar (berättigat intresse).
        </li>
        <li>
          För att följa lagar, till exempel om en myndighet begär uppgifter (rättslig förpliktelse).
        </li>
      </ul>

      <h2>Vem ser vad</h2>
      <ul>
        <li>
          Annonser är offentliga. Där visas ditt förnamn och första bokstaven i efternamnet, eller
          företagsnamnet.
        </li>
        <li>Din e-postadress och ditt telefonnummer visas aldrig för andra användare.</li>
        <li>
          Meddelanden ser bara du och den du skriver med. Våra moderatorer kan läsa en konversation
          först när någon i den har anmält den.
        </li>
      </ul>

      <h2>Leverantörer som hanterar uppgifter åt oss</h2>
      <ul>
        <li>Supabase: databas, inloggning och bilder. Uppgifterna lagras inom EU (Stockholm).</li>
        <li>Cloudflare: driften av webbplatsen och skydd mot attacker och robotar.</li>
        <li>E-postleverantör för att skicka bekräftelser, lösenordslänkar och aviseringar.</li>
        <li>
          Exempelannonserna visar bilder från Unsplash, vilket gör att din webbläsare hämtar bilder
          därifrån.
        </li>
      </ul>

      <h2>Hur länge vi sparar uppgifterna</h2>
      <p>
        Så länge du har kvar ditt konto. När du raderar kontot tas din profil, dina annonser och
        bilder, favoriter, sparade sökningar och konversationer bort. Anmälningar du gjort sparas
        utan koppling till dig. Serverloggar sparas en kort tid.
      </p>

      <h2>Cookies och lagring i webbläsaren</h2>
      <p>
        Vi använder inga spårnings- eller reklamcookies. I din webbläsare sparas det som behövs för
        att sajten ska fungera: att du är inloggad, om du valt mörkt läge och dina senaste
        sökningar.
      </p>

      <h2>Dina rättigheter</h2>
      <p>
        Du har rätt att få veta vilka uppgifter vi har om dig, få fel rättade, få uppgifter raderade
        (du kan radera ditt konto själv under Mitt konto), invända mot behandling och få ut dina
        uppgifter. Hör av dig till {contactText}. Du kan också klaga hos
        Integritetsskyddsmyndigheten (IMY).
      </p>

      <p>
        Se även{" "}
        <Link to="/villkor" className="text-primary underline">
          användarvillkoren
        </Link>
        .
      </p>
    </LegalPage>
  );
}
