import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";
import { addressText, contactText, operatorWithOrgText } from "@/lib/site";

export const Route = createFileRoute("/villkor")({
  head: () => ({
    meta: [
      { title: "Användarvillkor – Hyrkoll" },
      {
        name: "description",
        content:
          "Villkor för att använda Hyrkoll: konto, annonser, bokningar, förbjudna saker, moderering, anmälan och överklagande.",
      },
    ],
  }),
  component: TermsPage,
});

const SECTIONS = [
  { id: "om-hyrkoll", title: "Om Hyrkoll och vem som driver tjänsten" },
  { id: "avtalet", title: "Avtalet med oss" },
  { id: "konto", title: "Ditt konto" },
  { id: "privat-eller-foretag", title: "Privatpersoner och företag" },
  { id: "annonser", title: "Annonser" },
  { id: "bokningar", title: "Bokningar, betalning och skador" },
  { id: "forbjudet", title: "Förbjudet att annonsera" },
  { id: "uppforande", title: "Så här beter du dig" },
  { id: "omdomen", title: "Omdömen" },
  { id: "sokresultat", title: "Hur sökresultaten sorteras" },
  { id: "innehall", title: "Ditt innehåll och våra rättigheter" },
  { id: "moderering", title: "Moderering" },
  { id: "anmalan", title: "Anmäla olagligt innehåll" },
  { id: "overklaga", title: "Överklaga ett beslut" },
  { id: "avsluta", title: "Avsluta kontot, spärr och uppsägning" },
  { id: "ansvar", title: "Ansvar" },
  { id: "personuppgifter", title: "Personuppgifter" },
  { id: "andringar", title: "Ändringar av villkoren" },
  { id: "lag-och-tvister", title: "Tillämplig lag och tvister" },
  { id: "kontakt", title: "Kontakt och kontaktpunkt" },
];

function Heading({ id }: { id: string }) {
  const i = SECTIONS.findIndex((s) => s.id === id);
  return (
    <h2 id={id}>
      {i + 1}. {SECTIONS[i]!.title}
    </h2>
  );
}

function TermsPage() {
  return (
    <LegalPage
      title="Användarvillkor"
      sections={SECTIONS}
      intro={
        <p>
          Här står vad som gäller när du använder Hyrkoll. Läs dem innan du skapar ett konto. Har du
          frågor är du välkommen att höra av dig till {contactText}.
        </p>
      }
    >
      <Heading id="om-hyrkoll" />
      <p>
        Hyrkoll är en annonsplats där privatpersoner och företag i Stockholms län kan hyra ut saker
        till varandra, boka och skicka meddelanden. Hyrkoll drivs av {operatorWithOrgText}, med
        postadress {addressText} och e-post {contactText} (i villkoren kallat "vi").
      </p>
      <p>
        Hyrkoll är en förmedlingstjänst. Hyresavtalet ingås direkt mellan den som hyr ut
        ("uthyraren") och den som hyr ("hyraren"). Vi är inte part i det, äger inte sakerna,
        förmedlar inga betalningar och tar inga avgifter.
      </p>

      <Heading id="avtalet" />
      <ul>
        <li>
          När du skapar ett konto och godkänner villkoren ingår du ett avtal med oss om att använda
          Hyrkoll. Avtalet gäller tills du eller vi avslutar det (se avsnitt 15).
        </li>
        <li>
          Det är gratis att använda Hyrkoll. Börjar vi ta betalt för något får du veta det i förväg
          och måste godkänna det innan du debiteras.
        </li>
        <li>
          Du kan titta på annonser utan konto. För att annonsera, boka, skicka meddelanden, skriva
          omdömen eller anmäla via knappen Anmäl behöver du ett konto.
        </li>
        <li>Villkoren och tjänsten finns på svenska.</li>
      </ul>

      <h3>Ångerrätt</h3>
      <p>
        Avtalet med oss är gratis, så du har inget att ångra ekonomiskt. Vill du inte längre ha kvar
        kontot kan du radera det när som helst, utan kostnad och utan uppsägningstid.
      </p>

      <Heading id="konto" />
      <ul>
        <li>Du måste vara minst 18 år för att skapa ett konto.</li>
        <li>
          Uppgifterna du lämnar ska vara riktiga och hållas uppdaterade. Varje person eller företag
          får ha ett konto. Ett konto är personligt och får inte lånas ut, säljas eller överlåtas.
        </li>
        <li>
          Du ansvarar för det som görs från ditt konto. Håll ditt lösenord hemligt och säg till oss
          direkt om du tror att någon annan har kommit åt kontot.
        </li>
        <li>
          Ett företagskonto får bara skapas av någon som har rätt att företräda företaget. Den
          personen ansvarar för att företaget följer villkoren.
        </li>
      </ul>

      <Heading id="privat-eller-foretag" />
      <p>
        När du skapar konto väljer du om du är privatperson eller företag. Hyr du ut saker som en
        del av en näringsverksamhet ska du välja företag. På varje annons och profil står det om
        uthyraren är "Privatperson" eller "Företag". Det bygger på vad uthyraren själv har uppgett;
        vi kontrollerar det inte.
      </p>
      <h3>Hyr du av en privatperson</h3>
      <p>
        Konsumentskyddslagarna, till exempel distansavtalslagen med dess ångerrätt och
        avtalsvillkorslagen, gäller inte när du hyr av en privatperson. Då gäller det ni kommer
        överens om och allmänna civilrättsliga regler. Läs annonsen och hyresvillkoren noga och
        fråga om något är oklart.
      </p>
      <h3>Hyr du ut som företag</h3>
      <ul>
        <li>
          Du ansvarar för att följa de lagar som gäller för näringsidkare, bland annat
          marknadsföringslagen, prisinformationslagen, distansavtalslagen och annan
          konsumentlagstiftning.
        </li>
        <li>
          Priser i dina annonser ska vara totalpriser som konsumenter betalar, inklusive moms och
          alla avgifter.
        </li>
        <li>
          Du ska ge den som hyr de uppgifter lagen kräver: bland annat företagets namn,
          organisationsnummer, adress och kontaktuppgifter, och information om ångerrätt och
          reklamation när den gäller. Det kan du göra i annonsen, i hyresvillkoren eller i
          meddelanden.
        </li>
        <li>
          Du, inte Hyrkoll, ansvarar mot hyraren för saken, dess skick och säkerhet och för att
          avtalet fullgörs.
        </li>
        <li>
          För företag gäller också vad som står om uppsägning och ändringar i avsnitt 15 och 18, som
          följer EU:s förordning om onlineplattformar för företagsanvändare (2019/1150).
        </li>
      </ul>
      <h3>Hur ansvaret är fördelat</h3>
      <p>
        Vi ansvarar för att tillhandahålla annonsplatsen enligt dessa villkor. Uthyraren ansvarar
        för annonsen, för saken och för att den är säker och fungerar. Hyraren ansvarar för saken
        under hyrestiden. Hyresavtalet, betalningen och eventuella tvister om det gäller mellan er
        två.
      </p>

      <Heading id="annonser" />
      <ul>
        <li>
          Du ansvarar för innehållet i dina annonser. Beskriv saken ärligt, med pris, skick och
          eventuella fel eller brister.
        </li>
        <li>Använd egna bilder, eller bilder som du har rätt att använda.</li>
        <li>
          En annons ska gälla en sak (eller ett paket) som du faktiskt har och har rätt att hyra ut.
          Hyr du själv saken, eller ägs den av någon annan, behöver du ägarens tillstånd.
        </li>
        <li>
          Saker som kräver behörighet, utbildning eller körkort för att användas ska beskrivas så,
          och du ska förvissa dig om att den som hyr har det som krävs.
        </li>
        <li>Välj rätt kategori och lägg inte upp samma annons flera gånger.</li>
        <li>Pausa eller ta bort annonsen när saken inte längre går att hyra.</li>
        <li>
          Annonser märkta "Exempelannons" har vi lagt upp för att visa hur sajten fungerar. De går
          inte att boka.
        </li>
        <li>
          Inkomster från uthyrning kan vara skattepliktiga. Det är ditt ansvar att deklarera dem;
          läs mer hos Skatteverket.
        </li>
      </ul>

      <Heading id="bokningar" />
      <ul>
        <li>
          En bokning gäller först när uthyraren har godkänt förfrågan. Då är dagarna bokade för
          hyraren och ett hyresavtal har ingåtts mellan er.
        </li>
        <li>
          Hyresavtalet under Bokningar sammanfattar vad ni har kommit överens om: sak, datum, pris
          och uthyrarens villkor. Det gäller mellan er två.
        </li>
        <li>
          Hyra och eventuell deposition betalar ni direkt till varandra. Hyrkoll tar inte emot,
          håller eller förmedlar några pengar.
        </li>
        <li>
          Följ uthyrarens villkor för upphämtning, användning och avbokning, och avboka i god tid om
          du inte kan komma.
        </li>
        <li>
          Hyraren ansvarar för saken under hyrestiden, ska använda den varsamt och enligt
          instruktionerna och lämna tillbaka den i tid och i samma skick, bortsett från normalt
          slitage.
        </li>
        <li>
          Fota skicket vid utlämning och återlämning med funktionen för skickbilder. Bilderna kan
          inte tas bort under hyran och 14 dagar efter den, så att de finns kvar om ni blir oense.
        </li>
        <li>
          Hyrkoll har ingen försäkring för saker som hyrs ut. Kontrollera själv vad din hem- eller
          företagsförsäkring täcker.
        </li>
        <li>
          Blir ni oense försök först lösa det tillsammans. Hyrkoll är inte part i hyresavtalet och
          kan inte avgöra tvister mellan er, men du kan anmäla en användare som bryter mot
          villkoren.
        </li>
      </ul>
      <p>
        Tips: träffas på en offentlig plats, titta på saken innan du betalar och betala aldrig i
        förskott till någon du inte känner. Var misstänksam mot den som vill flytta kontakten till
        andra appar eller skickar länkar till betalsidor.
      </p>

      <Heading id="forbjudet" />
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
        <li>Bostäder och lokaler (Hyrkoll är för saker).</li>
        <li>
          Återkallade, farliga eller osäkra produkter, och annat som är olagligt att hyra ut i
          Sverige.
        </li>
        <li>
          Annonser som bara syftar till att samla in kontaktuppgifter eller locka till andra
          webbplatser.
        </li>
      </ul>

      <Heading id="uppforande" />
      <ul>
        <li>
          Inga bedrägerier, falska annonser eller försök att få någon att betala i förskott för
          något som inte finns.
        </li>
        <li>
          Inga trakasserier, hot, hets mot folkgrupp eller annat kränkande innehåll. Ingen spam
          eller massutskick.
        </li>
        <li>Använd meddelandefunktionen för affären som annonsen gäller, inte för reklam.</li>
        <li>
          Använd inte robotar, skript eller liknande för att hämta innehåll, skapa konton eller
          skicka meddelanden, och försök inte kringgå sajtens säkerhet eller begränsningar.
        </li>
        <li>
          Du kan blockera en användare. Då kan ni inte skicka meddelanden eller
          bokningsförfrågningar till varandra.
        </li>
      </ul>

      <Heading id="omdomen" />
      <ul>
        <li>
          Bara den som har hyrt eller hyrt ut något genom Hyrkoll kan skriva ett omdöme, och bara om
          den andra personen efter en avslutad hyra. Så vet du att omdömen kommer från någon som
          faktiskt har hyrt.
        </li>
        <li>
          Båda skriver om varandra. Ett omdöme visas när ni båda har skrivit, eller när 14 dagar har
          gått, så att ingen påverkas av den andras omdöme.
        </li>
        <li>
          Omdömen ska vara ärliga och handla om hyran. Inga personangrepp, inga påhittade omdömen
          och inga omdömen i utbyte mot betalning eller förmåner.
        </li>
        <li>
          Vi betalar inte för omdömen och tar inte bort omdömen för att de är negativa. Vi tar bort
          omdömen som bryter mot villkoren eller mot lag. Anser du att ett omdöme är falskt kan du
          anmäla det.
        </li>
      </ul>

      <Heading id="sokresultat" />
      <p>
        I sökningen väljer du själv sortering: lägst eller högst pris, närmast eller nyast.
        Standardsorteringen "Rekommenderat" visar först riktiga annonser före exempelannonser, sedan
        annonser närmast platsen du har valt och sist de nyaste. Det går inte att betala för en
        bättre placering, och företag och privatpersoner sorteras på samma sätt.
      </p>

      <Heading id="innehall" />
      <ul>
        <li>
          Du behåller rättigheterna till texter och bilder du lägger upp. Du ger oss en gratis,
          icke-exklusiv rätt att visa, lagra och anpassa innehållet (till exempel beskära bilder och
          ta bort platsinformation ur dem) så länge det behövs för att driva Hyrkoll.
        </li>
        <li>
          Rätten upphör när du tar bort innehållet eller ditt konto, med undantag för omdömen du har
          skrivit om andra och det vi måste spara enligt lag.
        </li>
        <li>
          Hyrkolls namn, utseende, texter och kod tillhör oss. Du får inte kopiera eller samla in
          innehåll från sajten i stor skala utan vårt tillstånd.
        </li>
      </ul>

      <Heading id="moderering" />
      <p>
        Vi granskar inte annonser eller meddelanden i förväg. Vi agerar när vi får en anmälan eller
        själva upptäcker något som bryter mot villkoren eller mot lag.
      </p>
      <ul>
        <li>
          Anmälningar granskas av en människa. Vi använder inga algoritmer för att bedöma innehåll.
        </li>
        <li>
          Automatiska spärrar begränsar hur mycket som kan läggas upp på kort tid, för att stoppa
          spam: till exempel högst 20 nya annonser per dag och 50 aktiva annonser, och ett begränsat
          antal nya konversationer, meddelanden och anmälningar per timme eller dag. Texter har en
          längsta längd. En automatisk spärr tar inte bort något du redan har lagt upp.
        </li>
        <li>
          Det vi kan göra är att dölja eller ta bort annonser, ta bort omdömen, och tillfälligt
          eller permanent spärra konton. Ett spärrat konto kan inte lägga upp annonser eller skicka
          meddelanden.
        </li>
        <li>
          När vi döljer en annons ser du skälet under Mina annonser. Spärrar vi ditt konto eller tar
          bort ett omdöme får du skälet via e-post. Vi talar om vad beslutet gäller, varför, vilken
          regel eller lag det bygger på och hur du kan överklaga.
        </li>
        <li>Moderatorer kan läsa en konversation först när någon i den har anmält den.</li>
        <li>
          Misstänker vi brott som hotar någons liv eller säkerhet underrättar vi polisen. Vi lämnar
          också ut uppgifter till myndigheter när vi är skyldiga enligt lag.
        </li>
        <li>
          Vi spärrar konton som upprepade gånger lägger upp uppenbart olagligt innehåll, och kan
          sluta behandla anmälningar från den som upprepade gånger gör uppenbart ogrundade
          anmälningar. Innan dess varnar vi.
        </li>
      </ul>

      <Heading id="anmalan" />
      <p>
        Alla, även den som inte har ett konto, kan anmäla innehåll som de anser är olagligt eller
        bryter mot villkoren.
      </p>
      <ul>
        <li>
          Med konto: använd knappen Anmäl på annonsen, profilen eller i konversationen och välj
          skäl.
        </li>
        <li>
          Utan konto, eller om knappen inte räcker: mejla {contactText}. Skriv med länken till
          innehållet, varför du anser att det är olagligt eller bryter mot villkoren, ditt namn och
          din e-postadress, och att du lämnar uppgifterna i god tro. (Gäller det sexuella övergrepp
          mot barn behöver du inte uppge namn.)
        </li>
      </ul>
      <p>
        Vi bekräftar att vi har fått anmälan, går igenom den skyndsamt och opartiskt och meddelar
        dig vad vi har beslutat.
      </p>

      <Heading id="overklaga" />
      <p>
        Tycker du att ett beslut är fel, till exempel att vi har dolt din annons, spärrat ditt konto
        eller inte åtgärdat något du har anmält, kan du överklaga inom sex månader genom att mejla{" "}
        {contactText}. Skriv vilket beslut det gäller och varför du tycker att det är fel. Någon som
        inte fattade det första beslutet tittar på det igen, och du får ett motiverat svar. Har vi
        gjort fel ändrar vi beslutet.
      </p>
      <p>
        Du kan också vända dig till ett tvistlösningsorgan som är certifierat enligt EU:s förordning
        om digitala tjänster (DSA), klaga hos Post- och telestyrelsen (PTS), som är
        tillsynsmyndighet för DSA i Sverige, eller gå till domstol.
      </p>

      <Heading id="avsluta" />
      <ul>
        <li>
          Du kan när som helst radera ditt konto under Mitt konto. Vad som händer med dina uppgifter
          står i <Link to="/integritet">integritetspolicyn</Link>. Kontot kan raderas först 14 dagar
          efter din senaste avslutade hyra (60 dagar om saken inte är markerad som återlämnad), så
          att den du hyrde med har kvar avtalet och skickbilderna.
        </li>
        <li>
          Bryter du mot villkoren eller mot lag kan vi spärra kontot helt eller delvis, tillfälligt
          eller permanent. Hur allvarligt och hur ofta det har skett påverkar vilken åtgärd vi
          väljer. Du får alltid veta skälet och kan överklaga (avsnitt 14).
        </li>
        <li>
          Vi kan också säga upp avtalet utan särskilt skäl, eller lägga ner Hyrkoll, med minst 30
          dagars varsel via e-post.
        </li>
        <li>
          För företag gäller: vi säger upp avtalet med minst 30 dagars varsel och anger skälet, utom
          när vi enligt lag måste avsluta det direkt, eller vid allvarliga eller upprepade brott mot
          villkoren. Spärrar eller begränsar vi ett företagskonto får företaget skälet senast när
          åtgärden genomförs.
        </li>
      </ul>

      <Heading id="ansvar" />
      <ul>
        <li>
          Vi kontrollerar inte saker, användare eller betalningar och ansvarar inte för hyresavtal,
          skador, förluster eller tvister mellan användare, eller för vad användare skriver.
        </li>
        <li>
          Vi gör vårt bästa för att sajten ska fungera och vara säker, men kan inte lova att den
          alltid är tillgänglig eller felfri. Vi kan ändra, pausa eller ta bort funktioner.
        </li>
        <li>
          Vi ansvarar inte för indirekta skador, till exempel utebliven inkomst. Begränsningarna
          gäller inte om vi har orsakat skadan med uppsåt eller grov vårdslöshet, och inskränker
          inte de rättigheter du har som konsument enligt tvingande lag.
        </li>
        <li>
          Vi ansvarar inte för förseningar eller fel som beror på något utanför vår kontroll, till
          exempel avbrott hos leverantörer, myndighetsbeslut eller strejk.
        </li>
      </ul>

      <Heading id="personuppgifter" />
      <p>
        Hur vi behandlar personuppgifter, och vilka rättigheter du har, står i{" "}
        <Link to="/integritet">integritetspolicyn</Link>.
      </p>

      <Heading id="andringar" />
      <p>
        Vi kan ändra villkoren, till exempel när vi lägger till funktioner eller lagen ändras.
        Ändringar som påverkar dig meddelar vi på sajten och via e-post minst 30 dagar innan de
        börjar gälla, så att du hinner läsa dem. Kortare tid kan gälla om en ändring krävs enligt
        lag eller behövs för att skydda användare mot bedrägerier eller säkerhetsrisker. Godkänner
        du inte de nya villkoren kan du radera ditt konto innan de börjar gälla. Fortsätter du
        använda Hyrkoll efter det gäller de nya villkoren.
      </p>

      <Heading id="lag-och-tvister" />
      <ul>
        <li>
          Svensk lag gäller för villkoren. Är du konsument och bor i ett annat EU-land behåller du
          det skydd som tvingande lag i ditt land ger.
        </li>
        <li>
          Hör av dig till oss först om du är missnöjd, så försöker vi lösa det. Går det inte avgörs
          tvister av allmän domstol i Sverige.
        </li>
        <li>
          Är du konsument kan du också vända dig till Allmänna reklamationsnämnden (ARN), Box 174,
          101 23 Stockholm, <a href="https://www.arn.se">arn.se</a>.
        </li>
        <li>
          Tvister mellan användare om ett hyresavtal löser ni mellan er. Hyr du som konsument av ett
          företag kan du vända dig till ARN, och Konsumentverkets{" "}
          <a href="https://www.hallakonsument.se">Hallå konsument</a> ger råd.
        </li>
      </ul>

      <Heading id="kontakt" />
      <p>
        Frågor om villkoren, anmälningar och överklaganden: {contactText}. Post:{" "}
        {operatorWithOrgText}, {addressText}.
      </p>
      <p>
        E-postadressen är också vår kontaktpunkt för användare och myndigheter enligt EU:s
        förordning om digitala tjänster (artikel 11 och 12). Du kan skriva till oss på svenska eller
        engelska. Se även <Link to="/kontakt">kontaktsidan</Link>.
      </p>
    </LegalPage>
  );
}
