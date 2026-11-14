-- Performance package from the review on 2026-11-13 (docs/performance-review.md, step 2).
-- Nothing changes in what anyone can see or do; queries just stay fast as the data grows.
--
-- 1. Indexes for search and the home page (newest published rentals, per category). Without
--    them every search reads and sorts the whole listings table.
-- 2. Indexes on foreign keys that are cleared or cascaded when a booking, listing or account is
--    deleted. Without them Postgres scans all messages for every deleted booking, and deleting
--    the account of someone with many bookings takes longer than the API allows.
-- 3. Other indexes: the "Ledig" date filter, the header's count of booking requests to answer,
--    and saved searches.
-- 4. unavailable_listings() only looks at bookings that end in or after the period (same
--    result: a booking's last day is never after its end date).
-- 5. unread_conversation_count() counts unread conversations directly instead of building the
--    whole inbox (names, last message) first. Same result as before.
-- 6. listing_category_summary(): number of listings and the newest photo per category for the
--    home page, instead of downloading up to 1000 listings and counting them in the browser.
--
-- Safe to run more than once. Tested locally with supabase/tests/permissions.test.mjs

-- 1. Search and home page ------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS listings_published_rent_recent ON public.listings (published_at DESC)
  WHERE status = 'published' AND listing_type = 'rent';
CREATE INDEX IF NOT EXISTS listings_published_rent_category
  ON public.listings (category_slug, published_at DESC) INCLUDE (city)
  WHERE status = 'published' AND listing_type = 'rent';

-- 2. Foreign keys --------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS messages_booking ON public.messages (booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS reviews_booking ON public.reviews (booking_id);
CREATE INDEX IF NOT EXISTS reviews_listing ON public.reviews (listing_id);
CREATE INDEX IF NOT EXISTS favorites_listing ON public.favorites (listing_id);

-- 3. Other indexes -------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS bookings_taken_end ON public.bookings (end_date)
  WHERE status IN ('confirmed', 'completed');
CREATE INDEX IF NOT EXISTS listing_blocked_dates_end ON public.listing_blocked_dates (end_date);
CREATE INDEX IF NOT EXISTS bookings_owner_requested ON public.bookings (owner_id, start_date)
  WHERE status = 'requested';
CREATE INDEX IF NOT EXISTS saved_searches_user_created ON public.saved_searches (user_id, created_at DESC);

-- 4. "Ledig" filter in search --------------------------------------------------------------------

-- Same as in 20261101150000_rental_flow.sql, plus b.end_date >= _start, which the index above
-- can use (booking_last_day() is never later than end_date, so the result is the same).
CREATE OR REPLACE FUNCTION public.unavailable_listings(_start date, _end date)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.listing_id FROM public.bookings b JOIN public.listings l ON l.id = b.listing_id
   WHERE _end - _start BETWEEN 0 AND 366 AND l.status = 'published'
     AND b.status IN ('confirmed', 'completed') AND b.start_date <= _end
     AND b.end_date >= _start
     AND private.booking_last_day(b.status, b.end_date, b.returned_at) >= _start
  UNION
  SELECT d.listing_id FROM public.listing_blocked_dates d JOIN public.listings l ON l.id = d.listing_id
   WHERE _end - _start BETWEEN 0 AND 366 AND l.status = 'published'
     AND d.start_date <= _end AND d.end_date >= _start
$$;

-- 5. Unread count in the header ------------------------------------------------------------------

-- Same rule as the unread column of my_conversations() (20261028120000_messaging.sql): a message
-- from someone else after the time I last read the conversation.
CREATE OR REPLACE FUNCTION public.unread_conversation_count()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int
    FROM public.conversations c, (SELECT auth.uid() AS me) u
   WHERE u.me IN (c.renter_id, c.owner_id)
     AND EXISTS (
       SELECT 1 FROM public.messages m
        WHERE m.conversation_id = c.id
          AND m.sender_id IS DISTINCT FROM u.me
          AND m.created_at > CASE WHEN c.owner_id = u.me THEN c.owner_last_read_at ELSE c.renter_last_read_at END
     )
$$;

REVOKE ALL ON FUNCTION public.unread_conversation_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unread_conversation_count() TO authenticated;

-- 6. Categories on the home page -----------------------------------------------------------------

-- Published rentals per category in the given municipalities (the site passes Stockholm county's
-- list from src/lib/geo.ts), with the first photo of the newest listing that has one. Runs with
-- the caller's rights, so it counts exactly the listings the caller could read.
CREATE OR REPLACE FUNCTION public.listing_category_summary(_cities text[])
RETURNS TABLE (category_slug text, listing_count integer, image text)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH counts AS (
    SELECT l.category_slug, count(*)::int AS listing_count
      FROM public.listings l
     WHERE l.status = 'published' AND l.listing_type = 'rent' AND l.city = ANY (_cities)
     GROUP BY l.category_slug
  )
  SELECT c.category_slug,
         c.listing_count,
         (SELECT l.images[1]
            FROM public.listings l
           WHERE l.category_slug = c.category_slug
             AND l.status = 'published' AND l.listing_type = 'rent' AND l.city = ANY (_cities)
             AND cardinality(l.images) > 0
           ORDER BY l.published_at DESC
           LIMIT 1)
    FROM counts c
$$;

REVOKE ALL ON FUNCTION public.listing_category_summary(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listing_category_summary(text[]) TO anon, authenticated;
