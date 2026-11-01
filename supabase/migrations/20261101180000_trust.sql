-- Trust (phase 2 in docs/mvp-plan.md): reviews after a finished rental, public profiles,
-- a rental agreement per booking, verified phone numbers, blocking another user and a
-- trust score that only admins see.
--
-- Reviews go both ways (renter about owner, owner about renter) and are written with
-- leave_review(). A review is shown when both have written theirs, or 14 days after the
-- return, so nobody writes in revenge. The 72 fake demo reviews are deleted. Listings
-- with bookings can no longer be deleted (pause them instead), so reviews, agreements and
-- condition photos stay. Safe to run more than once.

-- 1. Reviews -------------------------------------------------------------------------------

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS subject_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS subject_role text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

-- The fake demo reviews (no author, no booking) and the ratings they produced.
DELETE FROM public.reviews WHERE author_id IS NULL AND booking_id IS NULL AND subject_id IS NULL;
UPDATE public.listings SET rating = 0, review_count = 0 WHERE rating <> 0 OR review_count <> 0;
UPDATE public.profiles SET rating = 0, review_count = 0 WHERE rating <> 0 OR review_count <> 0;

ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_rules;
ALTER TABLE public.reviews ADD CONSTRAINT reviews_rules CHECK (
  rating BETWEEN 1 AND 5
  AND char_length(body) <= 1000
  AND (subject_role IS NULL OR subject_role IN ('owner', 'renter'))
) NOT VALID;
CREATE UNIQUE INDEX IF NOT EXISTS reviews_one_per_booking_author
  ON public.reviews (booking_id, author_id) WHERE booking_id IS NOT NULL AND author_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS reviews_subject ON public.reviews (subject_id, published_at);

-- A deleted listing must not take its reviews with it.
ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_listing_id_fkey;
ALTER TABLE public.reviews ADD CONSTRAINT reviews_listing_id_fkey
  FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE SET NULL;

-- Owners can't delete a listing that has bookings (pause it instead). Deleting the whole
-- account (delete_my_account) still removes everything.
-- (Not SECURITY DEFINER, so current_user is the caller: the owner, or the platform when
-- an account is deleted.)
CREATE OR REPLACE FUNCTION private.listings_delete_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
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

CREATE OR REPLACE TRIGGER listings_delete_guard BEFORE DELETE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION private.listings_delete_guard();

-- Reviews are read through public_reviews(); the table itself only shows your own.
REVOKE ALL ON public.reviews FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.reviews FROM authenticated;
DROP POLICY IF EXISTS "reviews_public_read" ON public.reviews;
DROP POLICY IF EXISTS "reviews_own_read" ON public.reviews;
CREATE POLICY "reviews_own_read" ON public.reviews FOR SELECT TO authenticated
  USING (author_id = auth.uid() OR private.is_admin());

CREATE OR REPLACE FUNCTION public.leave_review(_booking_id uuid, _rating integer, _body text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  b public.bookings%ROWTYPE;
  v_subject uuid;
  v_body text := btrim(COALESCE(_body, ''));
  v_ended timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Logga in först'; END IF;
  IF private.is_blocked(v_uid) THEN RAISE EXCEPTION 'Kontot är spärrat'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND OR b.owner_id IS NULL OR v_uid NOT IN (b.renter_id, b.owner_id) THEN
    RAISE EXCEPTION 'Bokningen finns inte';
  END IF;
  -- The rental ended when the item came back, or (if it never was marked as returned)
  -- three days after the last booked day.
  IF b.status = 'completed' AND b.returned_at IS NOT NULL THEN
    v_ended := b.returned_at;
  ELSIF b.status = 'confirmed' AND b.picked_up_at IS NOT NULL
        AND private.today() > b.end_date + 3 THEN
    v_ended := (b.end_date + 3)::timestamp AT TIME ZONE 'Europe/Stockholm';
  ELSE
    RAISE EXCEPTION 'Omdömen kan lämnas när hyran är avslutad';
  END IF;
  -- A rental that "ended" before its first day didn't really happen.
  IF (v_ended AT TIME ZONE 'Europe/Stockholm')::date < b.start_date THEN
    RAISE EXCEPTION 'Omdömen kan lämnas när hyran är avslutad';
  END IF;
  IF v_ended < now() - interval '14 days' THEN
    RAISE EXCEPTION 'Tiden för att lämna omdöme har gått ut (14 dagar efter hyran)';
  END IF;
  IF _rating IS NULL OR _rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Välj 1–5 stjärnor'; END IF;
  IF char_length(v_body) > 1000 THEN RAISE EXCEPTION 'Omdömet får vara högst 1000 tecken'; END IF;
  IF EXISTS (SELECT 1 FROM public.reviews WHERE booking_id = b.id AND author_id = v_uid) THEN
    RAISE EXCEPTION 'Du har redan lämnat ett omdöme för den här hyran';
  END IF;

  v_subject := CASE WHEN v_uid = b.owner_id THEN b.renter_id ELSE b.owner_id END;
  INSERT INTO public.reviews (listing_id, booking_id, author_id, subject_id, subject_role,
                              author_name, rating, body, verified, published_at)
  VALUES (b.listing_id, b.id, v_uid, v_subject,
          CASE WHEN v_uid = b.owner_id THEN 'renter' ELSE 'owner' END,
          private.public_name(v_uid), _rating, v_body, true, v_ended + interval '14 days');

  -- Both have written: show both now.
  IF EXISTS (SELECT 1 FROM public.reviews WHERE booking_id = b.id AND author_id = v_subject) THEN
    UPDATE public.reviews SET published_at = now() WHERE booking_id = b.id AND published_at > now();
  END IF;
END $$;

-- 2. Public profiles ---------------------------------------------------------------------------

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_bio_length;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_bio_length
  CHECK (char_length(COALESCE(bio, '')) <= 500) NOT VALID;

-- What everyone may see about a user: public name, city, "about me", member since,
-- verified phone (never the number), counts, rating and typical response time.
CREATE OR REPLACE FUNCTION public.public_profile(_user_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  account_type text,
  city text,
  bio text,
  member_since timestamptz,
  phone_verified boolean,
  listing_count integer,
  rentals_as_owner integer,
  rentals_as_renter integer,
  rating numeric,
  review_count integer,
  response_hours numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, private.public_name(p.id), p.account_type::text, p.city, p.bio, p.created_at,
         p.phone_verified,
         (SELECT count(*)::int FROM public.listings l
           WHERE l.owner_id = p.id AND l.status = 'published' AND l.listing_type = 'rent'),
         (SELECT count(*)::int FROM public.bookings b WHERE b.owner_id = p.id AND b.status = 'completed'),
         (SELECT count(*)::int FROM public.bookings b WHERE b.renter_id = p.id AND b.status = 'completed'),
         (SELECT round(avg(r.rating)::numeric, 1) FROM public.reviews r
           WHERE r.subject_id = p.id AND r.published_at <= now()),
         (SELECT count(*)::int FROM public.reviews r
           WHERE r.subject_id = p.id AND r.published_at <= now()),
         resp.hours
    FROM public.profiles p
    -- Median time from a renter's first message to the owner's first reply over the last
    -- 20 conversations (at least 3). Unanswered ones count as 48 hours once they are older
    -- than that; newer unanswered ones are left out.
    LEFT JOIN LATERAL (
      SELECT CASE WHEN count(*) >= 3
                  THEN round((percentile_cont(0.5) WITHIN GROUP (ORDER BY x.secs) / 3600)::numeric, 1)
             END AS hours
        FROM (
          SELECT LEAST(172800, COALESCE(
                   extract(epoch FROM (
                     (SELECT min(m2.created_at) FROM public.messages m2
                       WHERE m2.conversation_id = c.id AND m2.sender_id = c.owner_id
                         AND m2.created_at > f.first_at) - f.first_at)),
                   CASE WHEN f.first_at < now() - interval '48 hours' THEN 172800 END)) AS secs
            FROM public.conversations c
           CROSS JOIN LATERAL (
             SELECT min(m.created_at) AS first_at FROM public.messages m
              WHERE m.conversation_id = c.id AND m.sender_id = c.renter_id
           ) f
           WHERE c.owner_id = p.id AND f.first_at IS NOT NULL
           ORDER BY c.created_at DESC
           LIMIT 20
        ) x
       WHERE x.secs IS NOT NULL
    ) resp ON true
   WHERE p.id = _user_id AND p.blocked_at IS NULL
$$;

CREATE OR REPLACE FUNCTION public.public_reviews(_user_id uuid)
RETURNS TABLE (
  id uuid,
  rating integer,
  body text,
  author_name text,
  subject_role text,
  published_at timestamptz,
  listing_title text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.rating, r.body,
         CASE WHEN r.author_id IS NULL THEN 'Raderat konto' ELSE private.public_name(r.author_id) END,
         r.subject_role, r.published_at,
         CASE WHEN l.status = 'published' THEN l.title ELSE 'Annons som inte finns kvar' END
    FROM public.reviews r
    LEFT JOIN public.listings l ON l.id = r.listing_id
   WHERE r.subject_id = _user_id AND r.published_at <= now()
     AND NOT private.is_blocked(_user_id)
   ORDER BY r.published_at DESC
   LIMIT 100
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_review(_review_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'Bara administratörer'; END IF;
  DELETE FROM public.reviews WHERE id = _review_id;
END $$;

-- 3. Rental agreement ----------------------------------------------------------------------------

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS agreement jsonb,
  ADD COLUMN IF NOT EXISTS renter_agreed_at timestamptz,
  ADD COLUMN IF NOT EXISTS owner_agreed_at timestamptz;

-- The listing's terms as they are now. Saved on the booking when the owner accepts it
-- (or, for bookings accepted before this migration, at the first approval).
-- terms_version says which standard terms (in src/routes/_authenticated/avtal.$id.tsx) apply.
CREATE OR REPLACE FUNCTION private.agreement_terms(_listing_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'terms_version', 1,
    'title', l.title, 'description', l.description, 'included', l.included,
    'rental_rules', l.rental_rules, 'cancellation_policy', l.cancellation_policy,
    'pickup_available', l.pickup_available, 'delivery_available', l.delivery_available,
    'city', l.city, 'area', l.area)
    FROM public.listings l WHERE l.id = _listing_id
$$;

-- Only the two parties, and only once the booking is accepted. Full names are shown here
-- (and only here), as in any rental agreement.
CREATE OR REPLACE FUNCTION public.booking_agreement(_booking_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  b public.bookings%ROWTYPE;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id;
  IF NOT FOUND OR v_uid IS NULL OR b.owner_id IS NULL OR v_uid NOT IN (b.renter_id, b.owner_id) THEN
    RAISE EXCEPTION 'Bokningen finns inte';
  END IF;
  IF b.status NOT IN ('confirmed', 'completed') THEN
    RAISE EXCEPTION 'Avtalet finns när uthyraren har godkänt bokningen';
  END IF;
  RETURN jsonb_build_object(
    'booking_id', b.id, 'listing_id', b.listing_id, 'status', b.status,
    'start_date', b.start_date, 'end_date', b.end_date, 'days', b.days,
    'base_price', b.base_price, 'delivery', b.delivery, 'delivery_fee', b.delivery_fee,
    'deposit', b.deposit, 'total_price', b.total_price,
    'owner_name', COALESCE((SELECT NULLIF(btrim(full_name), '') FROM public.profiles WHERE id = b.owner_id),
                           private.public_name(b.owner_id)),
    'renter_name', COALESCE((SELECT NULLIF(btrim(full_name), '') FROM public.profiles WHERE id = b.renter_id),
                            private.public_name(b.renter_id)),
    'terms', COALESCE(b.agreement, private.agreement_terms(b.listing_id)),
    'owner_agreed_at', b.owner_agreed_at, 'renter_agreed_at', b.renter_agreed_at,
    'picked_up_at', b.picked_up_at, 'returned_at', b.returned_at,
    'i_am_owner', v_uid = b.owner_id);
END $$;

CREATE OR REPLACE FUNCTION private.bookings_agreement_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed' AND NEW.agreement IS NULL THEN
    NEW.agreement := private.agreement_terms(NEW.listing_id);
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER bookings_agreement_snapshot BEFORE UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION private.bookings_agreement_snapshot();

CREATE OR REPLACE FUNCTION public.accept_agreement(_booking_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  b public.bookings%ROWTYPE;
  v_conv uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Logga in först'; END IF;
  IF private.is_blocked(v_uid) THEN RAISE EXCEPTION 'Kontot är spärrat'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND OR b.owner_id IS NULL OR v_uid NOT IN (b.renter_id, b.owner_id) THEN
    RAISE EXCEPTION 'Bokningen finns inte';
  END IF;
  IF b.status <> 'confirmed' THEN RAISE EXCEPTION 'Avtalet kan bara godkännas på en godkänd bokning'; END IF;
  IF (v_uid = b.owner_id AND b.owner_agreed_at IS NOT NULL)
     OR (v_uid = b.renter_id AND b.renter_agreed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Du har redan godkänt avtalet';
  END IF;

  UPDATE public.bookings
     SET agreement = COALESCE(agreement, private.agreement_terms(listing_id)),
         owner_agreed_at = CASE WHEN v_uid = owner_id THEN now() ELSE owner_agreed_at END,
         renter_agreed_at = CASE WHEN v_uid = renter_id THEN now() ELSE renter_agreed_at END
   WHERE id = b.id;
  v_conv := private.booking_message(b.id, v_uid, 'Jag har godkänt hyresavtalet.');
  RETURN jsonb_build_object('booking_id', b.id, 'conversation_id', v_conv);
END $$;

-- 4. Blocking another user --------------------------------------------------------------------------
-- Blocking stops messages and new booking requests between the two, in both directions,
-- and ends open requests between them. While a rental between them is going on (an
-- accepted booking that isn't finished) they can still write, so the item can come back.
-- Only the blocker sees the block in the list; the other person notices that messages
-- and requests don't go through.

CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT user_blocks_not_self CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS user_blocks_blocked ON public.user_blocks (blocked_id);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_blocks FROM anon;
REVOKE UPDATE, TRUNCATE ON public.user_blocks FROM authenticated;
DROP POLICY IF EXISTS "user_blocks_own" ON public.user_blocks;
CREATE POLICY "user_blocks_own" ON public.user_blocks FOR ALL TO authenticated
  USING (blocker_id = auth.uid()) WITH CHECK (blocker_id = auth.uid());

CREATE OR REPLACE FUNCTION private.blocked_between(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks
     WHERE (blocker_id = _a AND blocked_id = _b) OR (blocker_id = _b AND blocked_id = _a)
  )
$$;

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
     WHERE b.status = 'confirmed'
       AND ((b.renter_id = c.renter_id AND b.owner_id = c.owner_id)
         OR (b.renter_id = c.owner_id AND b.owner_id = c.renter_id))
  ) THEN
    RAISE EXCEPTION 'Du kan inte skicka meddelanden i den här konversationen';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER messages_user_block_guard BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION private.messages_user_block_guard();

CREATE OR REPLACE FUNCTION private.bookings_user_block_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF private.blocked_between(NEW.renter_id, NEW.owner_id) THEN
    RAISE EXCEPTION 'Du kan inte boka hos den här uthyraren';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER bookings_user_block_guard BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION private.bookings_user_block_guard();

CREATE OR REPLACE FUNCTION private.user_blocks_decline_requests()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b record;
BEGIN
  NEW.created_at := now();
  FOR b IN
    SELECT id, renter_id FROM public.bookings
     WHERE status = 'requested'
       AND ((renter_id = NEW.blocker_id AND owner_id = NEW.blocked_id)
         OR (renter_id = NEW.blocked_id AND owner_id = NEW.blocker_id))
  LOOP
    -- The renter's own request is withdrawn; a request to the blocker is declined.
    UPDATE public.bookings
       SET status = CASE WHEN b.renter_id = NEW.blocker_id THEN 'cancelled' ELSE 'declined' END::public.booking_status
     WHERE id = b.id;
    PERFORM private.booking_message(b.id, NULL, 'Förfrågan är avslutad.');
  END LOOP;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER user_blocks_decline_requests BEFORE INSERT ON public.user_blocks
  FOR EACH ROW EXECUTE FUNCTION private.user_blocks_decline_requests();

CREATE OR REPLACE FUNCTION public.my_blocked_users()
RETURNS TABLE (id uuid, name text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ub.blocked_id, private.public_name(ub.blocked_id), ub.created_at
    FROM public.user_blocks ub
   WHERE ub.blocker_id = auth.uid()
   ORDER BY ub.created_at DESC
$$;

-- 5. Verified phone number ------------------------------------------------------------------------------
-- Supabase Auth confirms the number with an SMS code (needs an SMS provider; see
-- docs/operations.md). The profile follows Auth; users can't set it themselves.

CREATE OR REPLACE FUNCTION private.sync_phone_verified()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles
     SET phone = NULLIF(NEW.phone, ''),
         phone_verified = NEW.phone_confirmed_at IS NOT NULL AND COALESCE(NEW.phone, '') <> ''
   WHERE id = NEW.id;
  RETURN NEW;
END $$;

-- auth.users belongs to Supabase Auth, so the trigger is only created when missing
-- (dropping it again would need ownership of the table).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_phone' AND tgrelid = 'auth.users'::regclass
  ) THEN
    CREATE TRIGGER on_auth_user_phone AFTER INSERT OR UPDATE OF phone, phone_confirmed_at ON auth.users
      FOR EACH ROW EXECUTE FUNCTION private.sync_phone_verified();
  END IF;
END $$;

-- Same as before, plus: only Auth sets the phone number on the profile.
CREATE OR REPLACE FUNCTION private.profiles_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN RETURN NEW; END IF;
  NEW.id := OLD.id;
  NEW.email_verified := OLD.email_verified;
  NEW.id_verified := OLD.id_verified;
  NEW.phone := OLD.phone;
  NEW.phone_verified := OLD.phone_verified;
  NEW.rating := OLD.rating;
  NEW.review_count := OLD.review_count;
  NEW.created_at := OLD.created_at;
  NEW.blocked_at := OLD.blocked_at;
  RETURN NEW;
END $$;

-- 6. Trust score (admins only) -----------------------------------------------------------------------
-- A rough 0–100 score to spot likely scammers early. Never shown to the user or others.

CREATE OR REPLACE FUNCTION public.admin_trust_scores()
RETURNS TABLE (
  user_id uuid,
  name text,
  blocked boolean,
  member_days integer,
  listings integer,
  removed_listings integer,
  completed_rentals integer,
  rating numeric,
  review_count integer,
  reports_open integer,
  reports_upheld integer,
  blocked_by integer,
  score integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH rep AS (
    SELECT t.uid,
           count(*) FILTER (WHERE r.status = 'open') AS open,
           count(*) FILTER (WHERE r.status = 'resolved'
                              AND COALESCE(r.resolution, '') NOT IN ('Ingen åtgärd', 'Dubblett')) AS upheld
      FROM public.reports r
      LEFT JOIN public.listings l ON r.target_type = 'listing' AND l.id::text = r.target_id
      LEFT JOIN public.conversations c ON r.target_type = 'conversation' AND c.id::text = r.target_id
     CROSS JOIN LATERAL (
       SELECT CASE r.target_type
                WHEN 'listing' THEN l.owner_id
                WHEN 'user' THEN (SELECT p.id FROM public.profiles p WHERE p.id::text = r.target_id)
                WHEN 'conversation' THEN CASE WHEN c.renter_id = r.reporter_id THEN c.owner_id ELSE c.renter_id END
              END AS uid
     ) t
     WHERE t.uid IS NOT NULL
     GROUP BY t.uid
  ), s AS (
    SELECT p.id,
           private.public_name(p.id) AS name,
           p.blocked_at IS NOT NULL AS blocked,
           (private.today() - p.created_at::date) AS member_days,
           (SELECT count(*)::int FROM public.listings l
             WHERE l.owner_id = p.id AND l.status IN ('published', 'paused')) AS listings,
           (SELECT count(*)::int FROM public.listings l
             WHERE l.owner_id = p.id AND l.status = 'removed') AS removed_listings,
           (SELECT count(*)::int FROM public.bookings b
             WHERE p.id IN (b.owner_id, b.renter_id) AND b.status = 'completed') AS completed_rentals,
           (SELECT round(avg(r.rating)::numeric, 1) FROM public.reviews r
             WHERE r.subject_id = p.id AND r.published_at <= now()) AS rating,
           (SELECT count(*)::int FROM public.reviews r
             WHERE r.subject_id = p.id AND r.published_at <= now()) AS review_count,
           COALESCE(rep.open, 0)::int AS reports_open,
           COALESCE(rep.upheld, 0)::int AS reports_upheld,
           (SELECT count(*)::int FROM public.user_blocks ub WHERE ub.blocked_id = p.id) AS blocked_by
      FROM public.profiles p
      LEFT JOIN rep ON rep.uid = p.id
     WHERE private.is_admin()
  )
  SELECT s.*,
         GREATEST(0, LEAST(100,
           50
           + LEAST(s.member_days / 30 * 2, 10)
           + LEAST(s.completed_rentals * 4, 20)
           + CASE WHEN s.review_count >= 3 THEN round((s.rating - 3) * 5)::int ELSE 0 END
           - 15 * s.reports_upheld - 5 * s.reports_open
           - 10 * s.removed_listings - 5 * s.blocked_by
           - CASE WHEN s.blocked THEN 50 ELSE 0 END))::int
    FROM s
   ORDER BY 13, s.member_days
   LIMIT 200
$$;

-- 7. Who may call what -----------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION
  private.listings_delete_guard(),
  private.bookings_agreement_snapshot(),
  private.agreement_terms(uuid),
  private.blocked_between(uuid, uuid),
  private.messages_user_block_guard(),
  private.bookings_user_block_guard(),
  private.user_blocks_decline_requests(),
  private.sync_phone_verified()
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
  public.leave_review(uuid, integer, text),
  public.booking_agreement(uuid),
  public.accept_agreement(uuid),
  public.my_blocked_users(),
  public.admin_delete_review(uuid),
  public.admin_trust_scores()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.leave_review(uuid, integer, text),
  public.booking_agreement(uuid),
  public.accept_agreement(uuid),
  public.my_blocked_users(),
  public.admin_delete_review(uuid),
  public.admin_trust_scores()
TO authenticated;

REVOKE ALL ON FUNCTION public.public_profile(uuid), public.public_reviews(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_profile(uuid), public.public_reviews(uuid) TO anon, authenticated;
