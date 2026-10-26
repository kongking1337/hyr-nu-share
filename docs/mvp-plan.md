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
| 4 | **Contact the seller** (thread + email notification) | M–L | Buyer → seller via a button on the listing. The seller gets an email without addresses being shared. A third user can't read it |
| 5 | **Photo upload** (Supabase Storage, shrunk in the browser, max 8) | M | Works from a phone. Non-images are rejected. Nobody can delete someone else's photos. Gallery on the listing page |
| 6 | **Account basics** (password reset, own SMTP, Swedish errors, delete account) | S–M | Reset email arrives and works. Errors are in Swedish. The account can be deleted |
| 7 | **Minimum moderation** (admin role check, report reasons, hide listing, email on report) | M | Non-admins can't open `/admin`. Admin hides a listing in one click |
| 8 | **Spam and launch basics** (captcha, limits, terms, privacy policy, `lang="sv"`, logging, backups) | M | See the task description in the review |

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
