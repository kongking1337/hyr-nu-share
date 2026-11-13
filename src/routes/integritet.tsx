import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";
import { addressText, contactText, operatorWithOrgText } from "@/lib/site";

export const Route = createFileRoute("/integritet")({
  head: () => ({
    meta: [
      { title: "Integritetspolicy – Hyrkoll" },
      {
        name: "description",
        content:
          "Vilka personuppgifter Hyrkoll behandlar, varför, hur länge, vilka som får dem och vilka rättigheter du har.",
      },
    ],
  }),
  component: PrivacyPage,
});

const SECTIONS = [
  { id: "ansvarig", title: "Vem ansvarar för dina uppgifter?" },
  { id: "uppgifter", title: "Vilka uppgifter vi behandlar" },
  { id: "varifran", title: "Var uppgifterna kommer ifrån" },
  { id: "varfor", title: "Varför vi behandlar dem och med vilken rätt" },
  { id: "synlighet", title: "Vem ser vad" },
  { id: "mottagare", title: "Leverantörer och andra mottagare" },
  { id: "utanfor-eu", title: "Överföring utanför EU/EES" },
  { id: "lagring", title: "Hur länge vi sparar uppgifterna" },
  { id: "automatiska-beslut", title: "Automatiska beslut" },
  { id: "sakerhet", title: "Säkerhet" },
  { id: "cookies", title: "Cookies och lagring i webbläsaren" },
  { id: "rattigheter", title: "Dina rättigheter" },
  { id: "andringar", title: "Ändringar av policyn" },
];

function Heading({ id }: { id: string }) {
  const i = SECTIONS.findIndex((s) => s.id === id);
  return (
    <h2 id={id}>
      {i + 1}. {SECTIONS[i]!.title}
    </h2>
  );
}

function PrivacyPage() {
  return (
    <LegalPage
      title="Integritetspolicy"
      sections={SECTIONS}
      intro={
        <p>
          Här beskriver vi hur Hyrkoll behandlar dina personuppgifter enligt dataskyddsförordningen
          (GDPR), och vilka rättigheter du har.
        </p>
      }
    >
      <Heading id="ansvarig" />
      <p>
        Personuppgiftsansvarig är {operatorWithOrgText}, {addressText}. Du når oss på {contactText}.
        Vi har inget dataskyddsombud; frågor om personuppgifter skickar du till samma adress.
      </p>

      <Heading id="uppgifter" />
      <ul>
        <li>
          Konto: e-postadress, lösenord (lagras krypterat, vi kan inte se det), namn, ort, kontotyp
          (privatperson eller företag), det du skriver under "Om mig" och, om du verifierar det,
          ditt telefonnummer. Loggar du in med Google får vi ditt namn och din e-postadress från
          Google.
        </li>
        <li>
          Annonser: rubrik, beskrivning, pris, kategori, kommun och område samt bilder.
          Platsinformation (GPS) tas bort ur bilderna innan de laddas upp.
        </li>
        <li>Meddelanden mellan dig och andra användare.</li>
        <li>
          Bokningar: datum, pris, status, din hälsning, när saken hämtades och lämnades tillbaka,
          och de bilder på skicket som du eller den andra lägger till.
        </li>
        <li>
          Hyresavtal: vilka som är parter, med fullständigt namn, vad avtalet gäller och när ni
          godkände det.
        </li>
        <li>Omdömen som du skriver och som andra skriver om dig, och vilka du har blockerat.</li>
        <li>
          Anmälningar du gör, anmälningar som gäller dig eller dina annonser, och våra beslut om
          moderering (till exempel att en annons har dolts eller ett konto spärrats, och varför).
        </li>
        <li>Favoriter och sparade sökningar.</li>
        <li>
          Tekniska uppgifter: IP-adress, webbläsare, tidpunkter för inloggning och anrop i
          serverloggar, och de signaler som robotskyddet (captcha) använder.
        </li>
      </ul>
      <p>
        Vi ber inte om känsliga personuppgifter, till exempel om hälsa, religion eller politiska
        åsikter, eller om personnummer. Skriv inte sådant i annonser, "Om mig" eller meddelanden.
      </p>

      <Heading id="varifran" />
      <p>
        De flesta uppgifter lämnar du själv. Vissa kommer från andra användare: meddelanden de
        skickar till dig, omdömen om dig och anmälningar som gäller dig. Loggar du in med Google
        kommer namn och e-postadress därifrån. Tekniska uppgifter skapas när du använder sajten.
      </p>

      <Heading id="varfor" />
      <ul>
        <li>
          <strong>Tillhandahålla tjänsten</strong>: konto och inloggning, annonser, sökning,
          bokningar, hyresavtal, meddelanden, omdömen, favoriter och e-post om nya meddelanden och
          bokningar. Rättslig grund: avtal (användarvillkoren). Utan e-postadress kan du inte skapa
          ett konto.
        </li>
        <li>
          <strong>Säkerhet och skydd mot missbruk</strong>: stoppa bedrägerier, spam och robotar,
          begränsa hur mycket som kan läggas upp, hantera anmälningar och blockeringar, och ta fram
          en sammanställning per användare åt våra administratörer. Rättslig grund: berättigat
          intresse. Vårt och användarnas intresse av en trygg annonsplats väger enligt vår bedömning
          tyngre, eftersom vi bara använder uppgifter som redan finns i tjänsten och bara
          administratörer ser sammanställningen.
        </li>
        <li>
          <strong>Felsökning och drift</strong>: serverloggar för att hitta fel och hålla sajten
          igång. Rättslig grund: berättigat intresse.
        </li>
        <li>
          <strong>Följa lagar</strong>: hantera anmälningar och överklaganden enligt EU:s förordning
          om digitala tjänster, svara på myndigheters begäran och underrätta polisen om brott som
          hotar liv eller säkerhet. Rättslig grund: rättslig förpliktelse.
        </li>
        <li>
          <strong>Ta tillvara rättsliga anspråk</strong>: spara bokningar, hyresavtal och
          skickbilder en tid efter en hyra, om ni skulle bli oense. Rättslig grund: berättigat
          intresse (ditt och den andra partens).
        </li>
      </ul>
      <p>
        Vi säljer inte dina uppgifter, använder dem inte för reklam och visar ingen reklam från
        andra. Ber vi någon gång om ditt samtycke kan du när som helst ta tillbaka det.
      </p>

      <Heading id="synlighet" />
      <ul>
        <li>
          Annonser är offentliga. Där visas ditt förnamn och första bokstaven i efternamnet, eller
          företagsnamnet, och om du är privatperson eller företag.
        </li>
        <li>Din e-postadress och ditt telefonnummer visas aldrig för andra användare.</li>
        <li>
          Din profil är offentlig: namn som i annonserna, ort, "Om mig", när du blev medlem, om ditt
          telefonnummer är verifierat, antal avslutade hyror, hur snabbt du brukar svara och de
          omdömen andra har skrivit om dig.
        </li>
        <li>
          I hyresavtalet för en godkänd bokning ser ni två varandras fullständiga namn. Ingen annan
          ser avtalet.
        </li>
        <li>
          Vilka du har blockerat ser bara du. Våra administratörer ser, för att upptäcka
          bedrägerier, en sammanställning per användare av anmälningar, dolda annonser, blockeringar
          och omdömen.
        </li>
        <li>
          Meddelanden ser bara du och den du skriver med. Våra moderatorer kan läsa en konversation
          först när någon i den har anmält den.
        </li>
        <li>
          Bokningar och bilder på skicket ser bara du och den du hyr av eller till. Vilka dagar en
          sak är bokad visas för alla, men inte vem som har bokat.
        </li>
      </ul>

      <Heading id="mottagare" />
      <p>
        Leverantörerna nedan behandlar uppgifter för vår räkning (personuppgiftsbiträden) enligt
        avtal med oss, och får inte använda dem för egna syften.
      </p>
      <ul>
        <li>
          Supabase: databas, inloggning och lagring av bilder. Uppgifterna lagras inom EU
          (Stockholm).
        </li>
        <li>
          Cloudflare: driften av webbplatsen, serverloggar, skydd mot attacker och robotskyddet
          Turnstile.
        </li>
        <li>
          Vår e-postleverantör: skickar bekräftelser, lösenordslänkar och aviseringar om nya
          meddelanden och bokningar.
        </li>
        <li>SMS-leverantör: skickar koden när du verifierar ditt telefonnummer, om du gör det.</li>
      </ul>
      <p>Uppgifter kan också lämnas till:</p>
      <ul>
        <li>
          Google, om du väljer att logga in med Google. Google är då självständigt
          personuppgiftsansvarigt enligt sin egen integritetspolicy.
        </li>
        <li>
          Unsplash: exempelannonserna visar bilder därifrån, vilket gör att din webbläsare hämtar
          bilder från Unsplash och då skickar din IP-adress dit.
        </li>
        <li>
          Polis och andra myndigheter, när vi är skyldiga enligt lag eller när det behövs för att
          anmäla brott.
        </li>
        <li>
          En köpare eller ny ägare av Hyrkoll, om verksamheten säljs eller flyttas till ett företag.
          Du får veta det i förväg.
        </li>
      </ul>

      <Heading id="utanfor-eu" />
      <p>
        Vi lagrar uppgifterna inom EU. Några av leverantörerna (Cloudflare, e-post- och
        SMS-leverantören, Google och Unsplash) är amerikanska företag och kan behandla uppgifter i
        USA eller i andra länder utanför EU/EES. Överföringarna skyddas av EU-kommissionens beslut
        om ramverket för dataskydd mellan EU och USA (Data Privacy Framework) för företag som är
        anslutna till det, och annars av EU-kommissionens standardavtalsklausuler. Hör av dig om du
        vill ha en kopia av skyddsåtgärderna.
      </p>

      <Heading id="lagring" />
      <ul>
        <li>
          Konto, profil, annonser, bilder, favoriter och sparade sökningar: tills du raderar dem
          eller ditt konto.
        </li>
        <li>
          Meddelanden: tills du eller den du skriver med raderar kontot. Då försvinner hela
          konversationen för er båda.
        </li>
        <li>
          Bokningar, hyresavtal och skickbilder: tills någon av er raderar kontot. Kontot kan
          raderas först 14 dagar efter den senaste avslutade hyran (60 dagar efter hyrans slut om
          saken inte är markerad som återlämnad), så att ni båda har kvar underlaget om något
          behöver redas ut.
        </li>
        <li>
          Omdömen: omdömen om dig raderas med ditt konto. Omdömen du har skrivit om andra finns
          kvar, men med avsändaren "Raderat konto".
        </li>
        <li>
          Anmälningar och modereringsbeslut: så länge de behövs för att hantera missbruk och
          överklaganden. Anmälningar du har gjort sparas utan koppling till dig när du raderar
          kontot.
        </li>
        <li>
          Serverloggar och e-postloggar: några dagar upp till en månad, beroende på leverantör.
        </li>
        <li>Säkerhetskopior av databasen skrivs över efter en tid, normalt inom 30 dagar.</li>
      </ul>

      <Heading id="automatiska-beslut" />
      <p>
        Vi fattar inga beslut som enbart grundas på automatiserad behandling och som har rättsliga
        följder för dig eller på liknande sätt påverkar dig i betydande grad. Automatiska spärrar
        mot spam begränsar bara hur mycket som kan läggas upp på kort tid. Beslut om att dölja
        annonser eller spärra konton fattas av en människa.
      </p>

      <Heading id="sakerhet" />
      <p>
        All trafik till sajten är krypterad (HTTPS). Lösenord lagras krypterat. Regler i databasen
        gör att varje användare bara kommer åt sina egna uppgifter och det som är offentligt, och
        bara de som behöver det för att moderera har administratörsbehörighet. Skulle en
        personuppgiftsincident inträffa anmäler vi den till Integritetsskyddsmyndigheten och
        meddelar dig när lagen kräver det.
      </p>

      <Heading id="cookies" />
      <p>
        Vi använder inga spårnings-, analys- eller reklamcookies, och därför ber vi inte om samtycke
        till cookies. I din webbläsare sparas bara det som behövs för att sajten ska fungera som du
        har bett om:
      </p>
      <ul>
        <li>att du är inloggad (sparas tills du loggar ut),</li>
        <li>om du har valt mörkt eller ljust läge,</li>
        <li>dina senaste sökningar (bara i din webbläsare, du kan rensa dem i sökrutan).</li>
      </ul>
      <p>
        Cloudflare kan sätta en nödvändig säkerhetscookie för att skilja människor från robotar och
        skydda sajten mot attacker. Du kan radera det som sparats i webbläsarens inställningar; då
        loggas du ut.
      </p>

      <Heading id="rattigheter" />
      <p>Enligt dataskyddsförordningen har du rätt att:</p>
      <ul>
        <li>få veta vilka uppgifter vi har om dig och få en kopia av dem (registerutdrag),</li>
        <li>få felaktiga uppgifter rättade (det mesta kan du ändra själv under Mitt konto),</li>
        <li>
          få uppgifter raderade (du kan radera ditt konto själv under Mitt konto), utom det vi måste
          spara enligt lag,
        </li>
        <li>begära att behandlingen begränsas, till exempel medan vi utreder en invändning,</li>
        <li>
          invända mot behandling som bygger på berättigat intresse; då slutar vi om vi inte har
          tungt vägande skäl att fortsätta,
        </li>
        <li>
          få ut uppgifter du har lämnat till oss i ett maskinläsbart format (dataportabilitet).
        </li>
      </ul>
      <p>
        Hör av dig till {contactText}. Det är gratis, och vi svarar inom en månad. Vi kan behöva
        kontrollera att det är du innan vi lämnar ut något.
      </p>
      <p>
        Är du missnöjd med hur vi behandlar dina uppgifter kan du klaga hos
        Integritetsskyddsmyndigheten (IMY), Box 8114, 104 20 Stockholm,{" "}
        <a href="https://www.imy.se">imy.se</a>.
      </p>

      <Heading id="andringar" />
      <p>
        Ändrar vi policyn uppdaterar vi datumet överst. Större ändringar meddelar vi på sajten och
        via e-post innan de börjar gälla.
      </p>

      <p>
        Hyrkoll är bara för dig som är 18 år eller äldre. Se även{" "}
        <Link to="/villkor">användarvillkoren</Link>.
      </p>
    </LegalPage>
  );
}
