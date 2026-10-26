import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";
import { contactText, operatorText } from "@/lib/site";

export const Route = createFileRoute("/villkor")({
  head: () => ({
    meta: [
      { title: "Användarvillkor – Hyrkoll" },
      {
        name: "description",
        content:
          "Villkor för att använda Hyrkoll, inklusive förbjudna varor och hur moderering går till.",
      },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage title="Användarvillkor">
      <h2>1. Om Hyrkoll</h2>
      <p>
        Hyrkoll är en annonsplats där privatpersoner och företag i Stockholms län kan sälja och hyra
        ut saker och kontakta varandra. Hyrkoll drivs av {operatorText}. Hyrkoll är inte part i
        affärer mellan användare, förmedlar inga betalningar och tar inga avgifter.
      </p>

      <h2>2. Ditt konto</h2>
      <ul>
        <li>Du måste vara minst 18 år för att skapa ett konto.</li>
        <li>
          Uppgifterna du lämnar ska vara riktiga. Ett konto är personligt och får inte lånas ut.
        </li>
        <li>Du ansvarar för det som görs från ditt konto. Håll ditt lösenord hemligt.</li>
        <li>Du kan när som helst radera ditt konto under Mitt konto.</li>
      </ul>

      <h2>3. Annonser</h2>
      <ul>
        <li>
          Du ansvarar för innehållet i dina annonser. Beskriv saken ärligt, med pris och skick.
        </li>
        <li>Använd egna bilder, eller bilder som du har rätt att använda.</li>
        <li>
          En annons ska gälla en sak (eller ett paket) som du faktiskt har och får sälja eller hyra
          ut.
        </li>
        <li>Välj rätt kategori och lägg inte upp samma annons flera gånger.</li>
        <li>Markera annonsen som såld eller ta bort den när den inte längre är aktuell.</li>
      </ul>

      <h2>4. Förbjudet att annonsera</h2>
      <ul>
        <li>Vapen, ammunition, vapendelar och sprängämnen, inklusive fyrverkerier.</li>
        <li>Narkotika, läkemedel, dopningsmedel, alkohol, tobak och nikotinprodukter.</li>
        <li>Levande djur.</li>
        <li>
          Stöldgods, förfalskningar, piratkopior och varor som gör intrång i någon annans
          rättigheter.
        </li>
        <li>Personuppgifter, konton, legitimationer och värdehandlingar.</li>
        <li>Pengar, värdepapper, kryptovalutor, lotter och spel om pengar.</li>
        <li>Sexuella tjänster eller pornografiskt material.</li>
        <li>
          Återkallade eller farliga produkter, och annat som är olagligt att sälja eller hyra ut i
          Sverige.
        </li>
        <li>
          Annonser som bara syftar till att samla in kontaktuppgifter eller locka till andra
          webbplatser.
        </li>
      </ul>

      <h2>5. Så här beter du dig</h2>
      <ul>
        <li>
          Inga bedrägerier, falska annonser eller försök att få någon att betala i förskott för
          något som inte finns.
        </li>
        <li>Inga trakasserier, hot eller kränkande meddelanden. Ingen spam eller massutskick.</li>
        <li>Använd meddelandefunktionen för affären som annonsen gäller, inte för reklam.</li>
      </ul>
      <p>
        Tips: träffas på en offentlig plats, titta på saken innan du betalar och betala aldrig i
        förskott till någon du inte känner.
      </p>

      <h2>6. Anmälan och moderering</h2>
      <p>
        Med knappen Anmäl kan du anmäla annonser och konversationer som bryter mot villkoren eller
        mot lag. Vi går igenom anmälningar och kan dölja annonser och spärra konton. När en annons
        döljs ser annonsören skälet under Mina annonser. Tycker du att ett beslut är fel kan du höra
        av dig till {contactText}, så tittar vi på det igen.
      </p>

      <h2>7. Ansvar</h2>
      <p>
        Hyrkoll tillhandahålls i befintligt skick. Vi kontrollerar inte saker, personer eller
        betalningar och ansvarar inte för affärer, skador eller förluster mellan användare. Vi gör
        vårt bästa för att sajten ska fungera men kan inte lova att den alltid är tillgänglig.
      </p>

      <h2>8. Personuppgifter</h2>
      <p>
        Hur vi hanterar personuppgifter står i{" "}
        <Link to="/integritet" className="text-primary underline">
          integritetspolicyn
        </Link>
        .
      </p>

      <h2>9. Ändringar</h2>
      <p>
        Vi kan ändra villkoren. Större ändringar meddelar vi på sajten innan de gäller. Fortsätter
        du använda Hyrkoll efter det gäller de nya villkoren.
      </p>

      <h2>10. Kontakt</h2>
      <p>
        Frågor om villkoren: {contactText}. Se även{" "}
        <Link to="/kontakt" className="text-primary underline">
          kontaktsidan
        </Link>
        .
      </p>
    </LegalPage>
  );
}
