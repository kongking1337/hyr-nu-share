-- Fixes from the security and usability review on 2026-11-04.
--
-- 1. Companies can't be created or changed from the browser while company profiles are
--    hidden. Until now anyone could make up a company ("Hyrkoll Kundtjänst") through the
--    API and show it as the seller name on their listings.
-- 2. Conversations are only started through start_conversation() and the booking
--    functions, which check blocks and limits. Direct inserts let blocked users open
--    empty conversations in other people's inboxes.
-- 3. Size limits on what every visitor downloads with the listings, on saved searches,
--    on report targets and on blocked periods in the past (all unlimited until now).
-- 4. A draft gets its publishing date when it is published (search sorts by it), and
--    texts that still talked about selling.
-- 5. Deleting an account also removes the name stored on reviews the user wrote.
--
-- Safe to run more than once. Tested locally with supabase/tests/permissions.test.mjs
-- (npm run test:db).

-- 1. Companies: read-only until company profiles are launched ----------------------------

REVOKE INSERT, UPDATE, DELETE ON public.companies, public.company_admins FROM authenticated;

-- 2. Conversations only through the functions ------------------------------------------------

DROP POLICY IF EXISTS "conversations_start" ON public.conversations;
REVOKE INSERT ON public.conversations FROM authenticated;

-- 3. Size limits -------------------------------------------------------------------------------

-- Every search downloads whole listing rows, so one huge field would slow down everyone.
ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_size_limits;
ALTER TABLE public.listings ADD CONSTRAINT listings_size_limits CHECK (
  char_length(city) <= 60
  AND octet_length(attributes::text) <= 2000
  AND octet_length(COALESCE(vehicle, '{}'::jsonb)::text) <= 2000
  AND octet_length(dynamic_pricing::text) <= 2000
) NOT VALID;

ALTER TABLE public.saved_searches DROP CONSTRAINT IF EXISTS saved_searches_limits;
ALTER TABLE public.saved_searches ADD CONSTRAINT saved_searches_limits CHECK (
  char_length(label) <= 200
  AND char_length(query) <= 500
  AND octet_length(filters::text) <= 4000
) NOT VALID;

CREATE OR REPLACE FUNCTION private.saved_searches_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user = 'postgres' AND auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF (SELECT count(*) FROM public.saved_searches WHERE user_id = NEW.user_id) >= 50 THEN
    RAISE EXCEPTION 'Du kan spara högst 50 sökningar. Ta bort några under Favoriter först.';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER saved_searches_limit BEFORE INSERT ON public.saved_searches
  FOR EACH ROW EXECUTE FUNCTION private.saved_searches_limit();

-- Same as before, plus a length limit on the target.
DROP POLICY IF EXISTS "reports_insert" ON public.reports;
CREATE POLICY "reports_insert" ON public.reports FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = reporter_id
    AND status = 'open'
    AND resolved_at IS NULL AND resolved_by IS NULL AND resolution IS NULL AND notified_at IS NULL
    AND target_type IN ('listing', 'user', 'message', 'conversation')
    AND char_length(target_id) <= 100
    AND char_length(reason) BETWEEN 1 AND 200
    AND char_length(COALESCE(details, '')) <= 2000
    AND (
      target_type <> 'conversation'
      OR EXISTS (
        SELECT 1 FROM public.conversations c
         WHERE c.id::text = target_id AND auth.uid() IN (c.renter_id, c.owner_id)
      )
    )
  );

-- Same as before, plus: no blocked periods that are already over (they were not counted
-- in the limit of 50, so there was no limit on them at all).
CREATE OR REPLACE FUNCTION private.blocked_dates_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.created_at := now();
  IF auth.uid() IS NOT NULL AND NEW.end_date < private.today() THEN
    RAISE EXCEPTION 'Välj dagar från och med i dag.';
  END IF;
  IF (SELECT count(*) FROM public.listing_blocked_dates
       WHERE listing_id = NEW.listing_id AND end_date >= private.today()) >= 50 THEN
    RAISE EXCEPTION 'Högst 50 blockerade perioder per annons. Ta bort gamla först.';
  END IF;
  RETURN NEW;
END $$;

-- 4. Listings: publishing date and texts -------------------------------------------------------

-- Same as in 20261026120000_harden_permissions.sql, except that published_at becomes
-- "now" when a draft is published (it kept the date the draft was created).
CREATE OR REPLACE FUNCTION private.listings_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.rating := 0;
    NEW.review_count := 0;
    NEW.booking_count := 0;
    NEW.views_count := 0;
    NEW.clicks_count := 0;
    NEW.favorite_count := 0;
    NEW.share_count := 0;
    NEW.request_count := 0;
    NEW.service_fee_pct := 10;
    NEW.created_at := now();
    NEW.published_at := now();
    IF NEW.company_id IS NOT NULL AND NOT private.manages_company(NEW.company_id) THEN
      NEW.company_id := NULL;
    END IF;
  ELSE
    NEW.id := OLD.id;
    NEW.owner_id := OLD.owner_id;
    NEW.rating := OLD.rating;
    NEW.review_count := OLD.review_count;
    NEW.booking_count := OLD.booking_count;
    NEW.views_count := OLD.views_count;
    NEW.clicks_count := OLD.clicks_count;
    NEW.favorite_count := OLD.favorite_count;
    NEW.share_count := OLD.share_count;
    NEW.request_count := OLD.request_count;
    NEW.service_fee_pct := OLD.service_fee_pct;
    NEW.created_at := OLD.created_at;
    NEW.published_at := CASE WHEN OLD.status = 'draft' AND NEW.status = 'published'
                             THEN now() ELSE OLD.published_at END;
    IF NEW.company_id IS DISTINCT FROM OLD.company_id
       AND NEW.company_id IS NOT NULL AND NOT private.manages_company(NEW.company_id) THEN
      NEW.company_id := OLD.company_id;
    END IF;
  END IF;

  -- Only admins remove listings, and only admins bring them back.
  IF NOT private.is_admin() AND (
       (NEW.status = 'removed' AND (TG_OP = 'INSERT' OR OLD.status <> 'removed'))
    OR (TG_OP = 'UPDATE' AND OLD.status = 'removed' AND NEW.status <> 'removed')
  ) THEN
    RAISE EXCEPTION 'Bara administratörer kan ta bort eller återställa annonser';
  END IF;

  -- The seller name comes from the profile or company, never from the browser.
  IF NEW.company_id IS NOT NULL THEN
    SELECT name INTO NEW.owner_name FROM public.companies WHERE id = NEW.company_id;
    NEW.owner_type := 'company';
  ELSE
    NEW.owner_name := private.public_name(NEW.owner_id);
    NEW.owner_type := COALESCE(
      (SELECT account_type FROM public.profiles WHERE id = NEW.owner_id), 'private');
  END IF;

  RETURN NEW;
END $$;

-- Same as before; the message no longer suggests marking listings as sold.
CREATE OR REPLACE FUNCTION private.listings_rate_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user = 'postgres' AND auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF (SELECT count(*) FROM public.listings
       WHERE owner_id = NEW.owner_id AND created_at > now() - interval '24 hours') >= 20 THEN
    RAISE EXCEPTION 'Du har lagt upp många annonser i dag. Försök igen i morgon.';
  END IF;
  IF (SELECT count(*) FROM public.listings
       WHERE owner_id = NEW.owner_id AND status IN ('published', 'paused', 'draft')) >= 50 THEN
    RAISE EXCEPTION 'Du kan ha högst 50 annonser (publicerade, pausade och utkast). Ta bort några först.';
  END IF;
  RETURN NEW;
END $$;

-- 5. Deleting an account ---------------------------------------------------------------------------

-- Same as before, plus:
-- * not within 14 days after a finished rental either. The booking (with the rental agreement
--   and the condition photos) goes with the account, and the other person may need them if
--   something turns out to be broken. The same 14 days as for reviews.
-- * reviews the user wrote stay, but without their name.
-- The account page checks the same rules first (src/routes/_authenticated/konto.tsx).
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.bookings
     WHERE auth.uid() IN (renter_id, owner_id)
       AND status = 'confirmed' AND end_date >= private.today() - 14
  ) THEN
    RAISE EXCEPTION 'Du har bokningar som inte är avslutade. Avboka dem eller avsluta hyran under Bokningar först.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.bookings
     WHERE auth.uid() IN (renter_id, owner_id)
       AND status = 'completed'
       AND COALESCE((returned_at AT TIME ZONE 'Europe/Stockholm')::date, end_date) >= private.today() - 14
  ) THEN
    RAISE EXCEPTION 'Du har en hyra som avslutades för mindre än 14 dagar sedan. Kontot kan raderas när 14 dagar har gått, så att den du hyrde med har kvar avtalet och bilderna om något behöver redas ut.';
  END IF;
  UPDATE public.reviews SET author_name = 'Raderat konto' WHERE author_id = auth.uid();
  DELETE FROM auth.users WHERE id = auth.uid();
END $$;

-- 6. Who may call what ------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION private.saved_searches_limit() FROM PUBLIC, anon, authenticated;
