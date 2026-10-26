-- Harden database permissions (task 1 in docs/mvp-plan.md).
--
-- The browser talks straight to Supabase, so these rules are the site's only
-- protection. Columns that only the platform may set (verification, ratings,
-- counters, seller name) are guarded by triggers: when a visitor tries to change
-- them, the old value (or the default) is kept, so existing app code keeps working.
-- Statements run by the platform itself (SQL editor, service role, SECURITY DEFINER
-- functions such as place_offer) are not affected by the triggers.
--
-- Safe to run more than once. Tested locally with supabase/tests/permissions.test.mjs
-- (npm run test:db).

-- 1. Helpers in a schema the API does not expose ----------------------------

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
$$;

-- Public seller name: first name + initial of the last name ("Anna Svensson" -> "Anna S.").
CREATE OR REPLACE FUNCTION private.public_name(_user_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  parts text[];
BEGIN
  SELECT regexp_split_to_array(btrim(full_name), '\s+') INTO parts
    FROM public.profiles WHERE id = _user_id;
  IF parts IS NULL OR parts[1] = '' THEN RETURN 'Privatperson'; END IF;
  IF array_length(parts, 1) = 1 THEN RETURN parts[1]; END IF;
  RETURN parts[1] || ' ' || upper(left(parts[array_length(parts, 1)], 1)) || '.';
END $$;

CREATE OR REPLACE FUNCTION private.manages_company(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.companies WHERE id = _company_id AND owner_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.company_admins WHERE company_id = _company_id AND user_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION private.booking_overlaps(_listing_id uuid, _start date, _end date, _exclude uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
     WHERE b.listing_id = _listing_id
       AND b.status IN ('confirmed', 'completed')
       AND b.start_date <= _end AND b.end_date >= _start
       AND (_exclude IS NULL OR b.id <> _exclude)
  )
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  private.is_admin(),
  private.public_name(uuid),
  private.manages_company(uuid),
  private.booking_overlaps(uuid, date, date, uuid)
TO authenticated;

-- has_role(any_user, role) let anyone check who is an admin. Policies use is_admin() instead.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated;

-- 2. Baseline: visitors who are not logged in never write ---------------------

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM authenticated;
-- Same for tables created later (Supabase grants everything to anon by default).
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon;

-- 3. Profiles: private to the user (and admins); protected fields ------------

DROP POLICY IF EXISTS "profiles_public_read" ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_write" ON public.profiles;
REVOKE ALL ON public.profiles FROM anon;
REVOKE INSERT, DELETE ON public.profiles FROM authenticated;

DROP POLICY IF EXISTS "profiles_self_read" ON public.profiles;
CREATE POLICY "profiles_self_read" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());
DROP POLICY IF EXISTS "profiles_admin_read" ON public.profiles;
CREATE POLICY "profiles_admin_read" ON public.profiles FOR SELECT TO authenticated
  USING (private.is_admin());
DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION private.profiles_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN RETURN NEW; END IF;
  NEW.id := OLD.id;
  NEW.email_verified := OLD.email_verified;
  NEW.id_verified := OLD.id_verified;
  NEW.phone_verified := OLD.phone_verified AND NEW.phone IS NOT DISTINCT FROM OLD.phone;
  NEW.rating := OLD.rating;
  NEW.review_count := OLD.review_count;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER profiles_guard BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.profiles_guard();

-- Keep the seller name on listings in step with the profile.
CREATE OR REPLACE FUNCTION private.profiles_sync_listings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.listings
     SET owner_name = private.public_name(NEW.id), owner_type = NEW.account_type
   WHERE owner_id = NEW.id AND company_id IS NULL;
  RETURN NULL;
END $$;

CREATE OR REPLACE TRIGGER profiles_sync_listings AFTER UPDATE OF full_name, account_type ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.profiles_sync_listings();

-- 4. Companies: "verified" is set by the platform only -----------------------

CREATE OR REPLACE FUNCTION private.companies_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.verified := false;
    NEW.created_at := now();
  ELSE
    NEW.id := OLD.id;
    NEW.verified := OLD.verified;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER companies_guard BEFORE INSERT OR UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION private.companies_guard();

DROP POLICY IF EXISTS "company_admins_read" ON public.company_admins;
CREATE POLICY "company_admins_read" ON public.company_admins FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.owner_id = auth.uid())
  );

-- 5. Listings: owners edit content, the platform owns the rest ----------------

ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_status_check;
ALTER TABLE public.listings
  ADD CONSTRAINT listings_status_check
  CHECK (status IN ('draft', 'published', 'paused', 'sold', 'removed'));

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
    NEW.published_at := OLD.published_at;
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

CREATE OR REPLACE TRIGGER listings_guard BEFORE INSERT OR UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION private.listings_guard();

-- 6. Reviews: read-only for now (not part of the first version) ---------------

DROP POLICY IF EXISTS "reviews_author_write" ON public.reviews;
REVOKE INSERT, UPDATE, DELETE ON public.reviews FROM authenticated;

-- 7. Bookings: the database decides owner, status and dates ------------------

REVOKE ALL ON public.bookings FROM anon;
REVOKE DELETE ON public.bookings FROM authenticated;

DROP POLICY IF EXISTS "bookings_party_update" ON public.bookings;
CREATE POLICY "bookings_party_update" ON public.bookings FOR UPDATE TO authenticated
  USING (auth.uid() = renter_id OR auth.uid() = owner_id)
  WITH CHECK (auth.uid() = renter_id OR auth.uid() = owner_id);

CREATE OR REPLACE FUNCTION private.bookings_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  l record;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT id, owner_id, instant_book, status INTO l FROM public.listings WHERE id = NEW.listing_id;
    IF NOT FOUND OR l.status <> 'published' THEN
      RAISE EXCEPTION 'Annonsen går inte att boka';
    END IF;
    IF l.owner_id IS NULL THEN
      RAISE EXCEPTION 'Exempelannonser kan inte bokas';
    END IF;
    IF l.owner_id = v_uid THEN
      RAISE EXCEPTION 'Du kan inte boka din egen annons';
    END IF;
    IF NEW.end_date < NEW.start_date THEN
      RAISE EXCEPTION 'Slutdatum är före startdatum';
    END IF;
    NEW.renter_id := v_uid;
    NEW.owner_id := l.owner_id;
    NEW.days := NEW.end_date - NEW.start_date + 1;
    NEW.status := CASE WHEN l.instant_book THEN 'confirmed' ELSE 'requested' END::public.booking_status;
    NEW.created_at := now();
    IF NEW.status = 'confirmed'
       AND private.booking_overlaps(NEW.listing_id, NEW.start_date, NEW.end_date, NULL) THEN
      RAISE EXCEPTION 'Datumen är redan bokade';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: only the status may change, and only along allowed paths.
  NEW.id := OLD.id;
  NEW.listing_id := OLD.listing_id;
  NEW.renter_id := OLD.renter_id;
  NEW.owner_id := OLD.owner_id;
  NEW.start_date := OLD.start_date;
  NEW.end_date := OLD.end_date;
  NEW.days := OLD.days;
  NEW.base_price := OLD.base_price;
  NEW.service_fee := OLD.service_fee;
  NEW.delivery_fee := OLD.delivery_fee;
  NEW.insurance_fee := OLD.insurance_fee;
  NEW.deposit := OLD.deposit;
  NEW.total_price := OLD.total_price;
  NEW.delivery := OLD.delivery;
  NEW.message := OLD.message;
  NEW.created_at := OLD.created_at;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
         (OLD.status IN ('requested', 'confirmed') AND NEW.status = 'cancelled')
      OR (v_uid = OLD.owner_id AND OLD.status = 'requested' AND NEW.status IN ('confirmed', 'declined'))
      OR (v_uid = OLD.owner_id AND OLD.status = 'confirmed' AND NEW.status = 'completed')
    ) THEN
      RAISE EXCEPTION 'Ogiltig statusändring för bokningen';
    END IF;
    IF NEW.status = 'confirmed'
       AND private.booking_overlaps(OLD.listing_id, OLD.start_date, OLD.end_date, OLD.id) THEN
      RAISE EXCEPTION 'Datumen är redan bokade';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER bookings_guard BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION private.bookings_guard();

-- 8. Offers: only through place_offer / respond_offer -------------------------

DROP POLICY IF EXISTS "offers_party_insert" ON public.offers;
DROP POLICY IF EXISTS "offers_party_update" ON public.offers;
REVOKE INSERT, UPDATE, DELETE ON public.offers FROM authenticated;

-- Same as before, plus: the listing must be published and have an owner, the dates
-- must make sense, the number of days is calculated here, and an auto-accept never
-- double-books dates that are already taken.
CREATE OR REPLACE FUNCTION public.place_offer(
  _listing_id uuid,
  _start date,
  _end date,
  _days integer,
  _list_total numeric,
  _amount numeric,
  _message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  l public.listings%ROWTYPE;
  s public.listing_offer_settings%ROWTYPE;
  v_uid uuid := auth.uid();
  v_days integer;
  v_expires timestamptz;
  v_min numeric;
  v_below boolean := false;
  v_auto boolean := false;
  v_offer_id uuid;
  v_booking_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  PERFORM public.expire_stale_offers();

  SELECT * INTO l FROM public.listings WHERE id = _listing_id;
  IF NOT FOUND OR l.status <> 'published' THEN RAISE EXCEPTION 'Listing not found'; END IF;
  IF l.owner_id IS NULL THEN RAISE EXCEPTION 'Demo listings do not accept offers'; END IF;
  IF NOT l.allow_offers THEN RAISE EXCEPTION 'Listing does not accept offers'; END IF;
  IF l.owner_id = v_uid THEN RAISE EXCEPTION 'Cannot bid on your own listing'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  IF _start IS NULL OR _end IS NULL OR _end < _start THEN RAISE EXCEPTION 'Invalid dates'; END IF;
  v_days := _end - _start + 1;

  SELECT * INTO s FROM public.listing_offer_settings WHERE listing_id = _listing_id;

  v_min := COALESCE(s.min_offer_total, CASE WHEN s.min_offer_per_day IS NOT NULL
             THEN s.min_offer_per_day * v_days END);
  IF v_min IS NOT NULL AND _amount < v_min THEN v_below := true; END IF;
  IF s.auto_accept_total IS NOT NULL AND _amount >= s.auto_accept_total
     AND NOT private.booking_overlaps(_listing_id, _start, _end, NULL) THEN
    v_auto := true;
  END IF;

  IF l.offer_validity_hours > 0 THEN
    v_expires := now() + make_interval(hours => l.offer_validity_hours);
  END IF;

  INSERT INTO public.offers (listing_id, renter_id, owner_id, actor, start_date, end_date,
                             days, list_total, amount, message, status, expires_at)
  VALUES (_listing_id, v_uid, l.owner_id, 'renter', _start, _end, v_days,
          _list_total, _amount, _message,
          CASE WHEN v_auto THEN 'accepted'::public.offer_status ELSE 'active'::public.offer_status END,
          v_expires)
  RETURNING id INTO v_offer_id;

  IF v_auto THEN
    INSERT INTO public.bookings (listing_id, renter_id, owner_id, start_date, end_date, days,
                                 base_price, total_price, deposit, status, message)
    VALUES (_listing_id, v_uid, l.owner_id, _start, _end, v_days,
            _amount, _amount, COALESCE(l.deposit,0), 'confirmed',
            'Pris överenskommet via budgivning')
    RETURNING id INTO v_booking_id;

    UPDATE public.offers SET booking_id = v_booking_id WHERE id = v_offer_id;
  END IF;

  RETURN jsonb_build_object(
    'offer_id', v_offer_id,
    'status', CASE WHEN v_auto THEN 'accepted' ELSE 'active' END,
    'auto_accepted', v_auto,
    'below_minimum', v_below,
    'booking_id', v_booking_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.place_offer(uuid, date, date, integer, numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_offer(uuid, date, date, integer, numeric, numeric, text) TO authenticated;

-- 9. Conversations and messages ----------------------------------------------

DROP POLICY IF EXISTS "conversations_party" ON public.conversations;
REVOKE UPDATE, DELETE ON public.conversations FROM authenticated;

DROP POLICY IF EXISTS "conversations_party_read" ON public.conversations;
CREATE POLICY "conversations_party_read" ON public.conversations FOR SELECT TO authenticated
  USING (auth.uid() = renter_id OR auth.uid() = owner_id);

-- A conversation is started by the buyer/renter about a published listing,
-- with that listing's owner.
DROP POLICY IF EXISTS "conversations_start" ON public.conversations;
CREATE POLICY "conversations_start" ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (
    renter_id = auth.uid()
    AND owner_id <> renter_id
    AND listing_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.listings l
       WHERE l.id = conversations.listing_id
         AND l.owner_id = conversations.owner_id
         AND l.status = 'published'
    )
  );

-- Visitors send plain text. Booking, system and offer messages come from the platform.
DROP POLICY IF EXISTS "messages_party_insert" ON public.messages;
REVOKE UPDATE, DELETE ON public.messages FROM authenticated;

CREATE POLICY "messages_party_insert" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND kind = 'text'
    AND offer_id IS NULL
    AND image_url IS NULL
    AND EXISTS (
      SELECT 1 FROM public.conversations c
       WHERE c.id = conversation_id AND (c.renter_id = auth.uid() OR c.owner_id = auth.uid())
    )
  );

-- 10. Reports -----------------------------------------------------------------

DROP POLICY IF EXISTS "reports_self_read" ON public.reports;
DROP POLICY IF EXISTS "reports_insert" ON public.reports;
REVOKE UPDATE, DELETE ON public.reports FROM authenticated;

CREATE POLICY "reports_self_read" ON public.reports FOR SELECT TO authenticated
  USING (auth.uid() = reporter_id OR private.is_admin());
CREATE POLICY "reports_insert" ON public.reports FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = reporter_id
    AND status = 'open'
    AND target_type IN ('listing', 'user', 'message')
    AND char_length(reason) BETWEEN 1 AND 200
    AND char_length(COALESCE(details, '')) <= 2000
  );

-- 11. Roles: users can read their own roles, never write them ------------------

REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated;

-- 12. Trigger functions are not callable directly by anyone -------------------

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon;
