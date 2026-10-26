# Running Hyrkoll

What has to be set up by hand in the Cloudflare and Supabase dashboards.
Email is covered in [`email-setup.md`](email-setup.md).

## Before inviting users

1. **Site details** in `src/lib/site.ts`: who runs the site (`operator`) and a contact
   email (`contactEmail`). Until both are set, the terms, privacy policy and contact
   page show an "Utkast" notice. Update them when the company exists.
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

## Admins

Make someone an admin in the Supabase SQL Editor:
```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE email = 'their@email.se'
ON CONFLICT (user_id, role) DO NOTHING;
```
They then see "Moderering" in the menu after logging in again.
