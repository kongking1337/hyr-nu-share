-- Booking dates (phase 1 in docs/mvp-plan.md): booking requests, an availability
-- calendar, pickup and return, and rental rules per listing.
--
-- Renters ask for dates with request_booking(); the owner accepts or declines with
-- respond_booking(), which also handles cancelling, pickup and return. Every step
-- posts a message in the conversation between the two. Bookings are only written
-- through these functions, never directly from the browser. Payment is still agreed
-- directly between the two people: nothing here handles money. Dates follow Stockholm
-- time (private.today()). Bidding (place_offer / respond_offer) is switched off: it is
-- hidden from the site and doesn't follow these rules.
-- Safe to run more than once.

-- 1. Rental rules on listings ---------------------------------------------------------

-- Today in Stockholm (the database clock runs in UTC).
CREATE OR REPLACE FUNCTION private.today()
RETURNS date LANGUAGE sql STABLE AS $$
  SELECT (now() AT TIME ZONE 'Europe/Stockholm')::date
$$;

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS min_days integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS included text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS rental_rules text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS cancellation_policy text NOT NULL DEFAULT 'flexible';

ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_rental_rules;
ALTER TABLE public.listings ADD CONSTRAINT listings_rental_rules CHECK (
  min_days BETWEEN 1 AND 30
  AND char_length(included) <= 1000
  AND char_length(rental_rules) <= 1000
  AND cancellation_policy IN ('flexible', 'moderate', 'strict')
  AND COALESCE(delivery_fee, 0) BETWEEN 0 AND 100000
) NOT VALID;

-- 2. Days the owner blocks (holiday, own use) --------------------------------------------

CREATE TABLE IF NOT EXISTS public.listing_blocked_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT listing_blocked_dates_range CHECK (end_date >= start_date AND end_date - start_date <= 366)
);
CREATE INDEX IF NOT EXISTS listing_blocked_dates_listing ON public.listing_blocked_dates (listing_id, end_date);

ALTER TABLE public.listing_blocked_dates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.listing_blocked_dates FROM anon;
REVOKE UPDATE, TRUNCATE ON public.listing_blocked_dates FROM authenticated;

DROP POLICY IF EXISTS "blocked_dates_owner" ON public.listing_blocked_dates;
CREATE POLICY "blocked_dates_owner" ON public.listing_blocked_dates FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_id AND l.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_id AND l.owner_id = auth.uid()));

CREATE OR REPLACE FUNCTION private.blocked_dates_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.created_at := now();
  IF (SELECT count(*) FROM public.listing_blocked_dates
       WHERE listing_id = NEW.listing_id AND end_date >= private.today()) >= 50 THEN
    RAISE EXCEPTION 'Högst 50 blockerade perioder per annons. Ta bort gamla först.';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER blocked_dates_limit BEFORE INSERT ON public.listing_blocked_dates
  FOR EACH ROW EXECUTE FUNCTION private.blocked_dates_limit();

-- 3. Bookings: pickup, return and condition photos; messages can point to a booking ----

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS picked_up_at timestamptz,
  ADD COLUMN IF NOT EXISTS returned_at timestamptz,
  ADD COLUMN IF NOT EXISTS pickup_photos text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS return_photos text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS bookings_listing_dates ON public.bookings (listing_id, start_date, end_date);

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL;

-- Only request_booking / respond_booking / set_booking_photos write bookings.
REVOKE INSERT, UPDATE, DELETE ON public.bookings FROM authenticated;

-- Visitors still send plain text only; booking messages come from the functions below.
DROP POLICY IF EXISTS "messages_party_insert" ON public.messages;
CREATE POLICY "messages_party_insert" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND kind = 'text'
    AND offer_id IS NULL
    AND booking_id IS NULL
    AND image_url IS NULL
    AND EXISTS (
      SELECT 1 FROM public.conversations c
       WHERE c.id = conversation_id AND (c.renter_id = auth.uid() OR c.owner_id = auth.uid())
    )
  );

-- 4. Helpers ----------------------------------------------------------------------------

-- Last taken day of a booking: returning early frees the remaining days.
CREATE OR REPLACE FUNCTION private.booking_last_day(_status public.booking_status, _end date, _returned timestamptz)
RETURNS date LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN _status = 'completed' AND _returned IS NOT NULL
              THEN LEAST(_end, (_returned AT TIME ZONE 'Europe/Stockholm')::date)
              ELSE _end END
$$;

-- Same as before (confirmed or finished bookings), but early returns free their days.
CREATE OR REPLACE FUNCTION private.booking_overlaps(_listing_id uuid, _start date, _end date, _exclude uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
     WHERE b.listing_id = _listing_id
       AND b.status IN ('confirmed', 'completed')
       AND b.start_date <= _end
       AND private.booking_last_day(b.status, b.end_date, b.returned_at) >= _start
       AND (_exclude IS NULL OR b.id <> _exclude)
  )
$$;

-- Booked (confirmed or finished) or blocked by the owner.
CREATE OR REPLACE FUNCTION private.dates_taken(_listing_id uuid, _start date, _end date, _exclude uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.booking_overlaps(_listing_id, _start, _end, _exclude)
      OR EXISTS (
        SELECT 1 FROM public.listing_blocked_dates d
         WHERE d.listing_id = _listing_id AND d.start_date <= _end AND d.end_date >= _start
      )
$$;

-- "12 nov" / "12–14 nov" / "30 nov–2 dec"
CREATE OR REPLACE FUNCTION private.sv_dates(_start date, _end date)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _start = _end THEN m.s
    WHEN date_trunc('month', _start) = date_trunc('month', _end)
      THEN extract(day FROM _start)::int || '–' || m.e
    ELSE m.s || '–' || m.e
  END
  FROM (SELECT
    extract(day FROM _start)::int || ' ' || (ARRAY['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'])[extract(month FROM _start)::int] AS s,
    extract(day FROM _end)::int || ' ' || (ARRAY['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'])[extract(month FROM _end)::int] AS e
  ) m
$$;

-- Posts a booking message in the conversation about the listing (creates it if needed).
CREATE OR REPLACE FUNCTION private.booking_message(_booking_id uuid, _sender uuid, _body text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b public.bookings%ROWTYPE;
  v_conv uuid;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id;
  SELECT id INTO v_conv FROM public.conversations WHERE listing_id = b.listing_id AND renter_id = b.renter_id;
  IF v_conv IS NULL AND b.owner_id IS NOT NULL THEN
    INSERT INTO public.conversations (listing_id, renter_id, owner_id)
    VALUES (b.listing_id, b.renter_id, b.owner_id)
    RETURNING id INTO v_conv;
  END IF;
  IF v_conv IS NOT NULL THEN
    INSERT INTO public.messages (conversation_id, sender_id, body, kind, booking_id)
    VALUES (v_conv, _sender, _body, 'booking', _booking_id);
  END IF;
  RETURN v_conv;
END $$;

-- 5. Ask for dates --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.request_booking(
  _listing_id uuid,
  _start date,
  _end date,
  _delivery boolean DEFAULT false,
  _message text DEFAULT NULL,
  _expected_total numeric DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  l public.listings%ROWTYPE;
  v_days integer;
  v_base numeric;
  v_delivery_fee numeric := 0;
  v_id uuid;
  v_conv uuid;
  v_note text := btrim(COALESCE(_message, ''));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Logga in för att boka'; END IF;
  IF private.is_blocked(v_uid) THEN RAISE EXCEPTION 'Kontot är spärrat'; END IF;

  -- Locking the listing makes requests and accepts for it happen one at a time.
  SELECT * INTO l FROM public.listings WHERE id = _listing_id FOR UPDATE;
  IF NOT FOUND OR l.status <> 'published' OR l.listing_type <> 'rent' OR l.price_day IS NULL THEN
    RAISE EXCEPTION 'Annonsen går inte att boka';
  END IF;
  IF l.owner_id IS NULL THEN RAISE EXCEPTION 'Exempelannonser kan inte bokas'; END IF;
  IF l.owner_id = v_uid THEN RAISE EXCEPTION 'Du kan inte boka din egen annons'; END IF;

  IF _start IS NULL OR _end IS NULL OR _end < _start THEN RAISE EXCEPTION 'Välj start- och slutdatum'; END IF;
  IF _start < private.today() THEN RAISE EXCEPTION 'Startdatumet har redan varit'; END IF;
  IF _start > private.today() + 365 THEN RAISE EXCEPTION 'Du kan boka högst ett år framåt'; END IF;
  v_days := _end - _start + 1;
  IF v_days < l.min_days THEN
    RAISE EXCEPTION 'Den här saken hyrs ut minst % dygn åt gången', l.min_days;
  END IF;
  IF v_days > 90 THEN RAISE EXCEPTION 'Du kan boka högst 90 dygn åt gången'; END IF;
  IF char_length(v_note) > 1000 THEN RAISE EXCEPTION 'Meddelandet får vara högst 1000 tecken'; END IF;
  IF _delivery AND NOT l.delivery_available THEN RAISE EXCEPTION 'Uthyraren erbjuder inte leverans'; END IF;

  IF private.dates_taken(_listing_id, _start, _end, NULL) THEN
    RAISE EXCEPTION 'Datumen är inte lediga. Välj andra datum.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.bookings
     WHERE listing_id = _listing_id AND renter_id = v_uid AND status = 'requested'
       AND end_date >= private.today()
  ) THEN
    RAISE EXCEPTION 'Du har redan en förfrågan på den här annonsen. Vänta på svar eller avboka den först.';
  END IF;
  IF (SELECT count(*) FROM public.bookings
       WHERE renter_id = v_uid AND created_at > now() - interval '24 hours') >= 10 THEN
    RAISE EXCEPTION 'Du har skickat många förfrågningar i dag. Försök igen i morgon.';
  END IF;

  -- Day price, or the week price for whole weeks when that is cheaper.
  v_base := v_days * l.price_day;
  IF COALESCE(l.price_week, 0) > 0 AND v_days >= 7 THEN
    v_base := LEAST(v_base, (v_days / 7) * l.price_week + LEAST((v_days % 7) * l.price_day, l.price_week));
  END IF;
  IF _delivery THEN v_delivery_fee := COALESCE(l.delivery_fee, 0); END IF;
  IF _expected_total IS NOT NULL AND _expected_total <> v_base + v_delivery_fee THEN
    RAISE EXCEPTION 'Priset har ändrats till % kr. Kontrollera och skicka igen.', (v_base + v_delivery_fee)::bigint;
  END IF;

  INSERT INTO public.bookings (listing_id, renter_id, owner_id, start_date, end_date, days,
                               base_price, delivery_fee, deposit, total_price, delivery, status, message)
  VALUES (_listing_id, v_uid, l.owner_id, _start, _end, v_days,
          v_base, v_delivery_fee, COALESCE(l.deposit, 0), v_base + v_delivery_fee, COALESCE(_delivery, false),
          'requested', NULLIF(v_note, ''))
  RETURNING id INTO v_id;

  v_conv := private.booking_message(v_id, v_uid,
    'Bokningsförfrågan: ' || private.sv_dates(_start, _end) || ' (' || v_days || ' dygn), '
    || (v_base + v_delivery_fee)::bigint || ' kr'
    || CASE WHEN _delivery THEN ' inkl. leverans' ELSE '' END || '.'
    || CASE WHEN v_note <> '' THEN E'\n\n' || v_note ELSE '' END);

  RETURN jsonb_build_object('booking_id', v_id, 'conversation_id', v_conv);
END $$;

-- 6. Answer, cancel, pickup and return -------------------------------------------------------

CREATE OR REPLACE FUNCTION public.respond_booking(_booking_id uuid, _action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  b public.bookings%ROWTYPE;
  v_owner boolean;
  v_dates text;
  v_body text;
  v_conv uuid;
  v_listing_status text;
  other record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Logga in först'; END IF;
  IF private.is_blocked(v_uid) THEN RAISE EXCEPTION 'Kontot är spärrat'; END IF;

  -- Lock the listing first (like request_booking), then the booking.
  SELECT l.status INTO v_listing_status
    FROM public.listings l JOIN public.bookings x ON x.listing_id = l.id
   WHERE x.id = _booking_id
     FOR UPDATE OF l;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND OR b.owner_id IS NULL OR v_uid NOT IN (b.renter_id, b.owner_id) THEN
    RAISE EXCEPTION 'Bokningen finns inte';
  END IF;
  v_owner := v_uid = b.owner_id;
  v_dates := private.sv_dates(b.start_date, b.end_date);

  IF _action = 'accept' THEN
    IF NOT v_owner OR b.status <> 'requested' THEN RAISE EXCEPTION 'Förfrågan kan inte godkännas'; END IF;
    IF b.start_date < private.today() THEN RAISE EXCEPTION 'Startdatumet har redan varit'; END IF;
    IF v_listing_status IS DISTINCT FROM 'published' AND v_listing_status IS DISTINCT FROM 'paused' THEN
      RAISE EXCEPTION 'Annonsen går inte att boka längre';
    END IF;
    IF private.dates_taken(b.listing_id, b.start_date, b.end_date, b.id) THEN
      RAISE EXCEPTION 'Datumen är redan bokade eller blockerade';
    END IF;
    UPDATE public.bookings SET status = 'confirmed' WHERE id = b.id;
    v_body := 'Bokningen ' || v_dates || ' är godkänd. Kom överens om tid och plats för upphämtningen här.';

    -- Other requests for the same days can no longer be met.
    FOR other IN
      SELECT id FROM public.bookings
       WHERE listing_id = b.listing_id AND status = 'requested' AND id <> b.id
         AND start_date <= b.end_date AND end_date >= b.start_date
    LOOP
      UPDATE public.bookings SET status = 'declined' WHERE id = other.id;
      -- From the platform (no sender), so it doesn't count against the owner's message limit.
      PERFORM private.booking_message(other.id, NULL,
        'Förfrågan nekades automatiskt: datumen har blivit bokade.');
    END LOOP;

  ELSIF _action = 'decline' THEN
    IF NOT v_owner OR b.status <> 'requested' THEN RAISE EXCEPTION 'Förfrågan kan inte nekas'; END IF;
    UPDATE public.bookings SET status = 'declined' WHERE id = b.id;
    v_body := 'Förfrågan för ' || v_dates || ' nekades.';

  ELSIF _action = 'cancel' THEN
    IF b.status NOT IN ('requested', 'confirmed') OR b.picked_up_at IS NOT NULL THEN
      RAISE EXCEPTION 'Bokningen kan inte avbokas';
    END IF;
    IF b.status = 'requested' AND v_owner THEN RAISE EXCEPTION 'Neka förfrågan i stället'; END IF;
    UPDATE public.bookings SET status = 'cancelled' WHERE id = b.id;
    v_body := CASE WHEN b.status = 'requested' THEN 'Förfrågan för ' || v_dates || ' är återkallad.'
                   ELSE 'Bokningen ' || v_dates || ' är avbokad.' END;

  ELSIF _action = 'picked_up' THEN
    IF b.status <> 'confirmed' OR b.picked_up_at IS NOT NULL THEN
      RAISE EXCEPTION 'Bokningen kan inte markeras som utlämnad';
    END IF;
    IF b.start_date > private.today() + 1 THEN RAISE EXCEPTION 'Hyran har inte börjat än'; END IF;
    UPDATE public.bookings SET picked_up_at = now() WHERE id = b.id;
    v_body := 'Markerad som utlämnad.';

  ELSIF _action = 'returned' THEN
    IF NOT v_owner THEN RAISE EXCEPTION 'Bara uthyraren kan markera att saken är återlämnad'; END IF;
    IF b.status <> 'confirmed' OR b.picked_up_at IS NULL THEN
      RAISE EXCEPTION 'Markera först att saken är utlämnad';
    END IF;
    UPDATE public.bookings SET returned_at = now(), status = 'completed' WHERE id = b.id;
    v_body := 'Markerad som återlämnad. Hyran är avslutad.';

  ELSE
    RAISE EXCEPTION 'Okänd åtgärd';
  END IF;

  v_conv := private.booking_message(b.id, v_uid, v_body);
  RETURN jsonb_build_object('booking_id', b.id, 'conversation_id', v_conv);
END $$;

-- 7. Condition photos at pickup and return -------------------------------------------------
-- Each person controls their own photos (from their own upload folder), at most 8 per
-- stage. The other person's photos are kept as they are.

CREATE OR REPLACE FUNCTION public.set_booking_photos(_booking_id uuid, _stage text, _paths text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  b public.bookings%ROWTYPE;
  v_mine text[] := COALESCE(_paths, '{}');
  v_others text[];
  p text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Logga in först'; END IF;
  IF private.is_blocked(v_uid) THEN RAISE EXCEPTION 'Kontot är spärrat'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND OR b.owner_id IS NULL OR v_uid NOT IN (b.renter_id, b.owner_id) THEN
    RAISE EXCEPTION 'Bokningen finns inte';
  END IF;
  IF b.status NOT IN ('confirmed', 'completed') THEN
    RAISE EXCEPTION 'Bilder kan bara läggas till på godkända bokningar';
  END IF;
  IF b.returned_at < now() - interval '7 days' THEN
    RAISE EXCEPTION 'Bilderna kan inte ändras mer än en vecka efter återlämningen';
  END IF;
  IF _stage NOT IN ('pickup', 'return') THEN RAISE EXCEPTION 'Okänt steg'; END IF;
  IF COALESCE(array_length(v_mine, 1), 0) > 8 THEN RAISE EXCEPTION 'Högst 8 bilder per steg'; END IF;
  FOREACH p IN ARRAY v_mine LOOP
    IF p !~ ('^' || v_uid::text || '/[0-9a-f-]{36}\.(webp|jpg)$') THEN
      RAISE EXCEPTION 'Bilder måste laddas upp via Hyrkoll';
    END IF;
  END LOOP;

  IF _stage = 'pickup' THEN
    SELECT COALESCE(array_agg(x), '{}') INTO v_others FROM unnest(b.pickup_photos) x
     WHERE x NOT LIKE v_uid::text || '/%';
    UPDATE public.bookings SET pickup_photos = v_others || v_mine WHERE id = b.id;
  ELSE
    SELECT COALESCE(array_agg(x), '{}') INTO v_others FROM unnest(b.return_photos) x
     WHERE x NOT LIKE v_uid::text || '/%';
    UPDATE public.bookings SET return_photos = v_others || v_mine WHERE id = b.id;
  END IF;
END $$;

-- 8. My bookings, as renter and as owner (public names only) ----------------------------------

CREATE OR REPLACE FUNCTION public.my_bookings()
RETURNS TABLE (
  id uuid,
  listing_id uuid,
  listing_title text,
  listing_image text,
  listing_city text,
  cancellation_policy text,
  i_am_owner boolean,
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
         COALESCE(b.owner_id = auth.uid(), false),
         private.public_name(CASE WHEN b.owner_id = auth.uid() THEN b.renter_id ELSE b.owner_id END),
         (SELECT c.id FROM public.conversations c WHERE c.listing_id = b.listing_id AND c.renter_id = b.renter_id),
         b.status::text, b.start_date, b.end_date, b.days, b.base_price, b.delivery, b.delivery_fee,
         b.deposit, b.total_price, b.message, b.picked_up_at, b.returned_at, b.pickup_photos,
         b.return_photos, b.created_at
    FROM public.bookings b
    LEFT JOIN public.listings l ON l.id = b.listing_id
   WHERE auth.uid() IN (b.renter_id, b.owner_id)
   ORDER BY b.start_date DESC, b.created_at DESC
$$;

-- 9. Availability for everyone ----------------------------------------------------------------

-- Taken periods of a published listing from today on (bookings and the owner's blocks),
-- without saying who booked.
CREATE OR REPLACE FUNCTION public.booked_dates(_listing_id uuid)
RETURNS TABLE (start_date date, end_date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.start_date, x.last_day
    FROM public.bookings b JOIN public.listings l ON l.id = b.listing_id
   CROSS JOIN LATERAL (SELECT private.booking_last_day(b.status, b.end_date, b.returned_at) AS last_day) x
   WHERE b.listing_id = _listing_id AND l.status = 'published'
     AND b.status IN ('confirmed', 'completed')
     AND x.last_day >= GREATEST(b.start_date, private.today())
  UNION ALL
  SELECT d.start_date, d.end_date
    FROM public.listing_blocked_dates d JOIN public.listings l ON l.id = d.listing_id
   WHERE d.listing_id = _listing_id AND l.status = 'published' AND d.end_date >= private.today()
$$;

-- Published listings that are taken some day in the period (for the "Ledig" filter in search).
CREATE OR REPLACE FUNCTION public.unavailable_listings(_start date, _end date)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.listing_id FROM public.bookings b JOIN public.listings l ON l.id = b.listing_id
   WHERE _end - _start BETWEEN 0 AND 366 AND l.status = 'published'
     AND b.status IN ('confirmed', 'completed') AND b.start_date <= _end
     AND private.booking_last_day(b.status, b.end_date, b.returned_at) >= _start
  UNION
  SELECT d.listing_id FROM public.listing_blocked_dates d JOIN public.listings l ON l.id = d.listing_id
   WHERE _end - _start BETWEEN 0 AND 366 AND l.status = 'published'
     AND d.start_date <= _end AND d.end_date >= _start
$$;

-- 10. When moderators remove a listing, its open requests and not yet started bookings end --

CREATE OR REPLACE FUNCTION private.listings_removed_bookings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b record;
BEGIN
  FOR b IN
    SELECT id, status FROM public.bookings
     WHERE listing_id = NEW.id
       AND (status = 'requested' OR (status = 'confirmed' AND picked_up_at IS NULL))
  LOOP
    UPDATE public.bookings
       SET status = CASE WHEN b.status = 'requested' THEN 'declined' ELSE 'cancelled' END::public.booking_status
     WHERE id = b.id;
    PERFORM private.booking_message(b.id, NULL,
      CASE WHEN b.status = 'requested' THEN 'Förfrågan nekades: annonsen har tagits bort av Hyrkolls moderatorer.'
           ELSE 'Bokningen avbokades: annonsen har tagits bort av Hyrkolls moderatorer.' END);
  END LOOP;
  RETURN NULL;
END $$;

CREATE OR REPLACE TRIGGER listings_removed_bookings AFTER UPDATE OF status ON public.listings
  FOR EACH ROW WHEN (NEW.status = 'removed' AND OLD.status IS DISTINCT FROM 'removed')
  EXECUTE FUNCTION private.listings_removed_bookings();

-- 11. No account deletion in the middle of a rental --------------------------------------------

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
  DELETE FROM auth.users WHERE id = auth.uid();
END $$;

-- 12. Bidding is switched off (hidden from the site, and it skips the rules above) ----------

REVOKE EXECUTE ON FUNCTION
  public.place_offer(uuid, date, date, integer, numeric, numeric, text),
  public.respond_offer(uuid, text, numeric, text)
FROM authenticated;

-- 13. Who may call what --------------------------------------------------------------------------

REVOKE ALL ON FUNCTION
  private.today(),
  private.booking_last_day(public.booking_status, date, timestamptz),
  private.blocked_dates_limit(),
  private.listings_removed_bookings(),
  private.dates_taken(uuid, date, date, uuid),
  private.booking_message(uuid, uuid, text),
  private.sv_dates(date, date)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
  public.request_booking(uuid, date, date, boolean, text, numeric),
  public.respond_booking(uuid, text),
  public.set_booking_photos(uuid, text, text[]),
  public.my_bookings()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.request_booking(uuid, date, date, boolean, text, numeric),
  public.respond_booking(uuid, text),
  public.set_booking_photos(uuid, text, text[]),
  public.my_bookings()
TO authenticated;

REVOKE ALL ON FUNCTION public.booked_dates(uuid), public.unavailable_listings(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.booked_dates(uuid), public.unavailable_listings(date, date)
  TO anon, authenticated;
