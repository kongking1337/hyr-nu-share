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
-- 4. A draft gets its publishing date when it is first published (search sorts by it),
--    and texts that still talked about selling.
-- 5. Deleting an account: not during or right after a rental, and the name stored on
--    reviews the user wrote is removed.
-- 6. The browser can't choose when a message or report was written. It could, so the
--    spam limits (which count recent rows) and the admin's report emails could be
--    bypassed, and a message dated far in the future stayed unread at the top of an inbox.
--    Reporters also no longer see which admin handled their report.
-- 7. At most one report email to the admin per 15 minutes.
-- 8. Indexes, so that inboxes and public profiles stay fast when there are many messages
--    (public_profile can be called without logging in).
-- 9. A block lets messages through only until a week after the booked days, not as long
--    as a booking stays unfinished.
-- 10. Listings: the 50-listing limit also applies when old listings are reactivated,
--     limits on the remaining price fields, and listings hidden by moderators can't be
--     deleted by their owner (the trust score counts them).
-- 11. Condition photos can't be overwritten, and not deleted while the rental is going on
--     or for 14 days after it.
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
-- "now" when a draft is published for the first time (it kept the date the draft was
-- created). Only the first time, so going back to draft can't move a listing to the top.
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
                                  AND OLD.published_at <= OLD.created_at
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
-- * not within 60 days after the end while a handed-over item isn't marked as returned.
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
  -- The item was handed over but never marked as returned: two months to sort it out.
  IF EXISTS (
    SELECT 1 FROM public.bookings
     WHERE auth.uid() IN (renter_id, owner_id)
       AND status = 'confirmed' AND picked_up_at IS NOT NULL AND returned_at IS NULL
       AND end_date >= private.today() - 60
  ) THEN
    RAISE EXCEPTION 'Du har en hyra där saken inte är markerad som återlämnad. Uthyraren markerar det under Bokningar. Kontakta oss om det inte går.';
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

-- 6. Messages and reports: the browser only sends the content ------------------------------------
-- (created_at, read and notification state, moderation fields come from the database)

REVOKE INSERT ON public.messages FROM authenticated;
GRANT INSERT (conversation_id, sender_id, body) ON public.messages TO authenticated;

REVOKE INSERT ON public.reports FROM authenticated;
GRANT INSERT (reporter_id, target_type, target_id, reason, details) ON public.reports TO authenticated;

-- Reporters see the outcome of their report, but not which admin handled it.
REVOKE SELECT ON public.reports FROM authenticated;
GRANT SELECT (id, reporter_id, target_type, target_id, reason, details, status, resolution,
              resolved_at, created_at)
  ON public.reports TO authenticated;

-- 7. At most one report email to the admin per 15 minutes ----------------------------------------

CREATE TABLE IF NOT EXISTS private.email_throttle (
  kind text PRIMARY KEY,
  last_sent timestamptz NOT NULL
);
REVOKE ALL ON private.email_throttle FROM PUBLIC, anon, authenticated;

-- Same as before, plus the throttle. The admin still sees every report in /admin.
CREATE OR REPLACE FUNCTION public.claim_report_notification(_report_id uuid, _reporter uuid)
RETURNS TABLE (reason text, target_type text, open_reports integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.reports%ROWTYPE;
  v_ok boolean;
BEGIN
  SELECT * INTO r FROM public.reports
   WHERE reports.id = _report_id AND reports.reporter_id = _reporter
     AND reports.status = 'open' AND reports.notified_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE public.reports SET notified_at = now() WHERE reports.id = r.id;
  IF EXISTS (
    SELECT 1 FROM public.reports o
     WHERE o.target_type = r.target_type AND o.target_id = r.target_id
       AND o.status = 'open' AND o.id <> r.id AND o.notified_at IS NOT NULL
  ) THEN
    RETURN;
  END IF;
  INSERT INTO private.email_throttle AS t (kind, last_sent) VALUES ('admin_report', now())
  ON CONFLICT (kind) DO UPDATE SET last_sent = now()
   WHERE t.last_sent < now() - interval '15 minutes'
  RETURNING true INTO v_ok;
  IF v_ok IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT r.reason, r.target_type, (SELECT count(*)::int FROM public.reports o WHERE o.status = 'open');
END $$;

-- 8. Indexes ------------------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS messages_conversation_created ON public.messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS messages_sender_created ON public.messages (sender_id, created_at);
CREATE INDEX IF NOT EXISTS conversations_owner_created ON public.conversations (owner_id, created_at);
CREATE INDEX IF NOT EXISTS conversations_renter_created ON public.conversations (renter_id, created_at);
CREATE INDEX IF NOT EXISTS listings_owner_created ON public.listings (owner_id, created_at);
CREATE INDEX IF NOT EXISTS bookings_renter ON public.bookings (renter_id);
CREATE INDEX IF NOT EXISTS bookings_owner ON public.bookings (owner_id);
CREATE INDEX IF NOT EXISTS reports_reporter_created ON public.reports (reporter_id, created_at);
CREATE INDEX IF NOT EXISTS reviews_author ON public.reviews (author_id);

-- 9. Blocks: messages during a rental only until a week after the booked days ---------------------

-- Same as in 20261101180000_trust.sql, except that a confirmed booking whose days ended more
-- than a week ago no longer opens the block (it stays "confirmed" if nobody marks it returned).
CREATE OR REPLACE FUNCTION private.messages_user_block_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c record;
BEGIN
  -- Booking updates (cancel, return …) still go through; ordinary messages don't.
  IF NEW.sender_id IS NULL OR NEW.kind <> 'text' THEN RETURN NEW; END IF;
  SELECT renter_id, owner_id INTO c FROM public.conversations WHERE id = NEW.conversation_id;
  IF private.blocked_between(c.renter_id, c.owner_id) AND NOT EXISTS (
    SELECT 1 FROM public.bookings b
     WHERE b.status = 'confirmed' AND b.end_date >= private.today() - 7
       AND ((b.renter_id = c.renter_id AND b.owner_id = c.owner_id)
         OR (b.renter_id = c.owner_id AND b.owner_id = c.renter_id))
  ) THEN
    RAISE EXCEPTION 'Du kan inte skicka meddelanden i den här konversationen';
  END IF;
  RETURN NEW;
END $$;

-- 10. Listings: reactivation limit, price limits, moderated listings stay -------------------------

-- The limit of 50 was only checked for new listings, so parking listings as "sold" and
-- bringing them back got around it.
CREATE OR REPLACE FUNCTION private.listings_active_cap()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (session_user = 'postgres' AND auth.uid() IS NULL) OR private.is_admin() THEN RETURN NEW; END IF;
  IF NEW.status IN ('published', 'paused', 'draft') AND OLD.status NOT IN ('published', 'paused', 'draft')
     AND (SELECT count(*) FROM public.listings
           WHERE owner_id = NEW.owner_id AND status IN ('published', 'paused', 'draft')) >= 50 THEN
    RAISE EXCEPTION 'Du kan ha högst 50 annonser (publicerade, pausade och utkast). Ta bort några först.';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER listings_active_cap BEFORE UPDATE OF status ON public.listings
  FOR EACH ROW WHEN (NEW.owner_id IS NOT NULL) EXECUTE FUNCTION private.listings_active_cap();

ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_more_price_limits;
ALTER TABLE public.listings ADD CONSTRAINT listings_more_price_limits CHECK (
  COALESCE(price_hour, 0) BETWEEN 0 AND 1000000
  AND COALESCE(price_month, 0) BETWEEN 0 AND 10000000
  AND COALESCE(insurance_fee, 0) BETWEEN 0 AND 1000000
) NOT VALID;

-- Same as in 20261101180000_trust.sql, plus: a listing hidden by the moderators stays (the
-- trust score counts hidden listings, and the owner could otherwise wipe that history).
CREATE OR REPLACE FUNCTION private.listings_delete_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF OLD.status = 'removed' THEN
      RAISE EXCEPTION 'Annonsen är dold av Hyrkolls moderatorer och kan inte tas bort.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.bookings
       WHERE listing_id = OLD.id
         AND (status IN ('confirmed', 'completed') OR (status = 'requested' AND end_date >= (now() AT TIME ZONE 'Europe/Stockholm')::date))
    ) THEN
      RAISE EXCEPTION 'Annonsen har bokningar och kan inte tas bort. Pausa den i stället.';
    END IF;
  END IF;
  RETURN OLD;
END $$;

-- 11. Condition photos are kept while they matter ------------------------------------------------------

-- Is the photo part of a rental that is going on or ended less than 14 days ago?
CREATE OR REPLACE FUNCTION private.photo_in_booking(_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
     WHERE (b.pickup_photos @> ARRAY[_path] OR b.return_photos @> ARRAY[_path])
       AND (b.status = 'confirmed'
         OR (b.status = 'completed' AND COALESCE(b.returned_at, now()) > now() - interval '14 days'))
  )
$$;

CREATE INDEX IF NOT EXISTS bookings_pickup_photos ON public.bookings USING gin (pickup_photos);
CREATE INDEX IF NOT EXISTS bookings_return_photos ON public.bookings USING gin (return_photos);

-- Uploads always get a new name, so nothing needs to overwrite a file.
DROP POLICY IF EXISTS "listing_images_own_update" ON storage.objects;

DROP POLICY IF EXISTS "listing_images_own_delete" ON storage.objects;
CREATE POLICY "listing_images_own_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'listing-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND NOT private.photo_in_booking(name)
  );

-- 12. Who may call what ------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION
  private.saved_searches_limit(),
  private.listings_active_cap()
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.photo_in_booking(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.photo_in_booking(text) TO authenticated;
