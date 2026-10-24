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
- The project no longer uses Lovable. `@lovable.dev/vite-tanstack-config` is just
  the Vite config package and stays. Background: `docs/migration-plan.md`.
