# Plan: making money with Hyrkoll

Written 2026-11-09 at Marcus's request. Nothing in this plan is built yet. It replaces the
short "Phase 4, money" line in `docs/mvp-plan.md` and builds on what exists: booking requests,
the price formula (`bookingPrice` + `request_booking`), cancellation rules that are shown but
not enforced, deposits that are shown but not handled, hidden company profiles, and the trust
score.

Prices and fees from other companies were checked on 2026-11-09 and change over time.
Check them again before deciding.

## The short version

1. **Charge only when a rental actually happens.** People pay a commission on bookings made
   through the site, the way Hygglo, Airbnb and Fat Llama do. People see this as fair,
   because it costs nothing to post a listing or browse.
2. **Don't charge anything until Stockholm has real activity.** A rental site lives on
   having enough listings and renters (liquidity). An early fee scares off the owners we need
   most. Free during the beta, and fees only once payment through the site works.
3. **Payment through the site comes first.** Without it there's nothing to take a fee from.
   It's also the biggest gain in trust: the renter pays, Hyrkoll holds the money, and the owner
   is paid after the return.
4. **Then add-ons that make renting safer or easier:** damage protection, paid plans for
   rental companies, and boosted listings. Ads come last, if ever.

## Revenue streams, in order

| # | Stream | How it works | When | Size |
|---|---|---|---|---|
| 1 | **Commission on bookings** | Renter's service fee + owner commission on each paid booking | When payment through the site goes live | Main income (most of it) |
| 2 | **Damage protection** | The renter pays e.g. 8–12% extra for cover up to X kr; an insurer carries the risk and we get a commission. A simpler first version is a deposit held by the site | After 1, needs an insurance partner | Medium |
| 3 | **Plans for rental companies** ("Hyrkoll Företag") | Monthly fee for many listings, a company page, bulk calendar, lower commission, statistics | When 10+ rental companies are active | Medium, steady |
| 4 | **Boosted listings** ("Lyft annons") | Pay e.g. 29–49 kr to show up higher in search/category for 7 days, clearly marked "Sponsrad" | When search has more listings than fit on one page | Small |
| 5 | **Delivery** | Hyrkoll arranges transport (e.g. a partner courier) and keeps a margin | Phase 5 or later | Small–medium |
| — | Display ads (Google AdSense etc.) | Not recommended: little money at our size, slower pages, and it looks less trustworthy | — | — |

### 1. Commission: suggested model

How Hygglo does it (third-party sources and Hygglo's help pages): the owner pays about **20%
including VAT** (16% + VAT for companies), and **the renter also pays a booking fee** on top.

**Recommendation for Hyrkoll, in two steps:**

- **At launch:** the **renter pays a 10% service fee (at least 19 kr)**, and **the owner pays
  0%**. Owners are what we're short of, and "free to rent out, you keep 100%" is an easy
  promise to sell when recruiting owners and rental companies.
- **When there are enough listings** (e.g. 300+ active in Stockholm): add an **owner
  commission of 8–10%** and keep the renter fee. A total take of 18–20% is in line with the
  market and still cheaper for owners than Hygglo.

Example: a pressure washer for 3 days at 150 kr/day = 450 kr.

| | At launch | Later |
|---|---|---|
| Renter pays | 450 + 45 = **495 kr** | 495 kr |
| Owner gets | **450 kr** | 450 − 45 (10%) = **405 kr** |
| Hyrkoll's gross | 45 kr | 90 kr |
| Card fee (Stripe, ~1.5% + 1.80 kr on 495 kr) | −9 kr | −9 kr |
| **Hyrkoll's net, before VAT** | **~36 kr** | **~81 kr** |

The fees are VAT-liable once the company is registered for VAT (25% on Hyrkoll's fee, not on
the whole rental).

**What it takes to break even:** running costs are low today (Cloudflare Workers Paid ~$5,
Supabase Pro ~$25, domain, Resend; roughly 500–1,000 kr/month). That's about 15–30 paid
rentals a month at launch fees. 1,000 rentals a month gives about 36,000–81,000 kr/month in
net fees, depending on the step. Growth comes from more rentals, not higher fees.

### 2. Damage protection and deposit

- **Version 1 (no insurance partner):** the deposit the owner enters is charged together with
  the rental and paid back automatically 48 h after the return unless the owner reports damage.
  If damage is reported, an admin decides in `/admin` (photos from pickup/return exist already).
  No income, but needed for trust, and it makes stream 1 sell better.
- **Version 2:** "Hyrkoll Skydd": the renter pays a small extra fee and an insurer covers
  damage up to e.g. 25,000 kr. Selling insurance requires a licence (Finansinspektionen), so
  this has to go through a partner who carries the licence and the risk (typically an
  insurtech that offers an API). We get a commission per policy.

### 3. Plans for rental companies

The `companies` table and the company pages exist but are hidden. Suggested:

| | Privat | Företag Bas | Företag Pro |
|---|---|---|---|
| Price | Free | 0 kr/month | ~299–499 kr/month |
| Commission | as above | as above | lower (e.g. 5%) |
| Listings | normal limits | more | unlimited |
| Extras | — | company page, org.nr, VAT receipts | bulk calendar, import from file, statistics, top placement in its category |

Start by giving the first 10–20 rental companies Pro for free in exchange for listings. That
is the fastest way to fill the site.

### 4. Boosted listings

Only once there are more listings than fit on the first page of a search, otherwise nobody
gets anything for the money. Always marked "Sponsrad", at most 1 in 6 results, and never for
users with a low trust score. Paid with the same Stripe setup.

## Order of work

### Step 0: before any money (now, closed beta)

Mostly not code, and much of it is already on the "Open before inviting users" list in
`docs/mvp-plan.md`:

- **Start the company** (aktiebolag is recommended because of personal liability), F-skatt,
  business bank account, and VAT registration when it becomes relevant. Stripe and insurers
  need a company, and the terms need its details (`src/lib/site.ts`).
- **Own domain + email** (also unblocks signups and booking emails).
- **Measure what matters** so we know when to start charging: requests per week, share
  accepted, finished rentals, average order value, and how many rentals agree on price in
  messages instead. A small admin view built on `bookings` is enough.
- **Goal before step 1:** e.g. 100+ active listings and 20+ finished rentals a month in
  Stockholm.

### Step 1: payment through the site (Stripe Connect)

**Why Stripe Connect:** it handles payouts to private owners, identity checks (KYC) and
the payment licence, so Hyrkoll doesn't need a licence of its own. It takes card, Apple/Google
Pay, Klarna, and **Swish** (which Swedish renters expect). Fees on a Swedish account:
cards ~1.5% + 1.80 kr, Swish 1% + 3 kr (max 7 kr). Connect can cost extra per active owner
account depending on the setup; check before choosing.

**The flow:**

1. Renter sends a request (as today). Nothing is charged.
2. Owner accepts → the booking becomes **"Väntar på betalning"** (awaiting payment) and the
   renter has e.g. 24 h to pay (card/Swish/Klarna) the rent + service fee + deposit.
   If they don't, the booking lapses and the days are freed.
3. Paid → **"Bekräftad"**. The money sits with Hyrkoll (Stripe "separate charges and
   transfers").
4. Pickup is **confirmed by the renter** (closes the open item from the 2026-11-04 review:
   today either side can mark it, so an owner could fake a rental).
5. Return → after 48 h without a damage report, the owner gets their share and the deposit is
   refunded.
6. **Cancellations follow the listing's rule** (flexible/normal/strict), which is only shown
   today. Refunds happen automatically. The service fee is refunded if the owner cancels.
7. **Owner onboarding:** the first time someone accepts a paid booking they go through
   Stripe's onboarding (name, personal number, bank account), Stripe's hosted page.

**Technical outline** (fits how the project works today):

- New tables, written only by the server (service role) and readable only by the parties:
  `payment_accounts` (user → Stripe account, onboarding status), `payments` (booking,
  amounts, fee, Stripe IDs, status), `payouts`, and a `platform_settings` row with the fee
  rates so they can change without a deploy. RLS + `*_guard` triggers as today, and new
  checks in `npm run test:db`.
- New booking statuses: `awaiting_payment`, plus payment state on the booking.
  `respond_booking` and `my_bookings` are updated.
- **The price formula must change in both places together:** `request_booking` (SQL) and
  `bookingPrice` (`src/lib/bookings.ts`) get the service fee. The price breakdown on the
  listing page and in bookings shows "Hyra", "Serviceavgift", "Deposition" and "Totalt".
- Server functions in `src/lib/payments.functions.ts`, with Stripe code in
  `src/lib/stripe.server.ts`, imported dynamically like `email.server.ts`:
  create the payment, the onboarding link, and the refund/transfer.
- A **Stripe webhook** route in the Worker (signature checked) that updates `payments` and
  the booking. Something on a schedule (Cloudflare Cron Trigger) pays out 48 h after the
  return and lets unpaid bookings lapse.
- Cloudflare secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Only the publishable key
  goes in `.env`.
- Receipts by email (Resend) for both sides; the company's monthly statement comes from Stripe.
- Admin: payments, refunds and damage cases in `/admin`.
- Effort: **L** (roughly 2–3 weeks of focused work including tests), done in Stripe's test
  mode first.

**Stopping people from paying privately to dodge the fee** (the biggest risk for this model):

- Make paying on the site clearly better: deposit and damage handling, automatic refunds,
  and "Betalt via Hyrkoll" as a safety label. **Only paid bookings give reviews.**
- Keep the fee low at the start (renter only).
- Hide phone numbers and Swish numbers in messages until a booking is paid (simple pattern
  match, shown as "[dolt tills bokningen är betald]").
- The terms say that bookings must be paid through the site. Owners who keep dodging it get a
  lower trust score.

### Step 2: deposit, then damage protection

Version 1 (deposit through Stripe, damage cases in `/admin`) can come right after step 1.
Version 2 when a partner is signed.

### Step 3: owner commission + company plans

When the goal for listings is reached. Show the new commission at least 30 days in advance
(terms + email). Company plans as Stripe subscriptions.

### Step 4: boosted listings, delivery

When search has enough volume to make it worth it.

## Legal and accounting (check with an accountant/lawyer)

- **Company first.** As a private person Marcus can't sensibly take payments for others.
- **Stripe** carries the payment licence and KYC. Hyrkoll must not hold money outside Stripe.
- **VAT** 25% on Hyrkoll's fees and plans (the rent itself is between the parties).
  Receipts must show the fee separately.
- **DAC7:** platforms in the EU report what sellers earn to the tax agency (Skatteverket).
  It covers renting out property and **means of transport** (e.g. trailers, cars, maybe
  e-bikes) among others, but probably not tools. Check which categories it covers before
  launch, since it requires collecting the owner's personal number and address.
- **Insurance** only through a licensed partner (see above).
- **Terms:** Hyrkoll as an intermediary, the fee, cancellation and refund rules, the deposit,
  damage cases, a ban on paying off the site, and the consumer rights that apply to the
  service fee. Update the privacy policy too (Stripe as a data processor, personal numbers
  for DAC7).

## Decisions for Marcus

| Question | Recommendation |
|---|---|
| Who pays at launch? | Renter 10% (min 19 kr), owner 0% |
| When to start charging? | When payment through the site goes live, which needs the company and at least ~100 listings |
| Payment provider? | Stripe Connect (Swish, cards, Klarna; handles payouts and licence) |
| Deposit or insurance first? | Deposit through Stripe first, insurance through a partner later |
| Company plans? | Free Pro for the first rental companies, paid later |
| Ads? | No |

## Sources (checked 2026-11-09)

- Hygglo's commission for companies, 16% + VAT: <https://help.hygglo.info/sv/articles/10551412-bokforing-av-intakter-nar-du-hyr-ut-via-hygglo-foretag>
- Hygglo's 20% from owners + booking fee for renters: <https://allapengar.se/hyr-ut-hygglo/>,
  <https://www.smartakartan.se/hygglo/>
- Stripe's prices in Sweden: <https://stripe.com/en-se/pricing>,
  <https://stripe.com/en-se/pricing/local-payment-methods>
- Swish through Stripe: <https://stripe.com/resources/more/swish-an-in-depth-guide>
