-- 1. Listing-level public offer settings
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS allow_offers boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS offer_validity_hours integer NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS dynamic_pricing jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Private (owner-only) offer thresholds
CREATE TABLE IF NOT EXISTS public.listing_offer_settings (
  listing_id uuid PRIMARY KEY REFERENCES public.listings(id) ON DELETE CASCADE,
  min_offer_per_day numeric,
  min_offer_total numeric,
  auto_accept_total numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.listing_offer_settings TO authenticated;
GRANT ALL ON public.listing_offer_settings TO service_role;

ALTER TABLE public.listing_offer_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "offer_settings_owner_all" ON public.listing_offer_settings
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_id AND l.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_id AND l.owner_id = auth.uid()));

-- 3. Offer status enum + offers table
DO $$ BEGIN
  CREATE TYPE public.offer_status AS ENUM ('active','countered','accepted','declined','expired','withdrawn');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  renter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  parent_id uuid REFERENCES public.offers(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  actor text NOT NULL DEFAULT 'renter',
  start_date date NOT NULL,
  end_date date NOT NULL,
  days integer NOT NULL DEFAULT 1,
  list_total numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  message text,
  status public.offer_status NOT NULL DEFAULT 'active',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS offers_listing_idx ON public.offers(listing_id);
CREATE INDEX IF NOT EXISTS offers_renter_idx ON public.offers(renter_id);
CREATE INDEX IF NOT EXISTS offers_owner_idx ON public.offers(owner_id);

GRANT SELECT, INSERT, UPDATE ON public.offers TO authenticated;
GRANT ALL ON public.offers TO service_role;

ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "offers_party_read" ON public.offers
  FOR SELECT TO authenticated
  USING (auth.uid() = renter_id OR auth.uid() = owner_id);

CREATE POLICY "offers_party_insert" ON public.offers
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = renter_id OR auth.uid() = owner_id);

CREATE POLICY "offers_party_update" ON public.offers
  FOR UPDATE TO authenticated
  USING (auth.uid() = renter_id OR auth.uid() = owner_id)
  WITH CHECK (auth.uid() = renter_id OR auth.uid() = owner_id);

-- 4. Messages can reference an offer (offer cards in chat)
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS offer_id uuid REFERENCES public.offers(id) ON DELETE SET NULL;

-- 5. updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS offers_touch ON public.offers;
CREATE TRIGGER offers_touch BEFORE UPDATE ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS offer_settings_touch ON public.listing_offer_settings;
CREATE TRIGGER offer_settings_touch BEFORE UPDATE ON public.listing_offer_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 6. Expire stale offers
CREATE OR REPLACE FUNCTION public.expire_stale_offers()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.offers
     SET status = 'expired'
   WHERE status IN ('active','countered')
     AND expires_at IS NOT NULL
     AND expires_at < now();
$$;

GRANT EXECUTE ON FUNCTION public.expire_stale_offers() TO authenticated;

-- 7. Place an offer (renter). Auto-accepts against the owner's private threshold
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
  IF NOT FOUND THEN RAISE EXCEPTION 'Listing not found'; END IF;
  IF NOT l.allow_offers THEN RAISE EXCEPTION 'Listing does not accept offers'; END IF;
  IF l.owner_id = v_uid THEN RAISE EXCEPTION 'Cannot bid on your own listing'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;

  SELECT * INTO s FROM public.listing_offer_settings WHERE listing_id = _listing_id;

  v_min := COALESCE(s.min_offer_total, CASE WHEN s.min_offer_per_day IS NOT NULL
             THEN s.min_offer_per_day * GREATEST(_days,1) END);
  IF v_min IS NOT NULL AND _amount < v_min THEN v_below := true; END IF;
  IF s.auto_accept_total IS NOT NULL AND _amount >= s.auto_accept_total THEN v_auto := true; END IF;

  IF l.offer_validity_hours > 0 THEN
    v_expires := now() + make_interval(hours => l.offer_validity_hours);
  END IF;

  INSERT INTO public.offers (listing_id, renter_id, owner_id, actor, start_date, end_date,
                             days, list_total, amount, message, status, expires_at)
  VALUES (_listing_id, v_uid, l.owner_id, 'renter', _start, _end, GREATEST(_days,1),
          _list_total, _amount, _message,
          CASE WHEN v_auto THEN 'accepted'::public.offer_status ELSE 'active'::public.offer_status END,
          v_expires)
  RETURNING id INTO v_offer_id;

  IF v_auto THEN
    INSERT INTO public.bookings (listing_id, renter_id, owner_id, start_date, end_date, days,
                                 base_price, total_price, deposit, status, message)
    VALUES (_listing_id, v_uid, l.owner_id, _start, _end, GREATEST(_days,1),
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

GRANT EXECUTE ON FUNCTION public.place_offer(uuid, date, date, integer, numeric, numeric, text) TO authenticated;

-- 8. Respond to an offer: accept / decline / counter / withdraw
CREATE OR REPLACE FUNCTION public.respond_offer(
  _offer_id uuid,
  _action text,
  _amount numeric DEFAULT NULL,
  _message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.offers%ROWTYPE;
  l public.listings%ROWTYPE;
  v_uid uuid := auth.uid();
  v_is_owner boolean;
  v_new_id uuid;
  v_booking_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  PERFORM public.expire_stale_offers();

  SELECT * INTO o FROM public.offers WHERE id = _offer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Offer not found'; END IF;
  IF v_uid <> o.renter_id AND v_uid IS DISTINCT FROM o.owner_id THEN
    RAISE EXCEPTION 'Not a party to this offer';
  END IF;
  IF o.status NOT IN ('active','countered') THEN
    RAISE EXCEPTION 'Offer is no longer open';
  END IF;

  v_is_owner := (v_uid IS NOT DISTINCT FROM o.owner_id) AND v_uid <> o.renter_id;
  SELECT * INTO l FROM public.listings WHERE id = o.listing_id;

  IF _action = 'withdraw' THEN
    -- only the party that made this offer may withdraw it
    IF (o.actor = 'renter' AND v_uid <> o.renter_id) OR (o.actor = 'owner' AND NOT v_is_owner) THEN
      RAISE EXCEPTION 'Only the sender can withdraw';
    END IF;
    UPDATE public.offers SET status = 'withdrawn' WHERE id = _offer_id;
    RETURN jsonb_build_object('status','withdrawn');

  ELSIF _action = 'decline' THEN
    UPDATE public.offers SET status = 'declined' WHERE id = _offer_id;
    RETURN jsonb_build_object('status','declined');

  ELSIF _action = 'counter' THEN
    IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Invalid counter amount'; END IF;
    UPDATE public.offers SET status = 'countered' WHERE id = _offer_id;
    INSERT INTO public.offers (listing_id, renter_id, owner_id, parent_id, conversation_id, actor,
                               start_date, end_date, days, list_total, amount, message, status, expires_at)
    VALUES (o.listing_id, o.renter_id, o.owner_id, o.id, o.conversation_id,
            CASE WHEN v_is_owner THEN 'owner' ELSE 'renter' END,
            o.start_date, o.end_date, o.days, o.list_total, _amount, _message, 'active',
            CASE WHEN COALESCE(l.offer_validity_hours,0) > 0
                 THEN now() + make_interval(hours => l.offer_validity_hours) END)
    RETURNING id INTO v_new_id;
    RETURN jsonb_build_object('status','countered','offer_id', v_new_id);

  ELSIF _action = 'accept' THEN
    -- the counterparty of the offer's sender accepts
    IF (o.actor = 'renter' AND v_uid = o.renter_id) OR (o.actor = 'owner' AND v_is_owner) THEN
      RAISE EXCEPTION 'You cannot accept your own offer';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.bookings b
       WHERE b.listing_id = o.listing_id
         AND b.status IN ('confirmed','completed')
         AND b.start_date <= o.end_date AND b.end_date >= o.start_date
    ) THEN
      RAISE EXCEPTION 'Dates are already booked';
    END IF;

    INSERT INTO public.bookings (listing_id, renter_id, owner_id, start_date, end_date, days,
                                 base_price, total_price, deposit, status, message)
    VALUES (o.listing_id, o.renter_id, o.owner_id, o.start_date, o.end_date, o.days,
            o.amount, o.amount, COALESCE(l.deposit,0), 'confirmed',
            'Pris överenskommet via budgivning')
    RETURNING id INTO v_booking_id;

    UPDATE public.offers SET status = 'accepted', booking_id = v_booking_id WHERE id = _offer_id;
    RETURN jsonb_build_object('status','accepted','booking_id', v_booking_id);
  END IF;

  RAISE EXCEPTION 'Unknown action';
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_offer(uuid, text, numeric, text) TO authenticated;

-- 9. Enable offers on a few seeded demo listings so the flow can be tried out
UPDATE public.listings
   SET allow_offers = true, offer_validity_hours = 24
 WHERE status = 'published';
