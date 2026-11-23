-- Faster row level security (performance review, docs/performance-review.md).
-- Nothing changes in who can see or do what; the rules are the same, they are just cheaper.
--
-- The policies below called auth.uid() and private.is_admin() directly, so Postgres ran them
-- once for every row it checked. Written as (select auth.uid()) and (select private.is_admin())
-- they run once per query instead (an "InitPlan"). Both functions are STABLE, so they give the
-- same answer for every row of a query and the result is the same.
--
-- Every policy on a table in schema public that used one of them is recreated here with the same
-- name, command, roles and expression, only with that wrapper. The expressions were taken from
-- the policies as they stand after 20261114120000_performance.sql. The policies on
-- storage.objects are left as they are.
--
-- Safe to run more than once. Tested locally with supabase/tests/permissions.test.mjs

-- bookings ---------------------------------------------------------------------------------------

DROP POLICY IF EXISTS "bookings_party_read" ON public.bookings;
CREATE POLICY "bookings_party_read" ON public.bookings
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((select auth.uid()) = renter_id) OR ((select auth.uid()) = owner_id));
DROP POLICY IF EXISTS "bookings_party_update" ON public.bookings;
CREATE POLICY "bookings_party_update" ON public.bookings
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((select auth.uid()) = renter_id) OR ((select auth.uid()) = owner_id))
  WITH CHECK (((select auth.uid()) = renter_id) OR ((select auth.uid()) = owner_id));
DROP POLICY IF EXISTS "bookings_renter_insert" ON public.bookings;
CREATE POLICY "bookings_renter_insert" ON public.bookings
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = renter_id);

-- companies --------------------------------------------------------------------------------------

DROP POLICY IF EXISTS "companies_owner_write" ON public.companies;
CREATE POLICY "companies_owner_write" ON public.companies
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((select auth.uid()) = owner_id)
  WITH CHECK ((select auth.uid()) = owner_id);

-- company_admins ---------------------------------------------------------------------------------

DROP POLICY IF EXISTS "company_admins_owner_write" ON public.company_admins;
CREATE POLICY "company_admins_owner_write" ON public.company_admins
  AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.companies c WHERE ((c.id = company_admins.company_id) AND
    (c.owner_id = (select auth.uid())))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.companies c WHERE ((c.id = company_admins.company_id) AND
    (c.owner_id = (select auth.uid())))));
DROP POLICY IF EXISTS "company_admins_read" ON public.company_admins;
CREATE POLICY "company_admins_read" ON public.company_admins
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = (select auth.uid())) OR
    (EXISTS (SELECT 1 FROM public.companies c WHERE ((c.id = company_admins.company_id) AND
    (c.owner_id = (select auth.uid()))))));

-- conversations ----------------------------------------------------------------------------------

DROP POLICY IF EXISTS "conversations_party_read" ON public.conversations;
CREATE POLICY "conversations_party_read" ON public.conversations
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((select auth.uid()) = renter_id) OR ((select auth.uid()) = owner_id));

-- favorites --------------------------------------------------------------------------------------

DROP POLICY IF EXISTS "favorites_self" ON public.favorites;
CREATE POLICY "favorites_self" ON public.favorites
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- listing_blocked_dates --------------------------------------------------------------------------

DROP POLICY IF EXISTS "blocked_dates_owner" ON public.listing_blocked_dates;
CREATE POLICY "blocked_dates_owner" ON public.listing_blocked_dates
  AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.listings l WHERE ((l.id = listing_blocked_dates.listing_id)
    AND (l.owner_id = (select auth.uid())))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.listings l WHERE ((l.id =
    listing_blocked_dates.listing_id) AND (l.owner_id = (select auth.uid())))));

-- listing_offer_settings -------------------------------------------------------------------------

DROP POLICY IF EXISTS "offer_settings_owner_all" ON public.listing_offer_settings;
CREATE POLICY "offer_settings_owner_all" ON public.listing_offer_settings
  AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.listings l WHERE ((l.id = listing_offer_settings.listing_id)
    AND (l.owner_id = (select auth.uid())))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.listings l WHERE ((l.id =
    listing_offer_settings.listing_id) AND (l.owner_id = (select auth.uid())))));

-- listings ---------------------------------------------------------------------------------------

DROP POLICY IF EXISTS "listings_owner_read" ON public.listings;
CREATE POLICY "listings_owner_read" ON public.listings
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((select auth.uid()) = owner_id);
DROP POLICY IF EXISTS "listings_owner_write" ON public.listings;
CREATE POLICY "listings_owner_write" ON public.listings
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((select auth.uid()) = owner_id)
  WITH CHECK ((select auth.uid()) = owner_id);

-- messages ---------------------------------------------------------------------------------------

DROP POLICY IF EXISTS "messages_party_insert" ON public.messages;
CREATE POLICY "messages_party_insert" ON public.messages
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((sender_id = (select auth.uid())) AND (kind = 'text'::text) AND (offer_id IS NULL) AND
    (booking_id IS NULL) AND (image_url IS NULL) AND
    (EXISTS (SELECT 1 FROM public.conversations c WHERE ((c.id = messages.conversation_id) AND
    ((c.renter_id = (select auth.uid())) OR (c.owner_id = (select auth.uid())))))));
DROP POLICY IF EXISTS "messages_party_read" ON public.messages;
CREATE POLICY "messages_party_read" ON public.messages
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.conversations c WHERE ((c.id = messages.conversation_id) AND
    ((c.renter_id = (select auth.uid())) OR (c.owner_id = (select auth.uid()))))));

-- offers -----------------------------------------------------------------------------------------

DROP POLICY IF EXISTS "offers_party_read" ON public.offers;
CREATE POLICY "offers_party_read" ON public.offers
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((select auth.uid()) = renter_id) OR ((select auth.uid()) = owner_id));

-- profiles ---------------------------------------------------------------------------------------

DROP POLICY IF EXISTS "profiles_admin_read" ON public.profiles;
CREATE POLICY "profiles_admin_read" ON public.profiles
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((select private.is_admin()));
DROP POLICY IF EXISTS "profiles_self_read" ON public.profiles;
CREATE POLICY "profiles_self_read" ON public.profiles
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (id = (select auth.uid()));
DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;
CREATE POLICY "profiles_self_update" ON public.profiles
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

-- reports ----------------------------------------------------------------------------------------

DROP POLICY IF EXISTS "reports_insert" ON public.reports;
CREATE POLICY "reports_insert" ON public.reports
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((select auth.uid()) = reporter_id) AND (status = 'open'::text) AND
    (resolved_at IS NULL) AND (resolved_by IS NULL) AND (resolution IS NULL) AND
    (notified_at IS NULL) AND
    (target_type = ANY (ARRAY['listing'::text, 'user'::text, 'message'::text,
    'conversation'::text])) AND (char_length(target_id) <= 100) AND ((char_length(reason) >= 1) AND
    (char_length(reason) <= 200)) AND (char_length(COALESCE(details, ''::text)) <= 2000) AND
    ((target_type <> 'conversation'::text) OR
    (EXISTS (SELECT 1 FROM public.conversations c WHERE (((c.id)::text = reports.target_id) AND
    (((select auth.uid()) = c.renter_id) OR ((select auth.uid()) = c.owner_id)))))));
DROP POLICY IF EXISTS "reports_self_read" ON public.reports;
CREATE POLICY "reports_self_read" ON public.reports
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((select auth.uid()) = reporter_id) OR (select private.is_admin()));

-- reviews ----------------------------------------------------------------------------------------

DROP POLICY IF EXISTS "reviews_own_read" ON public.reviews;
CREATE POLICY "reviews_own_read" ON public.reviews
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((author_id = (select auth.uid())) OR (select private.is_admin()));

-- saved_searches ---------------------------------------------------------------------------------

DROP POLICY IF EXISTS "saved_searches_self" ON public.saved_searches;
CREATE POLICY "saved_searches_self" ON public.saved_searches
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- user_blocks ------------------------------------------------------------------------------------

DROP POLICY IF EXISTS "user_blocks_own" ON public.user_blocks;
CREATE POLICY "user_blocks_own" ON public.user_blocks
  AS PERMISSIVE FOR ALL TO authenticated
  USING (blocker_id = (select auth.uid()))
  WITH CHECK (blocker_id = (select auth.uid()));

-- user_roles -------------------------------------------------------------------------------------

DROP POLICY IF EXISTS "roles_self_read" ON public.user_roles;
CREATE POLICY "roles_self_read" ON public.user_roles
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);
