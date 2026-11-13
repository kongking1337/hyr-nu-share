# Prestandagranskning av Hyrkoll (2026-11-13)

Granskning och åtgärdsplan. Ingen kod på sajten är ändrad. Mätskripten finns i `scripts/perf/`
(se "Så mäter du före och efter" längst ner).

## Vad du bör åtgärda först, och varför

1. **Bilderna i rätt storlek.** Startsidan laddar 1,9 MB bilder. Alla bilder hämtas 1200 px
   breda men visas som 96–400 px rutor. Samma tio bilder i 400 px väger 228 kB i stället för
   1 923 kB (mätt). På svagt mobilnät är första kategoribilden färdig först efter 18 s. Liten
   insats, och effekten syns direkt i mätningen.
2. **Låt de publika sidorna hämta sin data på servern.** På startsidan, sök, kategori- och
   annonssidan skickas frågan till databasen först när all JavaScript (260–300 kB komprimerat)
   har laddats och körts. På mobil med 4G syns annonsen efter 5,8 s, sökresultaten efter 7,0 s,
   fast sidan börjar ritas efter 1,2–2,1 s. Det är den största tidsvinsten, och samtidigt
   försvinner layouthoppet på annonssidan. Insatsen är medelstor.
3. **Ett index-paket i databasen.** Det märks inte i dag med 24 annonser. Med 20 000 annonser
   (testat i PGlite) blir sök och startsida 100 gånger snabbare (117 ms → 1 ms). Att radera
   kontot för en flitig uthyrare tar då 76 s och slår troligen i Supabases tidsgräns. Med index
   tar det 1,7 s. Det är en migration som du kör i SQL Editor.
4. **Bygg om sökningen så att databasen söker.** Gör det innan någon kategori har runt 200
   annonser. Sökningen hämtar de 200 nyaste annonserna och filtrerar sedan i webbläsaren. Äldre
   annonser hittas alltså aldrig, och varje sökning hämtar om samma rader.

Två småsaker kan följa med punkt 1, eftersom de tar minuter att göra:

- förladda typsnitten (de gör att villkorssidorna hoppar, CLS 0,14–0,17);
- låt hämtad data vara färsk i 30–60 s (i dag hämtas startsidan om vid varje flikbyte).

## Testförhållanden

- **Byggd sajt.** `npm run build`, körd lokalt i Cloudflares egen runtime (`wrangler dev --local`)
  mot den skarpa Supabase-databasen. Den innehöll 24 publicerade annonser, alla exempelannonser.
- **Webbläsare.** Brave (Chromium) headless via Playwright. Varje körning hade en ny profil och
  tom cache. Mätvärdena är medianer av 3–5 körningar.
- **Profiler:**
  - Dator: 1366×900, ingen strypning.
  - Mobil 4G: 390×844, 150 ms latens, 9 Mbit/s, CPU 4× långsammare.
  - Mobil svagt 4G: som Lighthouse "Slow 4G", 562 ms latens, 1,44 Mbit/s, CPU 4×.
- **Felkällor.** Servern delas med andra jobb (belastning 3–6), så absoluta tider varierar
  mellan körningarna. Ordningen och storleksordningen är stabil. Latensen från testservern till
  Supabase var 0,2–0,3 s per anrop.
- **Inte mätt:**
  - Inloggade sidor. Det finns inget testkonto, och jag skapade inga konton i den skarpa
    databasen. Där har jag granskat koden och mätt databasfrågorna i PGlite.
  - Den driftsatta sajten på Cloudflare. Adressen finns inte i repot.
- **Stor datamängd.** Databasspecialisten (projektets agent) spelade upp alla migrationer i
  PGlite. Där lade den in 20 024 annonser, 2 000 användare, 19 134 bokningar, 49 976
  meddelanden med mera, och körde sidornas frågor som inloggad och utloggad användare med
  radreglerna (RLS) påslagna. PGlite är enkeltrådat, så tiderna visar förhållanden, inte exakta
  tider i Supabase.

## 1. Hur Hyrkoll fungerar

TanStack Start renderar sidorna på servern (Cloudflare Worker), men **ingen rutt har en
`loader`**. Servern skickar därför bara sidans skal med grå skelettrutor. All data hämtas i
webbläsaren med React Query, direkt mot Supabase, efter att JavaScripten har laddats och
startat. Servern anropar aldrig Supabase när den renderar sidor.

| Sidtyp                                         | Rutter                                                                                                       | Rendering                                             | Data                                                                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Startsida                                      | `/`                                                                                                          | Skal på servern, data i webbläsaren                   | 2 frågor mot `listings`: 8 senaste med alla kolumner, och upp till 1000 rader för att räkna kategorier                                      |
| Sök/kategori (samma mall, `SearchResultsPage`) | `/sok`, `/hyra/$kategori`, `/hyra/$stad/$kategori`                                                           | Som ovan                                              | `internalProvider.search`: 200 senaste med alla kolumner, text/avstånd/pris filtreras i webbläsaren; `unavailable_listings` vid datumfilter |
| Annons                                         | `/annons/$id`                                                                                                | Som ovan                                              | Annonsen, sedan `public_profile` och `booked_dates` (kalendern)                                                                             |
| Profil                                         | `/profil/$id`                                                                                                | Som ovan                                              | `public_profile`, sedan `public_reviews` och profilens annonser                                                                             |
| Statiska                                       | `/villkor`, `/integritet`, `/kontakt`, `/auth`                                                               | Helt på servern                                       | `/auth` hämtar Supabases inställningar (Google-knappen)                                                                                     |
| Inloggade                                      | `/meddelanden`, `/bokningar`, `/mina-annonser`, `/favoriter`, `/konto`, `/ny-annons`, `/avtal/$id`, `/admin` | `ssr: false`: tom sida tills JavaScripten har laddats | Meddelanden frågas om var 10:e s (tråden) och var 30:e s (listan); `my_bookings` m.fl.                                                      |
| På alla sidor                                  | Sidhuvud, flikrad                                                                                            |                                                       | Inloggad: olästa och väntande bokningar var 2:a minut (admin även anmälningar)                                                              |

**Flöden jag valde för djupare granskning:**

1. **Startsida → annons.** Det är förstaintrycket och det vanligaste klicket.
2. **Sök/kategori → filter → annons.** Det är kärnflödet, och det påverkas mest när antalet
   annonser växer.
3. **Annonssidan som landningssida.** Delade länkar och Google leder hit, oftast med tom cache
   på mobil.
4. **Meddelanden och bokningar.** De frågar om databasen hela tiden och växer med användningen.
   Här har jag bara granskat koden och databasen.

Representativa exempel:

- en annons med 1 bild och en med 2 (fler har ingen annons i dag);
- kategorin Verktyg (4 annonser) mot hela sökningen (24);
- "mycket innehåll" simulerades med 20 000 annonser i PGlite.

## 2. Mätresultat

### Första besöket, tom cache

Tider i sekunder från klick på länken. "Data" är när frågan till Supabase skickas och när
svaret är klart. "Innehåll" är första riktiga innehållet, inte skelettet.

| Profil   | Sida            | Första ritning | JS klar | Data        | Innehåll syns | Första bild | LCP   | CLS       |
| -------- | --------------- | -------------- | ------- | ----------- | ------------- | ----------- | ----- | --------- |
| Dator    | `/`             | 0,76           | 1,43    | 1,57–1,86   | 1,98          | 2,65        | 0,76¹ | 0,013     |
| Dator    | `/sok`          | 0,70           | 2,68    | 3,17–3,56   | 3,79          | 4,10        | 4,52  | 0,045     |
| Dator    | `/hyra/verktyg` | 0,71           | 1,94    | 2,21–2,59   | 2,67          | 2,98        | 3,04  | 0,048     |
| Dator    | `/annons/…`     | 1,24           | 1,92    | 2,09–2,38   | 2,57          | 2,84        | 2,96  | 0         |
| Mobil 4G | `/`             | 1,34           | 2,80    | 3,96–4,34   | 4,41          | 5,99        | 2,88¹ | 0         |
| Mobil 4G | `/sok`          | 2,08           | 4,55    | 6,11–6,62   | 7,03          | 8,15        | 8,29  | 0         |
| Mobil 4G | `/hyra/verktyg` | 1,17           | 3,71    | 4,79–5,11   | 5,31          | 6,23        | 6,85  | 0         |
| Mobil 4G | `/annons/…`     | 1,59           | 4,01    | 5,14–5,45   | 5,76          | 6,55        | 7,06  | **0,128** |
| Svagt 4G | `/`             | 2,41           | 7,39    | 8,24–9,32   | 9,87          | 18,16       | 2,66¹ | **0,15**² |
| Svagt 4G | `/sok`          | 2,89           | 9,19    | 11,13–11,85 | 12,37         | 19,61       | 19,75 | 0         |
| Svagt 4G | `/hyra/verktyg` | 3,24           | 9,46    | 11,14–11,81 | 12,10         | 14,82       | 14,88 | 0         |
| Svagt 4G | `/annons/…`     | 2,86           | 9,03    | 9,26–10,01  | 10,14         | 13,65       | 13,85 | **0,128** |

¹ På startsidan räknar webbläsaren rubriken som största element, så LCP ser bra ut. Annonserna
under "Senast upplagt" syns ändå först vid "Innehåll syns".
² I 2 av 3 körningar.

**Mönstret är detsamma på alla sidor med data:** frågan till databasen skickas först efter att
JavaScripten är klar, och bilderna börjar laddas först efter svaret. Den spärrade CPU:n spelar
också in. Total Blocking Time var 1,1–2,8 s på mobil 4G. När startsidan laddades på mobilen gick
2,2 s CPU-tid till att tolka och köra JavaScript.

### Vikt per sida

Dator, tom cache, överförda kB.

| Sida                   | Anrop | JS  | CSS | Typsnitt | Bilder    | Totalt |
| ---------------------- | ----- | --- | --- | -------- | --------- | ------ |
| `/`                    | 59    | 263 | 19  | 70       | **1 926** | 2 290  |
| `/sok`                 | 73    | 290 | 19  | 70       | **1 926** | 2 318  |
| `/hyra/verktyg`        | 65    | 291 | 19  | 70       | 469       | 858    |
| `/annons/…` (2 bilder) | 63    | 303 | 19  | 70       | 406       | 804    |
| `/annons/…` (1 bild)   | 62    | 303 | 19  | 70       | 52        | 451    |
| `/villkor`             | 37    | 258 | 19  | 70       | 0         | 359    |

De största JS-filerna:

- huvudfilen: 387 kB, 119 kB komprimerad (mest React DOM, sedan seroval, sonner, React Query,
  routern och Radix-menyn med floating-ui);
- en gemensam fil med hela supabase-js (störst är inloggningsdelen auth-js): 242 kB, 63 kB
  komprimerad. Den innehåller även Realtime, som sajten inte använder;
- kalendern: 78 kB, 22 kB komprimerad. Den laddas på varje annonssida, även exempelannonser
  där kalendern inte visas.

### Navigering när sidan redan är laddad

| Klick                            | Mobil 4G    | Dator       | När frågan skickas (mobil 4G)               |
| -------------------------------- | ----------- | ----------- | ------------------------------------------- |
| Startsida → annons               | 1,72 s      | 0,3 s       | inte loggat                                 |
| Startsida → "Visa vad som finns" | 2,95 s      | 1,2–1,9 s   | +1,93 s                                     |
| Ny sökterm + Enter på `/sok`     | 1,65 s      | 0,6–1,6 s   | +1,22 s (ingen ny kod laddas)               |
| Sökresultat → annons             | 0,73 s      | 0,7–1,0 s   | +0,21 s                                     |
| Tillbaka (webbläsarens bakåt)    | 0,36–0,74 s | 0,1–0,34 s  | från cache                                  |
| Logotypen → startsidan           | 0,52 s      | 0,28–0,49 s | visas från cache, men båda frågorna körs om |
| Startsida → kategori Verktyg     | 1,60 s      | 0,6–1,5 s   | +1,20 s                                     |

**CPU-profil med källkartor (mobil 4×, ny sökterm, 1,7 s).** Tiden fördelade sig så här:

| Del                                                  | Tid    |
| ---------------------------------------------------- | ------ |
| Webbläsarens eget arbete (stil, layout, kompilering) | 0,43 s |
| React DOM                                            | 0,41 s |
| Radix UI och andra bibliotek                         | ~0,3 s |
| Appens egen kod                                      | 0,06 s |

Ingen enskild funktion i appen är boven. Hela söksidan renderas om (kort, filterpanel, menyer)
innan frågan ens skickas. Att byta sortering kostade bara ~0,15 s JavaScript. Resten var menyns
animation och testverktygets klick.

### Layouthopp (CLS, gränsen för "bra" är 0,1)

| Sida                              | CLS           | Orsak                                                                     | Belägg                                                                             |
| --------------------------------- | ------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `/villkor`, `/integritet` (dator) | 0,14–0,17     | Typsnitten byts in efter första ritningen                                 | Med typsnitten blockerade: 0–0,001. Med typsnitten förladdade: 0 (3 körningar var) |
| `/annons/…` (mobil)               | 0,128         | Skelettet är kortare än annonsen, så sidfoten skjuts ned när datan kommer | Alla 6 mobilkörningar. Dator: 0, där sidfoten ligger utanför skärmen               |
| `/` (mobil, svagt 4G)             | 0,15 i 2 av 3 | Toppytan och "Prova:"-knapparna flyttar sig                               | **Hypotes:** samma typsnittsbyte. Test: förladda typsnitten och mät igen           |
| `/sok`, `/hyra/…` (dator)         | 0,045         | Något i filterspalten flyttar sig när sidan startar                       | Inte typsnitten (0,041 även när de blockeras). Under gränsen; låg prioritet        |

## 3. Fynd i detalj

### F1. Bilderna är 3–10 gånger för stora (startsida, sök, kategori, annons)

- **Observation (mätt):**
  - Startsidan och `/sok` laddar 1 926 kB bilder, annonssidan med 2 bilder 406 kB.
  - Exempelbilderna hämtas som `…unsplash.com/…?w=1200`. De visas som 96–128 px rader
    (`ListingRow`), ~300–400 px kort (`ListingCard`) och kategorirutor (`src/routes/index.tsx`).
  - Galleriets miniatyrer på 72 px laddar också hela bilden (`PhotoGallery.tsx`).
  - Samma tio startsidebilder med `w=400&auto=format&q=70`: **228 kB i stället för 1 923 kB**.
  - Svagt 4G: första kategoribilden klar efter 18,2 s, sökresultatens bild efter 19,6 s.
- **Orsak:**
  - `photoUrl()` i `src/lib/photos.ts` returnerar alltid originaladressen. Det finns ingen
    `srcset`/`sizes`.
  - Egna uppladdningar sparas i 1600 px (`shrinkPhoto`) och visas i samma storlek i korten.
  - Annonsens huvudbild saknar `fetchpriority="high"`.

### F2. Publika sidor visar skelett tills JavaScripten har laddats och frågan besvarats

- **Observation (mätt):** se tabellen ovan. Datan skickas alltid efter "JS klar". Varje första
  anrop till en ny adress kräver dessutom en CORS-förfrågan (OPTIONS) innan själva frågan.
  Webbläsaren sparar svaret på den i en timme per adress.
- **Annonssidan:** skelettet ger CLS 0,128 på mobil. Sidans titel är "Annons – Hyrkoll" för
  alla annonser, vilket också påverkar Google och delade länkar.
- **Orsak:**
  - Inga `loader` i `src/routes/index.tsx`, `src/routes/sok.tsx`, `src/routes/hyra.$kategori.tsx`,
    `src/routes/annons.$id.tsx` eller `src/routes/profil.$id.tsx`. Datan hämtas med `useQuery`
    i komponenterna.
  - `src/router.tsx` saknar `defaultPreload`, så inget förladdas när man pekar på eller trycker
    på en länk.
  - Profilsidan väntar på profilen innan recensioner och annonser hämtas, fast id:t redan är
    känt (`enabled: !!profile`).

### F3. Sökningen hämtar 200 rader och filtrerar i webbläsaren (sök, kategori)

Frågan i `internalProvider.search` (`src/lib/providers/internal.ts`):
`select("*") … order(published_at desc) limit(200)`. Text, avstånd och datum filtreras sedan i
webbläsaren, pris och uthyrare i `filterResults`.

- **I dag:** 24 rader, 27 kB (4,4 kB komprimerat). Inget problem ännu.
- **Med 20 000 annonser (PGlite):**
  - 385 kB JSON per sökning; bara kortens kolumner skulle vara 82 kB.
  - Sökningen ser bara de 200 nyaste, ungefär 1 % av annonserna. Äldre annonser som matchar
    hittas aldrig, och antalet träffar blir fel.
  - Utan index läses hela tabellen och sorteras (117 ms; med index 1,0 ms).
- **Onödig hämtning:** sökordet ingår i cachenyckeln (`useSearchResults.ts`) men inte i
  frågan. Varje ny sökterm hämtar därför om exakt samma 200 rader.

### F4. Startsidans kategoriräkning hämtar upp till 1000 rader för att visa 8 siffror

- **Var:** `src/routes/index.tsx`, frågan `home-categories`.
- **Med 20 000 annonser:** 1000 rader, 290 kB, och siffrorna blir fel eftersom bara de 1000
  nyaste räknas (18 091 matchar).
- **Alternativ:** en fråga som ger en rad per kategori (antal och senaste bild) svarar med 8
  rader, under 1 kB, på 17 ms med index.

### F5. Saknade index (databas)

Uppmätt i PGlite med 20 000 annonser:

| Fråga                                | Utan index | Med index |
| ------------------------------------ | ---------- | --------- |
| Sök                                  | 117 ms     | 1,0 ms    |
| Sök med kategori                     | 40 ms      | 1,0 ms    |
| Startsidans 8 senaste                | 110 ms     | 0,17 ms   |
| `unavailable_listings` (datumfilter) | 84 ms      | 5,4 ms¹   |

¹ Funktionen läser i dag alla bokningar som någonsin gjorts. Siffran gäller med ett extra
villkor `AND b.end_date >= _start` och index på `end_date`.

**Radera konto:** `delete_my_account` tog **76 s** för en uthyrare med 1 964 bokningar och 0,8 s
för en vanlig användare. Med index tar det 1,7 s respektive 28 ms.

- **Orsak:** främmande nycklar utan index (`messages.booking_id`, `reviews.booking_id`,
  `reviews.listing_id`, `favorites.listing_id`). Postgres läser då hela meddelandetabellen för
  varje bokning som raderas.
- **Konsekvens:** Supabase avbryter normalt frågor från inloggade efter 8 s, så raderingen skulle
  troligen misslyckas.

### F6. Hämtad data räknas som gammal direkt (alla sidor)

- **Observation (mätt):**
  - Varje gång man byter tillbaka till fliken kör startsidan om båda sina frågor, inklusive
    1000-radersfrågan. Annonssidan hämtar om annonsen.
  - Klick på logotypen tillbaka till startsidan kör också om båda frågorna.
- **Orsak:** `QueryClient` i `src/router.tsx` saknar `staleTime` (standard 0) och har
  `refetchOnWindowFocus` påslaget.
- **För inloggade:** samma sak gäller alla deras frågor, även räknarna i sidhuvudet.

### F7. Meddelanden frågas om i sin helhet var 10:e sekund (inloggad)

- **Var:** `src/routes/_authenticated/meddelanden.tsx`. Hela tråden hämtas om var 10:e s, utan
  gräns. Konversationslistan (`my_conversations`) hämtas var 30:e s.
- **PGlite:** en tråd med 2 000 meddelanden är 695 kB per fråga. Att bara hämta de nya är
  486 byte. En vanlig tråd med 24 meddelanden är 8 kB.
- **Olästräknaren:** `unread_conversation_count()` (sidhuvudet, varannan minut på alla sidor)
  räknar fram hela `my_conversations()` för att få en siffra. Den tog 25 ms för en flitig
  användare och 2,5 ms med en enklare fråga.
- **Hypotes om verklig last:** det finns inga riktiga trådar i dag.

### F8. Bokningssidan hämtar allt, två gånger (inloggad)

- **Var:** `my_bookings()` har ingen gräns. För en uthyrare med 1 964 bokningar blev det 1,4 MB
  och 296 ms (PGlite).
- **Dubbelhämtning:** dessutom hämtas `select id, owner_id, renter_id from bookings` utan filter
  (295 kB), bara för att få fram motpartens id (`src/routes/_authenticated/bokningar.tsx`).
- **Inte verifierat:** Supabases standardgräns på 1000 rader per svar skulle tyst kapa båda
  listorna.

### F9. Radreglerna räknar ut användaren en gång per rad (databas)

- **Var:** policyerna använder `auth.uid()` och `private.is_admin()` direkt. Postgres kör då
  funktionen för varje rad.
- **PGlite:**
  - räkna en flitig användares bokningar: 16,5 ms, med `(select auth.uid())` 3,3 ms;
  - recensioner som icke-admin: 82 ms, med `(select private.is_admin())` 1,2 ms.
- **I dag:** låg effekt, eftersom sidornas frågor även filtrerar på användarens id.

### F10. Söksidan renderas om i sin helhet vid varje ändring

- **Observation (mätt):** på mobil 4G går 1,2 s från Enter till att frågan skickas. I
  CPU-profilen står React och Radix för merparten (se ovan).
- **Orsak:** `SearchResultsPage` skapar nya objekt vid varje rendering (`center`, resultatlistan),
  så `useMemo` räknar om varje gång. Korten och filterpanelen är inte memoiserade.
- **Frågan startar först efter renderingen:** den ligger i `useQueries`.

### F11. Övriga mindre fynd

- **Kalendern laddas för tidigt.** Kalenderkoden (22 kB komprimerad) laddas med varje
  annonssida, även exempelannonser, eftersom `BookingRequest` importeras direkt i
  `annons.$id.tsx`. Mätt.
- **`useAuth()` i varje komponent.** Den startar en egen inloggningslyssnare per komponent, och
  varje hjärta på ett kort har två. `/sok` gör 55 sessionsuppslag vid laddning (mätt), startsidan 14. Komponenterna visar först "utloggad" och ritar om sig. Bokningskortet visas därför först
  efter en stund. Låg effekt.
- **Uppladdning en bild i taget.** Bilderna laddas upp en och en (`PhotoUploader.tsx`, slingan på
  rad 47). **Hypotes:** 8 bilder tar ungefär 8 gånger så lång tid som en. Test: ta tid på 8
  bilder från en mobil.
- **Inloggade sidor är tomma tills JavaScripten laddats** (`ssr: false` i
  `_authenticated/route.tsx`). Det beror på att inloggningen sparas i webbläsarens
  `localStorage`, som servern inte kan läsa. Se avsnittet om ombyggnad.

## 4. Prioriterad åtgärdstabell

| #   | Sida/flöde                                          | Problem                                                                                                   | Belägg                                                                                            | Rekommenderad ändring                                                                                                                                                                                                                                                                                                       | Förväntad effekt                                                                                                                                                            | Arbetsinsats                                                                                                                      | Testa före/efter                                                                                                                |
| --- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Startsida, sök, kategori, annons                    | Bilder 1200–1600 px i små rutor (F1)                                                                      | Mätt: 1 926 kB bilder på `/`; samma bilder i 400 px 228 kB; svagt 4G bild klar 18–20 s            | En funktion `thumbUrl(url, bredd)` som ger Unsplash-bilderna rätt bredd och format, med `srcset`/`sizes` i kort, rader, kategorirutor och galleriets miniatyrer. `fetchpriority="high"` på annonsens huvudbild. Spara en miniatyr på ~480 px vid uppladdning (eller använd Supabases bildtransformering om ni har Pro-plan) | ~1,7 MB mindre på startsidan (mätt för exempelbilderna). Kortare tid mellan innehåll och bild på mobil                                                                      | Liten för exempelbilderna (en hjälpfunktion och 4 komponenter). Medel för egna uppladdningar (uppladdningen sparar två storlekar) | `measure.mjs`: "bilder" i kB på `/` och `/sok`, "första bild" och LCP med `--profile=slow4g`                                    |
| 2   | Startsida, sök, kategori, annons, profil            | Data hämtas först efter all JS; skelett och CLS 0,128 på annonssidan (F2)                                 | Mätt: mobil 4G innehåll 4,4–7,0 s, första ritning 1,2–2,1 s; datan skickas alltid efter "JS klar" | `loader` i rutterna som hämtar datan på servern och skickar med den i HTML:en (React Query-integration för TanStack Router). `defaultPreload: "intent"`. Annonsens titel och bild i `head`. Profilsidans frågor parallellt                                                                                                  | Innehållet finns i första HTML:en i stället för efter JS och databasfråga. Bilderna kan börja laddas direkt. CLS 0 på annonssidan. Rätt titlar för Google och delade länkar | Medel: ändra hur 4–5 publika sidor hämtar data. Ägarens egna pausade annonser måste fortfarande hämtas i webbläsaren              | `measure.mjs --profile=mobile4g`: "innehåll" nära "första ritning", CLS på `/annons/…`. `navigate.mjs`: färre anrop efter klick |
| 3   | Sök, startsida, datumfilter, radera konto, sidhuvud | Saknade index; konto-radering 76 s; olästräknaren räknar allt (F5, F7)                                    | Mätt i PGlite, 20k annonser: 117 → 1 ms, 110 → 0,17 ms, 84 → 5,4 ms, 76 s → 1,7 s, 25 → 2,5 ms    | En migration: 10 index (listan finns i avsnitt 7), extra villkor i `unavailable_listings`, enklare `unread_conversation_count`                                                                                                                                                                                              | Ingen skillnad i dag med 24 annonser. Sök och startsida förblir snabba när datan växer. Konto-radering fungerar för flitiga användare                                       | Liten: en migration som du kör i SQL Editor, plus att utöka `npm run test:db`                                                     | `EXPLAIN ANALYZE` i SQL Editor före/efter; test:db                                                                              |
| 4   | Sök, kategori                                       | 200 nyaste filtreras i webbläsaren; fel träffar över 200 annonser; samma rader hämtas om per sökterm (F3) | Kod + PGlite: 385 kB per sökning, ser ~1 % av 18k annonser                                        | **Bygg om:** en databasfunktion `search_listings` som söker text (svensk fulltext/stavfel), plats/radie, datum, pris och sortering i databasen. Den svarar med kortens kolumner sida för sida, plus antal träffar                                                                                                           | Rätt resultat oavsett antal annonser. Samma lilla svar (12–24 kort) oavsett datamängd                                                                                       | Stor: ändra hur sökresultat hämtas och visas, ny migration och tester                                                             | PGlite med 20k annonser: träffar, svarstid, kB. `measure.mjs`: kB och "innehåll" på `/sok`                                      |
| 5   | Villkor, integritet, troligen mobil startsida       | Typsnitten byts in efter första ritningen; CLS 0,14–0,17                                                  | Mätt: förladdade typsnitt ger CLS 0                                                               | `<link rel="preload" as="font" crossorigin>` för de två latin-filerna i `__root.tsx`                                                                                                                                                                                                                                        | CLS under 0,1                                                                                                                                                               | Mycket liten                                                                                                                      | `measure.mjs /villkor /integritet /`: CLS                                                                                       |
| 6   | Alla sidor                                          | Data blir gammal direkt; flikbyte hämtar om (F6)                                                          | Mätt: startsidan kör om 2 frågor per flikbyte, annonssidan 1                                      | `staleTime` 30–60 s som standard i `src/router.tsx`; frågor om på fokus bara där det behövs (meddelanden, räknare)                                                                                                                                                                                                          | Färre onödiga anrop till Supabase; inga omhämtningar vid bakåt/logotyp                                                                                                      | Mycket liten: ändra standardinställningen                                                                                         | DevTools → Nätverk: byt flik och tillbaka, räkna anrop                                                                          |
| 7   | Startsida                                           | Kategoriräkningen hämtar 1000 rader (F4)                                                                  | PGlite: 290 kB och fel siffror vid 20k; 8 rader <1 kB med en egen funktion                        | Databasfunktion som ger antal och senaste bild per kategori (kan ingå i migrationen i #3)                                                                                                                                                                                                                                   | Liten konstant fråga; rätta siffror                                                                                                                                         | Liten: en funktion och en fråga på startsidan                                                                                     | PGlite: rader och kB; `measure.mjs /`                                                                                           |
| 8   | Meddelanden                                         | Hela tråden var 10:e s (F7)                                                                               | PGlite: 695 kB per fråga för 2 000 meddelanden; 486 byte för bara nya                             | Hämta bara nya meddelanden (`created_at` efter det senaste); visa de senaste 50 och hämta äldre vid behov                                                                                                                                                                                                                   | Lasten per öppen tråd slutar växa med trådens längd                                                                                                                         | Liten–medel: justera en befintlig fråga och slå ihop listan                                                                       | Räkna bytes per fråga i DevTools med en lång testtråd                                                                           |
| 9   | Bokningar                                           | Ingen gräns; extra fråga för motpartens id (F8)                                                           | PGlite: 1,4 MB + 295 kB för en flitig uthyrare                                                    | `my_bookings` returnerar motpartens id (ta bort andra frågan); dela upp i kommande och avslutade, med gräns                                                                                                                                                                                                                 | Mindre svar; ingen tyst kapning vid 1000 rader                                                                                                                              | Medel: ändra en databasfunktion och sidan                                                                                         | PGlite/SQL Editor: rader och kB före/efter                                                                                      |
| 10  | Sök                                                 | Hela sidan renderas om vid varje ändring (F10)                                                            | Mätt: mobil 4G 1,2 s från Enter till fråga; ~1,1 s CPU varav 0,06 s egen kod                      | Memoisera kort och filterpanel, stabila värden (`center`), starta frågan i loadern (#2)                                                                                                                                                                                                                                     | Mindre CPU-arbete per filterändring                                                                                                                                         | Liten–medel                                                                                                                       | `navigate.mjs --profile=mobile4g`: "Ny sökterm"                                                                                 |
| 11  | Databas (radregler)                                 | `auth.uid()`/`is_admin()` per rad (F9)                                                                    | PGlite: 16,5 → 3,3 ms och 82 → 1,2 ms                                                             | Skriv om ~12 policyer med `(select auth.uid())`                                                                                                                                                                                                                                                                             | Låg i dag; växer med antal rader per användare                                                                                                                              | Liten–medel: en migration, täcks av test:db                                                                                       | test:db + `EXPLAIN`                                                                                                             |
| 12  | Annonssida                                          | Kalenderkoden laddas för alla annonser (F11)                                                              | Mätt: 78 kB (22 kB komprimerad)                                                                   | Ladda `BookingRequest`/kalendern först när den behövs                                                                                                                                                                                                                                                                       | ~22 kB mindre JS på annonssidan                                                                                                                                             | Liten                                                                                                                             | `measure.mjs`: JS-kB på `/annons/…`                                                                                             |
| 13  | Alla sidor                                          | `useAuth()` per komponent (F11)                                                                           | Mätt: 55 sessionsuppslag på `/sok`                                                                | En gemensam inloggningskontext (`AuthProvider`)                                                                                                                                                                                                                                                                             | Färre omritningar; bokningskortet hoppar inte in                                                                                                                            | Liten                                                                                                                             | Räkna omritningar/uppslag före/efter                                                                                            |
| 14  | Lägg upp annons                                     | Bilder laddas upp en i taget (F11)                                                                        | Hypotes (kod)                                                                                     | Ladda upp 2–3 bilder samtidigt                                                                                                                                                                                                                                                                                              | Kortare väntan med många bilder                                                                                                                                             | Liten                                                                                                                             | Ta tid på 8 bilder från en mobil på 4G                                                                                          |

## 5. Behöver något byggas om?

**Ja, sökningen (#4).**

- **Begränsningen:** frågan tar de 200 nyaste annonserna och först därefter filtreras de i
  webbläsaren. Resultatet blir fel så fort det finns fler än 200 annonser i en kategori, eller
  totalt utan kategori. Äldre annonser som matchar hittas aldrig, och "Lägst pris" sorterar bara
  bland de 200.
- **Enklare ändringar jag övervägde:**
  - Höja gränsen till 1000 eller mer. Det skjuter bara upp felet. Svaret växer linjärt (385 kB
    per 200 rader), och Supabase kapar normalt vid 1000 rader per svar.
  - Hämta färre kolumner. Svaret blir ungefär fem gånger mindre, men träffarna blir fortfarande
    fel.
  - Bara lägga till index. Databasen blir snabb, men webbläsaren får ändå fel urval.
- **Vad ombyggnaden löser:** rätt träffar oavsett datamängd, och ett konstant litet svar (en sida
  kort i taget). Sortering på pris och avstånd fungerar över alla annonser, och datumfiltret blir
  en del av samma fråga.
- **Hur bråttom är det:** i dag finns 24 annonser, så det är inte akut. Det bör vara klart innan
  ni bjuder in uthyrare i större skala.

**Hur de publika sidorna hämtar data (#2)** är ingen omskrivning, men ett nytt mönster i 4–5
rutter.

**Inte rekommenderat nu:** serverrendering av inloggade sidor. Det kräver att inloggningen flyttas
från `localStorage` till cookies (`@supabase/ssr`) i hela appen. Det är en stor ändring med liten
vinst så länge få är inloggade.

## 6. Det som redan fungerar bra

- **Kodfilerna** har unika namn och cachas i ett år (`cache-control: immutable`). Varje sida har
  sin egen kodfil.
- **Typsnitten** levereras från egen domän och delas upp per teckenuppsättning. Bara latin-filerna
  laddas (70 kB).
- **Uppladdade bilder** krymps i webbläsaren till WebP och cachas i ett år.
- **Bakåtnavigering** visar sparad data direkt (0,1–0,7 s).
- **Favorithjärtana** delar en enda fråga (ingen fråga per kort).
- **Snabba frågor redan i dag:** annons via id, `public_profile`, `booked_dates`,
  `public_reviews`, profilens annonser och mina annonser använder index och tar under 10 ms även
  med 20 000 annonser. Skrivningar (nytt meddelande, ny annons, bokningsförfrågan) tar 2–15 ms.
- **Servern (Worker)** har låg belastning. Den anropar inte Supabase vid rendering, och
  svarstiden lokalt var 0,1–0,2 s. Den onödiga lasten hamnar i stället på Supabase.

## 7. Index och SQL-förslag (från databasgranskningen)

Förslag, ännu inte migrationer. Skapa dem i den skarpa databasen med `CREATE INDEX CONCURRENTLY`
utanför en transaktion.

```sql
CREATE INDEX listings_published_rent_recent ON public.listings (published_at DESC)
  WHERE status = 'published' AND listing_type = 'rent';
CREATE INDEX listings_published_rent_category ON public.listings (category_slug, published_at DESC)
  INCLUDE (city) WHERE status = 'published' AND listing_type = 'rent';
CREATE INDEX bookings_taken_end ON public.bookings (end_date) WHERE status IN ('confirmed','completed');
CREATE INDEX listing_blocked_dates_end ON public.listing_blocked_dates (end_date);
CREATE INDEX bookings_owner_requested ON public.bookings (owner_id, start_date) WHERE status = 'requested';
CREATE INDEX messages_booking ON public.messages (booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX reviews_booking ON public.reviews (booking_id);
CREATE INDEX reviews_listing ON public.reviews (listing_id);
CREATE INDEX favorites_listing ON public.favorites (listing_id);
CREATE INDEX saved_searches_user_created ON public.saved_searches (user_id, created_at DESC);
-- unavailable_listings, bokningsdelen: lägg till  AND b.end_date >= _start

CREATE OR REPLACE FUNCTION public.unread_conversation_count()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.conversations c
   WHERE (c.owner_id = auth.uid() AND c.last_message_at > c.owner_last_read_at)
      OR (c.renter_id = auth.uid() AND c.last_message_at > c.renter_last_read_at)
$$;
```

## 8. Utanför prestanda: en sökbugg

Sökningen "borr" ger 0 träffar, fast "Slagborrmaskin Bosch Professional" finns.

- **Vad som händer:** sökningen sätter automatiskt underkategorin `borrmaskin`.
  `subCategoryOf()` i `src/lib/search/attributes.ts` väljer den första underkategori vars ord
  finns i annonsens text. Borrmaskinen hamnar därför troligen i en annan underkategori.
- **Status:** inte utrett vidare.

## Genomförandeplan i steg

Varje steg blir en egen leverans till `main`. Mät före och efter med skripten nedan. Databassteg:
migrationen körs i SQL Editor först, och koden fungerar även innan den har körts (main driftsätts
direkt).

| Steg                 | Innehåll (punkter i tabellen ovan)                                                                                                                                                                                                                         | Insats                                                               | Vem gör vad                                           | Klart när                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1. Snabba vinster    | Rätt storlek på exempelbilderna med `srcset`, huvudbilden laddas först (#1, första delen). Förladdade typsnitt (#5). Data färsk i 30–60 s (#6). Kalendern laddas först när den behövs (#12)                                                                | Liten. Bara frontend                                                 | Claude                                                | Bilder på `/` under 300 kB, CLS på `/villkor` under 0,1, inga omhämtningar vid flikbyte            |
| 2. Databaspaket      | 10 index, snabbare `unavailable_listings` och olästräknare (#3). Kategorisiffror via en databasfunktion (#7)                                                                                                                                               | Liten. En migration plus test i `npm run test:db`                    | Claude skriver, Marcus kör SQL:en                     | `EXPLAIN` visar index i SQL Editor; startsidan hämtar 8 rader i stället för 1000                   |
| 3. Data från servern | Startsidan, annonssidan och profilen hämtar sin data på servern. Förladdning när man pekar på länkar. Rätt titel och bild per annons (#2)                                                                                                                  | Medel. Annonssidan först som pilot, sedan startsida och profil       | Claude                                                | `measure.mjs` på mobil 4G: innehållet syns ungefär när sidan börjar ritas; CLS 0 på annonssidan    |
| 4. Ny sökning        | Databasfunktionen `search_listings` med text, plats, datum, pris, sortering och sidor. Söksidan och kategorisidorna hämtar från servern och ritas om mindre (#4, #10). Rätta "borr"-buggen (avsnitt 8)                                                     | Stor. Migration plus omskrivning av hur sökresultat hämtas och visas | Claude skriver, Marcus kör SQL:en                     | Rätt träffar med 20 000 annonser i PGlite; svaret är en sida kort; `/sok` på mobil 4G som i steg 3 |
| 5. Inloggade sidor   | Meddelanden hämtar bara nya (#8). Bokningar med gräns och motpartens id (#9). Radreglerna läser användaren en gång per fråga (#11). Gemensam inloggningskontext (#13). Parallell uppladdning (#14). Små kopior av egna uppladdade bilder (#1, andra delen) | Medel. En migration plus flera små ändringar                         | Claude skriver, Marcus kör SQL:en och testar inloggad | Mindre svar per meddelandehämtning, bokningssidan gör en fråga, `test:db` går igenom               |

Ordning: steg 1 och 2 är oberoende och kan göras i valfri ordning. Steg 3 före 4, så att
mönstret för datahämtning på servern är på plats när sökningen byggs om. Steg 4 bör vara klart
innan någon kategori har runt 200 annonser. Steg 5 bör vara klart innan riktiga användare bjuds in.

## Så mäter du före och efter

```sh
npm run build
npm install --no-save playwright-core@1 wrangler@4
node_modules/.bin/wrangler dev -c .output/server/wrangler.json --local --port 8787   # egen terminal
node scripts/perf/measure.mjs --profile=mobile4g --runs=3        # första besöket, tom cache
node scripts/perf/measure.mjs --profile=desktop --runs=3 /villkor # valfria sidor
node scripts/perf/navigate.mjs --profile=mobile4g                # klick när sidan är laddad
```

Profiler: `desktop`, `mobile4g` och `slow4g`. Skripten använder installerad Chrome. Sätt
`BROWSER_PATH` för att använda en annan webbläsare, t.ex.
`BROWSER_PATH=/opt/brave.com/brave/brave-browser`.

- **Jämför samma profil före och efter.** Kör gärna båda gångerna direkt efter varandra,
  eftersom nätet till Supabase varierar.
- **Databasändringar** testas i PGlite (`npm run test:db`) och med `EXPLAIN ANALYZE` i SQL
  Editor.
