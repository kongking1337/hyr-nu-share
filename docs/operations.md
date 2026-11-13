# Running Hyrkoll

What has to be set up by hand in the Cloudflare and Supabase dashboards.
Email is covered in [`email-setup.md`](email-setup.md).

## Before inviting users

1. **Site details** in `src/lib/site.ts`: who runs the site (`operator`), a postal
   address (`address`, required by the e-commerce act; a c/o address is fine), a contact
   email (`contactEmail`) and, once there is a company, `orgNumber`. Until operator,
   address and email are set, the terms, privacy policy and contact page show an
   "Utkast" notice. Bump `updated` whenever the terms or privacy policy change, and email
   users 30 days ahead of changes that affect them (the terms promise that).
2. **Email (SMTP)**, see `email-setup.md`. Without it nobody can confirm an account.
3. **Captcha** (below).
4. **Backups** (below).
5. Have the terms and privacy policy (`/villkor`, `/integritet`) read through by someone
   who knows consumer, GDPR and platform rules (DSA). They are a reasonable starting
   point, not legal advice.

## Captcha (Cloudflare Turnstile)

Stops bots from creating accounts and guessing passwords. Do it in this order, or
logins stop working in between:

1. Cloudflare → **Turnstile** → Add widget. Hostnames: the site's address (the
   `*.workers.dev` address and later your domain). Mode: Managed.
2. Put the **site key** (public) in `.env` as `VITE_TURNSTILE_SITE_KEY="…"`, commit and
   let it deploy. The login, signup and "Glömt lösenordet?" forms now show the check.
3. Only then: Supabase → **Authentication → Attack Protection** → enable CAPTCHA,
   provider Turnstile, paste the **secret key**.

To turn it off again: disable it in Supabase first, then empty the key in `.env`.

## Verified phone numbers (SMS)

Built but off. Users verify their number with a code by SMS; profiles then show
"Verifierat telefonnummer" (never the number). Turning it on costs money per SMS, and any
logged-in user can make Supabase send a text (the captcha doesn't cover that step), so the
hourly SMS limit in step 4 is the real cap. Do it in this order:

1. Turn on the captcha first (above), so bots can't create accounts or log in by SMS.
2. Create an account with an SMS provider that Supabase supports (e.g. Twilio, Vonage,
   MessageBird) and get its keys.
3. Supabase → Authentication → Sign In / Providers → **Phone**: enable it, choose the
   provider and paste the keys. Enabling Phone also lets people log in with a code by SMS
   instead of email. The site doesn't offer that, but the API does.
4. Supabase → Authentication → Rate Limits: keep SMS per hour low (e.g. 30).

The "Verifiera telefonnummer" box under Mitt konto appears by itself once Phone is enabled.
To turn it off again, disable Phone in Supabase.

## Spam limits (in the database)

Per user: at most 20 new listings a day and 50 active listings, 10 new conversations
an hour, 30 messages per 10 minutes and 20 reports a day. Titles 3–100 characters,
descriptions up to 5 000. See `supabase/migrations/20261101120000_limits.sql`.
Supabase also limits sign-ups and emails per hour (Authentication → Rate Limits).

## Backups

- The **free** Supabase plan has no backups you can restore yourself. Before real users
  rely on the site, either upgrade to **Pro** (daily backups kept 7 days) or take a
  manual backup regularly:
  ```sh
  npx supabase login
  npx supabase link --project-ref hbbrlhajhlnwgrrkmdgs
  npx supabase db dump -f backup-$(date +%F).sql          # schema
  npx supabase db dump --data-only -f data-$(date +%F).sql # data
  ```
  Store the files somewhere safe and private: they contain personal data.
- Photos are in Supabase Storage and are not part of the database dump.

## Error logs

- **Server errors** (pages, server functions, failed emails) go to Cloudflare
  **Workers Logs**: Workers & Pages → `hyrkoll` → Logs. Turned on in `wrangler.jsonc`.
- **Database and login**: Supabase → Logs.
- Errors in visitors' browsers are not collected yet. Sentry (free tier) is a good next step.

## Moderation duties the terms promise

The terms (`/villkor`, sections 12–15) follow the EU Digital Services Act. In practice:

- Hiding a listing: always write a reason; the owner sees it under Mina annonser.
- Blocking an account or deleting a review: the site doesn't tell the user why, so email
  them yourself: what was decided, why, which rule or law, and that they can appeal to the
  contact email within six months.
- Appeals by email: let someone other than the one who made the decision look at it, if
  possible, and answer with reasons.
- Reports by email from people without an account: confirm you got them and answer with
  the decision.
- Warn before blocking someone for repeated clearly illegal content or clearly unfounded
  reports.
- Suspected crimes that threaten someone's life or safety: tell the police (114 14, or 112).

## Admins

Make someone an admin in the Supabase SQL Editor:

```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE email = 'their@email.se'
ON CONFLICT (user_id, role) DO NOTHING;
```

They then see "Moderering" in the menu after logging in again.
