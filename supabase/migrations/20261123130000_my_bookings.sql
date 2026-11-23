-- The bookings page in one query, with a limit (docs/performance-review.md, step 5).
--
-- my_bookings() gets two changes:
-- 1. It also returns counterpart_id, the other person's user id (for the link to their profile).
--    The page used to fetch every booking a second time just to get those ids; both parties
--    could already read them.
-- 2. An optional _limit. The bookings page asks for the 300 most recent; without it (as when an
--    account is deleted) all bookings come back, as before.
--
-- Changing the columns a function returns needs DROP + CREATE. Calls without arguments still
-- work. Safe to run more than once. Tested locally with supabase/tests/permissions.test.mjs

DROP FUNCTION IF EXISTS public.my_bookings();

CREATE OR REPLACE FUNCTION public.my_bookings(_limit integer DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  listing_id uuid,
  listing_title text,
  listing_image text,
  listing_city text,
  cancellation_policy text,
  i_am_owner boolean,
  counterpart_id uuid,
  counterpart_name text,
  conversation_id uuid,
  status text,
  start_date date,
  end_date date,
  days integer,
  base_price numeric,
  delivery boolean,
  delivery_fee numeric,
  deposit numeric,
  total_price numeric,
  message text,
  picked_up_at timestamptz,
  returned_at timestamptz,
  pickup_photos text[],
  return_photos text[],
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.id, b.listing_id,
         COALESCE(l.title, 'Borttagen annons'), l.images[1], l.city,
         COALESCE(l.cancellation_policy, 'flexible'),
         COALESCE(b.owner_id = u.me, false),
         CASE WHEN b.owner_id = u.me THEN b.renter_id ELSE b.owner_id END,
         private.public_name(CASE WHEN b.owner_id = u.me THEN b.renter_id ELSE b.owner_id END),
         (SELECT c.id FROM public.conversations c WHERE c.listing_id = b.listing_id AND c.renter_id = b.renter_id),
         b.status::text, b.start_date, b.end_date, b.days, b.base_price, b.delivery, b.delivery_fee,
         b.deposit, b.total_price, b.message, b.picked_up_at, b.returned_at, b.pickup_photos,
         b.return_photos, b.created_at
    FROM (SELECT auth.uid() AS me) u
    JOIN public.bookings b ON u.me IN (b.renter_id, b.owner_id)
    LEFT JOIN public.listings l ON l.id = b.listing_id
   ORDER BY b.start_date DESC, b.created_at DESC
   LIMIT _limit
$$;

REVOKE ALL ON FUNCTION public.my_bookings(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_bookings(integer) TO authenticated;
