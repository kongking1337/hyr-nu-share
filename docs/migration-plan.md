# Migration plan: from Lovable to our own hosting

Goal: run the site on accounts we own, so we're no longer tied to the Lovable
account (a friend's) that the project was built in.

Target setup:

| Part | Today | After the move |
|---|---|---|
| Code | GitHub `kongking1337/hyr-nu-share`, synced with Lovable | Same repo, or a copy we own, *not* synced with Lovable |
| Hosting | Lovable | **Cloudflare Workers** |
| Database, login, files | Lovable Cloud (Supabase project `iorgzgobyhhhqfhhetro`, owned by Lovable) | **Our own Supabase project** (EU / Stockholm) |
| Google sign-in | Lovable's OAuth broker (`@lovable.dev/cloud-auth-js`) | Supabase Auth + our own Google OAuth client |
| Email (confirmation, password reset) | Lovable Cloud defaults | Supabase Auth + custom SMTP (Resend / Postmark / Brevo) |
| Domain / DNS | none | Our domain, DNS on Cloudflare |

## What depends on Lovable (checked 2026-10-24)

- **Database**: 5 migrations in `supabase/migrations/` (tables, RLS policies,
  `on_auth_user_created` trigger, enums, some seed data). No storage buckets, no
  cron jobs, no edge functions. These can be replayed as-is on a new project.
- **Google login**: `src/routes/auth.tsx` calls `lovable.auth.signInWithOAuth("google")`
  (`src/integrations/lovable/index.ts`). This **stops working** off Lovable and must be
  rewritten to `supabase.auth.signInWithOAuth`. Email and password login already
  goes straight to Supabase.
- **Supabase keys**: `.env` (checked into git) points at the Lovable project.
  It only holds public keys (URL and publishable key), no secrets. `VITE_*`
  values are baked in at build time.
- **Harmless leftovers**: `src/integrations/supabase/previewAuthStorage.ts` (falls back
  to localStorage outside Lovable), `src/lib/lovable-error-reporting.ts` (no-op
  outside Lovable), `src/integrations/supabase/cron-auth.ts` and `client.server.ts`
  (not used yet), `.lovable/`. They can stay, or be removed for cleanliness.
- **Build tooling**: `@lovable.dev/vite-tanstack-config` is a normal npm package.
  `npm run build` works locally without a Lovable account and outputs a Cloudflare
  Worker in `.output/server/` (with `wrangler.json`).

## Step 0: talk to the friend first

1. **Ask whether they can just give you access.** Lovable can invite you to the
   workspace or move the project. If that works, no migration is needed.
2. **GitHub repo**: make sure you have admin access to
   `kongking1337/hyr-nu-share`, or have it transferred to you. Otherwise create
   your own repo from it.
3. **Existing data**: if there are real users or listings, ask the friend to
   export them (tables as CSV) from Lovable Cloud. If it's all demo data, start
   from an empty database. Users will most likely have to sign up again, because
   password hashes usually can't be exported.
4. **After the move**: ask the friend to disconnect the Lovable project from the
   GitHub repo, so edits in Lovable don't land on `main` anymore.

## Step 1: create accounts (in your own name, with 2FA)

- [ ] Cloudflare: hosting and DNS
- [ ] Supabase: database, auth, storage
- [ ] Google Cloud Console: OAuth client for "Sign in with Google"
- [ ] Email provider: Resend, Postmark, or Brevo (EU)
- [ ] Domain registrar for the .se domain (e.g. Loopia), DNS pointed at Cloudflare

## Step 2: new Supabase project

1. Create the project, region **EU North (Stockholm)**. Free plan is fine for
   testing, Pro (~$25/month: backups, never paused) before launch.
2. Apply the migrations:
   ```sh
   npx supabase login
   npx supabase link --project-ref <NEW_PROJECT_REF>
   npx supabase db push
   ```
3. Generate types: `npx supabase gen types typescript --project-id <NEW_PROJECT_REF> > src/integrations/supabase/types.ts`
4. Auth settings (Authentication in the dashboard):
   - Site URL: first `https://<worker>.workers.dev`, later `https://<your-domain>`
   - Redirect URLs: the same plus `http://localhost:8080/**` for local dev
   - Google provider: client ID and secret from Google Cloud. Add Supabase's
     callback URL (`https://<ref>.supabase.co/auth/v1/callback`) to the Google client.
   - Custom SMTP: details from the email provider. Write the email templates in Swedish.
   - Optional: Cloudflare Turnstile (captcha) against spam signups
5. Make yourself admin after your first login:
   `insert into public.user_roles (user_id, role) values ('<your-user-id>', 'admin');`
6. Import exported data, if any.

## Step 3: code changes (small, Claude can do them)

- [ ] Replace the Lovable Google login in `src/routes/auth.tsx` with
      `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } })`,
      then remove `src/integrations/lovable/` and `@lovable.dev/cloud-auth-js`
- [ ] Point at the new Supabase project: `supabase/config.toml` (`project_id`) and
      the env variables. Stop tracking `.env` in git and add a `.env.example`.
- [ ] Set a fixed Worker name instead of the auto-generated `kongking1337-hyr-nu-share`
- [ ] Optional cleanup: Lovable leftovers (see above), `.lovable/`, and the Lovable notes in
      `README.md` / `AGENTS.md`
- [ ] Optional: Sentry for error monitoring, instead of `lovable-error-reporting`

## Step 4: deploy to Cloudflare Workers

Recommended: **Workers Builds** linked to the GitHub repo, so every push to `main` deploys.

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy --config .output/server/wrangler.json`
  (or `npx nitro deploy --prebuilt`, which the build itself suggests). Check this on the first deploy.
- Variables:
  - **Build-time** (baked into the browser code): `VITE_SUPABASE_URL`,
    `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`
  - **Runtime** (server-side rendering): `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`
  - **Runtime secret, only once server code needs it**: `SUPABASE_SERVICE_ROLE_KEY`.
    Never put it in `VITE_*` or in git.
- Test on the `*.workers.dev` URL first, then add the domain under the Worker's
  *Custom Domains*.

Manual alternative: `npm run build`, then `npx wrangler deploy --config .output/server/wrangler.json`
from your own machine.

## Step 5: test before switching over

- [ ] Sign up with email and the confirmation email arrives (not in spam)
- [ ] "Forgot password" email works and the link goes to the right domain
- [ ] Google login works
- [ ] Create a listing, save a favourite, send a message, place a bid, make a booking
- [ ] Admin page only works for the admin account
- [ ] Hard refresh on deep links (`/annons/...`, `/hyra/stockholm/...`) works (SSR)
- [ ] The final domain is in Supabase's Site URL and Redirect URLs

## Step 6: after the move

- Lovable is no longer part of the flow. Edit locally or with Claude Code against GitHub.
- Set up SPF, DKIM, and DMARC for the email domain (the email provider shows the DNS records).
- Then continue with production readiness: photo uploads, Stripe Connect,
  spam protection, privacy policy and terms, and DSA requirements.

## Rough cost at start

Cloudflare $0–5/month · Supabase $0 (test) → $25/month (Pro) · Email $0 up to a few
thousand emails/month · Google OAuth $0 · domain ~150 SEK/year.
