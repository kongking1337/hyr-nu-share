# Swedish Share & Rent

Skapa en komplett MVP för en modern, originell svensk marknadsplats och jämförelsesökmotor för uthyrning av fysiska saker mellan privatpersoner och företag. Kärnflöde: sökning → jämförelse → lägsta totalpris → bokning. Använd ett eget varumärke och visuellt uttryck, utan att kopiera Hygglo. Prioritera mobil-först, minimalistisk svensk tech-känsla, mycket whitespace, rundade produktkort, stora bilder, tydlig typografi samt light/dark mode.

Använd Supabase för autentisering och beständig data. Bygg en praktiskt fungerande MVP med:
- Startsida: stor naturligt språk-baserad sökruta “Vad vill du hyra?”, plats/Nära mig, populära kategorier och rekommendationer.
- Sök/resultat: kombinera egna annonser med externa mock-provider-resultat. Märk källa tydligt: “På [plattform]” respektive “Från extern webbplats”. Visa extern URL med knappen “Visa erbjudande”. Implementera endast mock-data för externa källor nu och skapa en modulär provider/connector-struktur med gemensamt internt resultatformat, avsett för framtida officiella API:er, feeds eller affiliate-integrationer. Ingen scraping eller kringgående av åtkomstkontroller.
- Period- och prisjämförelse: datum/period, normalisering av timme/dag/vecka/månad, grundpris, jämförbart dagspris, totalpris, avgifter, leverans, deposition och försäkring när tillgängligt. Sortera på verklig totalkostnad.
- Filter/sortering: pris, radie, privat/företag, kategori, datum/tillgänglighet, leverans/upphämtning, betyg, deposition, direktbokning, egna/externt/alla källor. Sortering billigast/dyrast/närmast/relevant/bäst betyg/populärast.
- Lista/karta-växling med mock-karta, priser, radie 5/10/25/50/100 km och “Sök i detta område”.
- Produktkort och detaljer med bild, betyg, avstånd, pris, totalpris, tillgänglighet, kontoform och källa.
- Konto/onboarding för privatperson och företag. Företagsprofil med organisationsnummer, logotyp, inventarieantal, bokningar/statistik och grund för flera administratörer.
- Flöde “+ Hyr ut”: bilder, titel, beskrivning, kategori, plats, prisperiod, deposition, tillgänglighet, leverans/upphämtning och publicering.
- Bokningar för interna annonser: kalender, tillgänglighet, totalpris, bokningsförfrågan eller direktbokning, avbokningsvillkor och status. Säkerställ att bekräftade bokningar blockerar datum.
- Meddelanden: konversationslista, text, boknings- och systemmeddelanden, bildbilaga och notifieringsyta. Skydda kontaktuppgifter i gränssnittet där lämpligt.
- Favoriter, sökbevakningar och jämförelse av flera produkter med markeringar för billigast, bäst betyg, närmast och bäst värde.
- Verifierade recensioner, profilbetyg, rapportering/blockering samt UI och datamodell för e-post/telefon/ID/företagsverifiering, bedrägerier och tvister.
- Betalningsarkitektur med tydliga Stripe Connect-integrationspunkter för serviceavgift, utbetalning, återbetalning, deposition och försäkring, men låtsas inte att betalningar är live.
- SEO-rutter och metadata för exempelvis /hyra/slapvagn, /hyra/verktyg, /hyra/kamera, /hyra/stockholm/slapvagn och /hyra/goteborg/verktyg.
- Separat adminpanel med KPI-dashboard och vyer för användare, annonser, företag, bokningar, betalningar, rapporter/tvister, recensioner, kategorier, provisioner samt externa datakällors hälsa.

Fyll produkten med realistiska svenska exempeldata så alla viktiga flöden kan provas. Bygg sökparsing för exempel som “Jag behöver en högtryckstvätt nära Solna över helgen” och “Billigaste släpvagnen inom 20 km från Göteborg på lördag” med synonymer/stavfel som MVP-logik. Var transparent i produkten om vilka externa resultat som är demo/mock och vilka integrationer som kräver avtal.

## Teknik

- **Webbplats**: TanStack Start + React, på Cloudflare Workers (Worker `hyrkoll`). Varje push till `main` på GitHub driftsätts automatiskt.
- **Databas och inloggning**: eget Supabase-projekt (EU/Stockholm). E-post/lösenord och Google-inloggning går direkt via Supabase Auth.
- `.env` innehåller bara publika värden (Supabase-URL och publishable key). Hemliga nycklar ligger i Supabase- och Cloudflare-panelerna, aldrig i git.
- Projektet byggdes ursprungligen i Lovable. Flytten finns beskriven i [`docs/migration-plan.md`](docs/migration-plan.md).

## Utveckling

Du behöver Node.js och npm ([installera med nvm](https://github.com/nvm-sh/nvm#installing-and-updating)).

```sh
git clone https://github.com/kongking1337/hyr-nu-share.git
cd hyr-nu-share
npm i
npm run dev
```

Bygg som på Cloudflare: `npm run build` (resultatet hamnar i `.output/`).
