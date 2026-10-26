> [!IMPORTANT]
> Pushes to `main` on GitHub deploy the site (Cloudflare Workers Builds, Worker
> `hyrkoll`), so keep `main` in a working state: `npm run build` must pass.
> Don't rewrite published git history (force pushing, or rebasing/amending/squashing
> commits that are already pushed).

- Stack: TanStack Start + React, hosted on Cloudflare Workers. Database and login:
  our own Supabase project (ref in `supabase/config.toml`).
- `.env` is checked in on purpose and holds only public values (Supabase URL and
  publishable key). Secret keys (service role, SMTP, Google client secret) go in the
  Supabase/Cloudflare dashboards, never in git.
- Schema changes: add a migration in `supabase/migrations/`, apply it to the
  Supabase project, then update `src/integrations/supabase/types.ts`.
- The browser talks straight to Supabase, so row level security is the only
  protection. `npm run test:db` replays all migrations in PGlite and checks the
  rules as different users. Extend it when you add tables or policies.
  Platform-owned columns (ratings, counters, seller name, verification) are kept
  by `*_guard` triggers in the `private` schema; see
  `supabase/migrations/20261026120000_harden_permissions.sql`.
- First version (docs/mvp-plan.md): listings are "sale" or "rent" (`listing_type`),
  only in Stockholm county (`src/lib/geo.ts`), and the visible categories are listed in
  `src/lib/categories.ts`. Bookings, bids, comparison, company profiles and the
  statistics page are hidden from the UI but their code and tables remain.
- Messaging: buyers start conversations with the `start_conversation` RPC; the inbox
  uses `my_conversations` (public names only, never emails). New-message emails are
  sent by the server function in `src/lib/notify.functions.ts` via Resend
  (`src/lib/email.server.ts`); it needs the Cloudflare secrets `RESEND_API_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` and the variable `EMAIL_FROM`. Without them no email
  is sent and the rest of the site still works. Server-only code goes in `*.server.ts`
  and is imported dynamically inside server function handlers.
- Moderation: admins (rows in `user_roles` with role `admin`) use `/admin`, backed by
  the `admin_*` RPCs, which check `private.is_admin()` themselves. Blocked users
  (`profiles.blocked_at`) can't write listings or messages. Admins only see a
  conversation's messages after someone in it reported it.
- Spam limits and text limits live in the database
  (`supabase/migrations/20261101120000_limits.sql`); database errors meant for users are
  written in Swedish and shown via `userMessage()` in `src/lib/db-errors.ts`. Site
  operator and contact details for the legal pages are in `src/lib/site.ts`. Manual
  setup (captcha, backups, logs, admins): `docs/operations.md`.
- The project no longer uses Lovable. `@lovable.dev/vite-tanstack-config` is just
  the Vite config package and stays. Background: `docs/migration-plan.md`.
