# MVP plan: first version for real users

Based on the code review on 2026-10-24/25. The background (what works, what's demo,
security issues) is summarized under "Known issues" below.

## Decisions (Marcus, 2026-10-25)

| Question | Decision |
|---|---|
| Rent or sell? | **Both.** A listing is either "Säljes" or "Uthyres". |
| Geography | Start **only in Stockholm** (Stockholm county). Other big cities later. |
| Category | Not decided. Recommendation below. |
| Who runs the site | A company in the future. Right now: development, no public launch. |
| Demo data (24 listings, 72 reviews) | **Keep for now.** Must be removed or clearly marked before real users are invited. |
| Rental features (bookings, bidding, comparison, external sources, companies) | Hidden if needed. **Not deleted.** |

## Category: recommendation

**Recommendation: "Verktyg, släp & maskiner"** (tools, trailers, garden and construction
machines) as the only category at launch in Stockholm.

- **Fits both renting and selling.** People rent pressure washers and trailers, and sell used
  tools. Both kinds of listings make sense side by side.
- **Real need in Stockholm.** Many live in apartments without storage space or a car with a
  tow bar, so renting beats buying.
- **Supply you can recruit:** homeowners in the suburbs, and small rental companies
  (hyrfirmor) that want another channel.
- **Least rework.** The existing categories (släpvagn, verktyg, trädgård, bygg), search words
  and demo listings already cover exactly this.
- **Works all year.** Indoor renovation goes on in winter, and garden and trailers peak in spring.

Alternatives:
- **Sport & friluftsliv** (skis, kayaks, camping): both rent and sell, enthusiast groups to
  recruit from, peaks in winter and summer. More seasonal.
- **Barn & familj** (prams, car seats, clothes): mostly selling, very high turnover. But
  Facebook groups, Blocket, Tradera and Sellpy are strong here.
- **Flytt** (trailers, boxes, furniture): lots of moves in Stockholm, but each user only needs it occasionally.

**Simple test before deciding:** try to get 30 real listings in two weeks in your top candidate
(friends, local Facebook groups, 5–10 rental companies). The category where that's easiest wins.

## What this changes in the plan

- **Listing model:** new field `listing_type` (`sale` / `rent`).
  - Sale: price in kr (0 = "Skänkes"), status active / paused / **sold**.
  - Rent: price per day (optional week), status active / paused. Dates are agreed in
    messages; the booking calendar stays hidden.
- **Place:** municipalities in Stockholm county + optional area/neighbourhood (free text),
  instead of 12 cities across Sweden. Search: "Hela Stockholm" or one municipality.
- **Categories:** only the chosen category group is shown. The rest stay in the database.
- **Demo data:** stays, but shown as "Exempelannons", and fake reviews/ratings are hidden
  (reviews aren't part of v1). Delete before inviting real users.
- **Legal:** until the company exists, Marcus is personally responsible (including as the
  data controller under GDPR). Therefore: a closed beta with invited users, no public
  launch. Terms and privacy policy are drafted now and finalized with the company's details.
- **Testing database rules:** locally with PGlite (real Postgres in Node). All
  migrations are replayed plus test users. No Supabase test project needed, and no live data is touched.

## Tasks in order

| # | Task | Effort | Done when |
|---|---|---|---|
| 1 | **Lock down database rules** (migration + local test script) | M | Logged-out visitors can't read phone numbers. Users can't change verification, ratings, `owner_name`, others' companies, or booking/bid statuses directly. Fake reviews are impossible. Conversations can't be deleted. The test script passes. Marcus runs the migration in the SQL Editor |
| 2 | **Clean the interface of fake parts** (demo listings stay but are labelled) | S | No external results, AI demo, demo button, fake statistics, reviews or promises about deposits, insurance or payments. Demo listings show "Exempelannons" |
| 3 | **Sell + rent, Stockholm, one category group; hide everything else** (done 2026-10-27; all 8 categories still visible until the category is chosen) | M | Menu: Sök, Lägg upp annons, Meddelanden, Favoriter, Mitt konto. One page to create a listing with Säljes/Uthyres. "Mark as sold" hides the listing from search |
| 4 | **Contact the seller** (thread + email notification) (done 2026-10-28; emails need Resend + Cloudflare secrets) | M–L | Buyer → seller via a button on the listing. The seller gets an email without addresses being shared. A third user can't read it |
| 5 | **Photo upload** (Supabase Storage, shrunk in the browser, max 8) (done 2026-10-30) | M | Works from a phone. Non-images are rejected. Nobody can delete someone else's photos. Gallery on the listing page |
| 6 | **Account basics** (password reset, own SMTP, Swedish errors, delete account) (code done 2026-10-29; SMTP setup in docs/email-setup.md) | S–M | Reset email arrives and works. Errors are in Swedish. The account can be deleted |
| 7 | **Minimum moderation** (admin role check, report reasons, hide listing, email on report) (done 2026-10-31) | M | Non-admins can't open `/admin`. Admin hides a listing in one click |
| 8 | **Spam and launch basics** (captcha, limits, terms, privacy policy, `lang="sv"`, logging, backups) (code done 2026-11-01; setup in docs/operations.md) | M | See the task description in the review |

## Open before inviting users

- **Email (blocks signups):** Supabase's built-in sender only reaches the Supabase team,
  so ordinary users get no confirmation or password-reset email. Set up SMTP per
  `docs/email-setup.md` (Gmail for a closed beta, or a domain + Resend). Marcus
  postponed this on 2026-10-29. A domain also turns on "new message" emails.
- **Spam limits in the database:** run `supabase/migrations/20261101120000_limits.sql`
  in the SQL Editor if not done yet (it can't be checked from outside).
- **Make yourself admin** (SQL in `docs/operations.md`) if not done yet.
- **Supabase settings:** minimum password length 8, the Swedish email templates, and
  the site's address in Site URL / Redirect URLs (`docs/email-setup.md`).
- **Test on the live site** with two accounts, since nothing could be clicked through
  in a browser during development: sign up and log in, post a listing with photos
  from an iPhone, an Android phone and a computer, send messages both ways, mark as
  sold, report a listing and handle it in `/admin`, and delete a throwaway account.
  Password reset once email works.
- **Remove the 24 demo listings** (and their fake reviews) before inviting real users.
- **Choose the launch category** (all 8 are visible now): edit `src/lib/categories.ts`.
- **Site details:** who runs the site and a contact email (a Gmail address is fine to
  start with). Send them and they go into `src/lib/site.ts`; until then the terms,
  privacy policy and contact page show "Utkast". Postponed by Marcus on 2026-11-01.
- **Captcha:** create a Turnstile widget in Cloudflare, put the site key in `.env`,
  then enable it in Supabase, in that order (`docs/operations.md`). Postponed by Marcus
  on 2026-11-01.
- **Backups:** choose Supabase Pro (daily backups) or regular manual dumps
  (`docs/operations.md`). Postponed by Marcus on 2026-11-01.
- **Have the terms and privacy policy reviewed** before a public launch.

## Later (after the first version)

- **Hidden seller rating** (Marcus, 2026-10-31): a trust score per seller that only
  admins see, based on how they behave, e.g. reports against them (and whether
  they were upheld), hidden listings, blocks, account age, and how they answer
  messages. Used to spot likely scammers early: flag them in `/admin` and, for
  low scores, hold their new listings for review or rank them lower in search.
  Never shown to the seller or other users. Builds on the moderation data from task 7.
- **Small photo versions for cards** (about 480 px) so search and the home page load
  less data (suggested 2026-10-30).
- **Own domain + Resend**: turns on "new message" emails and report emails to the admin
  (`docs/email-setup.md`, step 3). Also the long-term fix for login emails.
- **Company**: when it exists, update `src/lib/site.ts`, the terms and the privacy policy.
- **Make the code private**: the GitHub repo is a public fork; copy it to a new private
  repo (`docs/migration-plan.md`, Step 0).
- **Google login** (optional): enable it in Supabase; the button appears by itself.
- **Browser error monitoring** (e.g. Sentry); server errors already go to Workers Logs.
- **Listing pages rendered on the server** for link previews and Google.
- **Search in the database** instead of in the browser (today max 200 listings per search).
- **Clean up unused code** from the original prototype (`ai-assist.ts`, `demo-listings.ts`,
  `demo-offers.ts`, `ResultsMap.tsx` …), after checking with the friend who wrote it.

## Known issues (summary of the review)

- The code was built as a **rental and comparison service** ("Hyrkoll"). About half is
  rental, comparison or demo features.
- **Contacting the seller doesn't work.** Nothing creates a conversation (`src/routes/annons.$id.tsx`,
  `src/routes/_authenticated/meddelanden.tsx`).
- **Database rules** (`supabase/migrations/20260908145157_…sql`): profiles, including phone,
  are readable by everyone. Users can set their own verification and ratings. Listing owners can
  change `rating`, `owner_name` and `company_id`. Anyone can write "verified" reviews.
  Either party can change bookings and bids freely. Conversations can be deleted.
- **No photo upload** (no storage bucket). **No password reset.** `/admin` is open to all
  logged-in users and has no actions.
- **Swedish:** 404 and error pages in English, `lang="en"`, Supabase's English error messages.
- **Build and type check pass.** Lint fails (mostly formatting). No tests.
