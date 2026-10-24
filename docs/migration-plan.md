# Migration plan: from Lovable to our own hosting

Goal: run the site on accounts we own, so we're no longer tied to the Lovable
account (a friend's) that the project was built in.

Target setup:

| Part | Today | After the move |
|---|---|---|
| Code | GitHub `kongking1337/hyr-nu-share` (Marcus's account), a public **fork** of the friend's public repo. Lovable syncs with the friend's original, not the fork | The same repo, or a private copy (see Step 0) |
| Hosting | Lovable | **Cloudflare Workers** |
| Database, login, files | Lovable Cloud (Supabase project `iorgzgobyhhhqfhhetro`, owned by Lovable) | **Our own Supabase project** (EU / Stockholm) |
| Google sign-in | Lovable's OAuth broker (`@lovable.dev/cloud-auth-js`) | Supabase Auth + our own Google OAuth client |
| Email (confirmation, password reset) | Lovable Cloud defaults | Supabase Auth + custom SMTP (Resend / Postmark / Brevo) |
| Domain / DNS | none | Our domain, DNS on Cloudflare |

## Connection map

```
GitHub (kongking1337/hyr-nu-share) ──push to main──> Cloudflare Workers ──serves──> visitors
                                                          │   ▲
                                         Supabase URL +   │   │ domain (DNS on Cloudflare)
                                         publishable key  ▼   │
Google Cloud OAuth ──client ID/secret──> Supabase (database + login) <──SMTP── Resend / Postmark
                                              │
                                              └── Site URL / Redirect URLs = the site's address
```

| # | Connection | Where | What goes in |
|---|---|---|---|
| 1 | Database | Supabase → SQL Editor (or CLI) | The 5 files in `supabase/migrations/`, in name order |
| 2 | App → Supabase | `.env` in the repo | Project URL and publishable key (public values, OK in git) |
| 3 | GitHub → Cloudflare | Workers & Pages → Create → Import a repository | Repo, build and deploy commands (Step 4) |
| 4 | Supabase → site | Authentication → URL Configuration | Site URL and Redirect URLs = the workers.dev address, later the domain |
| 5 | Domain → site | Registrar: nameservers → Cloudflare. Worker → Domains & Routes | Custom domain |
| 6 | Email | Resend/Postmark: verify domain (DNS records in Cloudflare) → Supabase: Authentication → SMTP | SMTP host, port, user, API key as password, sender address |
| 7 | Google login | Google Cloud → Credentials → OAuth client (Web) → Supabase: Authentication → Providers → Google | Google: redirect URI `https://<ref>.supabase.co/auth/v1/callback`. Supabase: client ID and secret. Plus the code change in Step 3 |

1–4 are enough for a working site with email login. 5–7 can come afterwards.
Secret keys (service role, SMTP/API keys, Google client secret) go straight into
the Supabase/Cloudflare dashboards, never into git or chat.

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
2. **GitHub repo**: `kongking1337/hyr-nu-share` is Marcus's account, and it's a fork
   of the friend's **public** repo. It's a full copy with all history, so we can
   host straight from it.
   - **It won't disappear.** If the friend deletes their public repo or makes it
     private, the fork stays.
   - **Lovable doesn't sync with the fork.** Lovable pushes to the friend's
     original. To get those changes, use *Sync fork* on GitHub, or merge
     upstream like in `568e5a8`. Our pushes to the fork never reach Lovable.
   - **The fork is public, and GitHub doesn't let you make forks private.**
     So anyone can read the code. That's fine as long as no secrets are committed
     (today `.env` only has public keys). To make the code private, create a new
     **private** repo and push all history to it: `git push --mirror <new-repo-url>`.
     Then point the server and Cloudflare at the new repo. Or ask GitHub Support
     to detach the fork, and then switch it to private.
   - When opening pull requests, check the base repo. GitHub suggests the friend's repo by default.
3. **Existing data**: if there are real users or listings, ask the friend to
   export them (tables as CSV) from Lovable Cloud. If it's all demo data, start
   from an empty database. Users will most likely have to sign up again, because
   password hashes usually can't be exported.
4. **After the move**: if the friend keeps editing in Lovable, the two
   versions will drift apart. Agree on where development happens from now on.

## Step 1: create accounts (in your own name, with 2FA)

- [ ] Cloudflare: hosting and DNS
- [ ] Supabase: database, auth, storage
- [ ] Google Cloud Console: OAuth client for "Sign in with Google"
- [ ] Email provider: Resend, Postmark, or Brevo (EU)
- [ ] Domain registrar for the .se domain (e.g. Loopia), DNS pointed at Cloudflare

## Step 2: new Supabase project

1. Create the project, region **EU North (Stockholm)**. Free plan is fine for
   testing, Pro (~$25/month: backups, never paused) before launch.
2. Apply the migrations. Easiest: paste each file from `supabase/migrations/`,
   in name order, into Supabase's **SQL Editor** and run it. Or with the CLI:
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
      `.env` (URL, publishable key, project ID). These are public values, so it's
      fine to keep them in git, and Cloudflare's build then needs no variables.
      Secret keys never go in `.env`.
- [ ] Set a fixed Worker name instead of the auto-generated `kongking1337-hyr-nu-share`.
      The name in `wrangler.json` must match the Worker's name in Cloudflare.
- [ ] Optional cleanup: Lovable leftovers (see above), `.lovable/`, and the Lovable notes in
      `README.md` / `AGENTS.md`
- [ ] Optional: Sentry for error monitoring, instead of `lovable-error-reporting`

## Step 4: deploy to Cloudflare Workers

Recommended: **Workers Builds** linked to the GitHub repo, so every push to `main` deploys.

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy --config .output/server/wrangler.json`
  (or `npx nitro deploy --prebuilt`, which the build itself suggests). Check this on the first deploy.
- Variables: **none needed to start**. The public Supabase values come from
  `.env` at build time, and today no server code reads `process.env`.
  - Later, when server functions use `requireSupabaseAuth` / `client.server.ts`, add these
    under the Worker's *Settings → Variables and Secrets*: `SUPABASE_URL` and
    `SUPABASE_PUBLISHABLE_KEY`, plus `SUPABASE_SERVICE_ROLE_KEY` as a **secret**.
    Never put the service role key in `VITE_*` or in git.
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
