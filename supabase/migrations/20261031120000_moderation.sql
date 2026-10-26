-- Minimum moderation (task 7 in docs/mvp-plan.md).
--
-- Users report listings, users or conversations they are part of, with a reason.
-- Admins see reports in /admin and can hide or restore listings (the reason is
-- shown to the owner), dismiss reports and block users. Blocked users can't
-- publish, edit or send messages. Admins only see a conversation's messages when
-- it has been reported. Safe to run more than once.

-- 1. Reports: resolution, notification state, one open report per person and target

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolution text,
  ADD COLUMN IF NOT EXISTS notified_at timestamptz;

ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_status_check;
ALTER TABLE public.reports ADD CONSTRAINT reports_status_check CHECK (status IN ('open', 'resolved'));

-- Older duplicates (the same person reporting the same thing twice) are closed first.
UPDATE public.reports r
   SET status = 'resolved', resolution = 'Dubblett', resolved_at = now()
 WHERE r.status = 'open'
   AND EXISTS (
     SELECT 1 FROM public.reports o
      WHERE o.status = 'open' AND o.reporter_id = r.reporter_id
        AND o.target_type = r.target_type AND o.target_id = r.target_id
        AND (o.created_at, o.id) < (r.created_at, r.id)
   );

CREATE UNIQUE INDEX IF NOT EXISTS reports_one_open_per_reporter
  ON public.reports (reporter_id, target_type, target_id) WHERE status = 'open';

DROP POLICY IF EXISTS "reports_insert" ON public.reports;
CREATE POLICY "reports_insert" ON public.reports FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = reporter_id
    AND status = 'open'
    AND resolved_at IS NULL AND resolved_by IS NULL AND resolution IS NULL AND notified_at IS NULL
    AND target_type IN ('listing', 'user', 'message', 'conversation')
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

-- 2. Moderation reason on listings, blocked flag on profiles --------------------

ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS moderation_reason text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS blocked_at timestamptz;

CREATE OR REPLACE FUNCTION private.is_blocked(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND blocked_at IS NOT NULL)
$$;

-- Same as before, plus: users can't unblock themselves.
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
  NEW.blocked_at := OLD.blocked_at;
  RETURN NEW;
END $$;

-- Blocked users can't create or edit listings; only admins set the moderation reason.
CREATE OR REPLACE FUNCTION private.listings_moderation_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN RETURN NEW; END IF;
  IF private.is_blocked(auth.uid()) THEN RAISE EXCEPTION 'Kontot är spärrat'; END IF;
  NEW.moderation_reason := CASE WHEN TG_OP = 'UPDATE' THEN OLD.moderation_reason END;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER listings_moderation_guard BEFORE INSERT OR UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION private.listings_moderation_guard();

-- Blocked users can't send messages (also not through start_conversation).
CREATE OR REPLACE FUNCTION private.messages_block_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.sender_id IS NOT NULL AND private.is_blocked(NEW.sender_id) THEN
    RAISE EXCEPTION 'Kontot är spärrat';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER messages_block_guard BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION private.messages_block_guard();

-- 3. Admin views ------------------------------------------------------------------
-- Everything below checks private.is_admin(); for anyone else the views are empty
-- and the actions raise an error.

CREATE OR REPLACE FUNCTION public.admin_reports(_open boolean DEFAULT true)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  target_type text,
  target_id text,
  reason text,
  details text,
  resolution text,
  resolved_at timestamptz,
  reporter_name text,
  reported_user_id uuid,
  reported_user_name text,
  reported_user_blocked boolean,
  listing_title text,
  listing_status text,
  reports_on_target integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.created_at, r.target_type, r.target_id, r.reason, r.details, r.resolution, r.resolved_at,
         CASE WHEN r.reporter_id IS NULL THEN 'Raderat konto' ELSE private.public_name(r.reporter_id) END,
         t.user_id,
         CASE WHEN t.user_id IS NULL THEN NULL ELSE private.public_name(t.user_id) END,
         private.is_blocked(t.user_id),
         l.title,
         l.status,
         (SELECT count(*)::int FROM public.reports o
           WHERE o.target_type = r.target_type AND o.target_id = r.target_id AND o.status = 'open')
    FROM public.reports r
    LEFT JOIN public.listings l ON r.target_type = 'listing' AND l.id::text = r.target_id
    LEFT JOIN public.conversations c ON r.target_type = 'conversation' AND c.id::text = r.target_id
    CROSS JOIN LATERAL (
      SELECT CASE r.target_type
               WHEN 'listing' THEN l.owner_id
               WHEN 'user' THEN (SELECT p.id FROM public.profiles p WHERE p.id::text = r.target_id)
               WHEN 'conversation' THEN CASE WHEN c.renter_id = r.reporter_id THEN c.owner_id ELSE c.renter_id END
             END AS user_id
    ) t
   WHERE private.is_admin() AND (r.status = 'open') = _open
   ORDER BY r.created_at DESC
   LIMIT 200
$$;

CREATE OR REPLACE FUNCTION public.admin_open_report_count()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN private.is_admin() THEN (SELECT count(*)::int FROM public.reports WHERE status = 'open') ELSE 0 END
$$;

CREATE OR REPLACE FUNCTION public.admin_listings(_search text DEFAULT '')
RETURNS TABLE (
  id uuid,
  title text,
  status text,
  listing_type text,
  city text,
  owner_id uuid,
  owner_name text,
  owner_blocked boolean,
  created_at timestamptz,
  moderation_reason text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.id, l.title, l.status, l.listing_type, l.city, l.owner_id, l.owner_name,
         private.is_blocked(l.owner_id), l.created_at, l.moderation_reason
    FROM public.listings l
   WHERE private.is_admin()
     AND (COALESCE(_search, '') = '' OR l.title ILIKE '%' || _search || '%')
   ORDER BY l.created_at DESC
   LIMIT 100
$$;

CREATE OR REPLACE FUNCTION public.admin_blocked_users()
RETURNS TABLE (id uuid, name text, blocked_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, private.public_name(p.id), p.blocked_at
    FROM public.profiles p
   WHERE private.is_admin() AND p.blocked_at IS NOT NULL
   ORDER BY p.blocked_at DESC
$$;

-- Messages of a conversation, only once someone in it has reported it.
CREATE OR REPLACE FUNCTION public.admin_reported_conversation(_conversation_id uuid)
RETURNS TABLE (sender_name text, body text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN m.sender_id IS NULL THEN 'Raderat konto' ELSE private.public_name(m.sender_id) END,
         m.body, m.created_at
    FROM public.messages m
   WHERE m.conversation_id = _conversation_id
     AND private.is_admin()
     AND EXISTS (
       SELECT 1 FROM public.reports r
        WHERE r.target_type = 'conversation' AND r.target_id = _conversation_id::text
     )
   ORDER BY m.created_at
   LIMIT 500
$$;

-- 4. Admin actions ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_set_listing_hidden(_listing_id uuid, _hidden boolean, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'Bara för administratörer'; END IF;
  IF _hidden AND char_length(btrim(COALESCE(_reason, ''))) = 0 THEN
    RAISE EXCEPTION 'Ange ett skäl som visas för annonsören';
  END IF;
  UPDATE public.listings
     SET status = CASE WHEN _hidden THEN 'removed' ELSE 'published' END,
         moderation_reason = CASE WHEN _hidden THEN btrim(_reason) END
   WHERE listings.id = _listing_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Annonsen finns inte'; END IF;
  IF _hidden THEN
    UPDATE public.reports
       SET status = 'resolved', resolution = 'Annonsen dold', resolved_at = now(), resolved_by = auth.uid()
     WHERE reports.target_type = 'listing' AND reports.target_id = _listing_id::text AND reports.status = 'open';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.admin_dismiss_report(_report_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'Bara för administratörer'; END IF;
  UPDATE public.reports
     SET status = 'resolved', resolution = 'Ingen åtgärd', resolved_at = now(), resolved_by = auth.uid()
   WHERE reports.id = _report_id AND reports.status = 'open';
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_user_blocked(_user_id uuid, _blocked boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'Bara för administratörer'; END IF;
  IF _blocked AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Administratörer kan inte spärras';
  END IF;
  UPDATE public.profiles SET blocked_at = CASE WHEN _blocked THEN now() END WHERE profiles.id = _user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Användaren finns inte'; END IF;
  IF _blocked THEN
    -- Hide everything the user has published. Unblocking does not bring it back;
    -- restore listings one by one under "Annonser" if needed.
    UPDATE public.listings
       SET status = 'removed', moderation_reason = 'Kontot är spärrat'
     WHERE owner_id = _user_id AND status <> 'removed';
    UPDATE public.reports
       SET status = 'resolved', resolution = 'Användaren spärrad', resolved_at = now(), resolved_by = auth.uid()
     WHERE reports.status = 'open'
       AND reports.reporter_id IS DISTINCT FROM _user_id
       AND (
         (reports.target_type = 'user' AND reports.target_id = _user_id::text)
         OR (reports.target_type = 'listing'
             AND reports.target_id IN (SELECT l.id::text FROM public.listings l WHERE l.owner_id = _user_id))
         OR (reports.target_type = 'conversation'
             AND reports.target_id IN (SELECT c.id::text FROM public.conversations c
                                        WHERE _user_id IN (c.renter_id, c.owner_id)))
       );
  END IF;
END $$;

REVOKE ALL ON FUNCTION
  public.admin_reports(boolean),
  public.admin_open_report_count(),
  public.admin_listings(text),
  public.admin_blocked_users(),
  public.admin_reported_conversation(uuid),
  public.admin_set_listing_hidden(uuid, boolean, text),
  public.admin_dismiss_report(uuid),
  public.admin_set_user_blocked(uuid, boolean)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.admin_reports(boolean),
  public.admin_open_report_count(),
  public.admin_listings(text),
  public.admin_blocked_users(),
  public.admin_reported_conversation(uuid),
  public.admin_set_listing_hidden(uuid, boolean, text),
  public.admin_dismiss_report(uuid),
  public.admin_set_user_blocked(uuid, boolean)
TO authenticated;

-- 5. Email to the admin about a new report (server only) ---------------------------
-- Returns the report once, and only for the first report on a target, so the admin
-- gets at most one email per reported listing/user/conversation until it's handled.

CREATE OR REPLACE FUNCTION public.claim_report_notification(_report_id uuid, _reporter uuid)
RETURNS TABLE (reason text, target_type text, open_reports integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.reports%ROWTYPE;
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
  RETURN QUERY SELECT r.reason, r.target_type, (SELECT count(*)::int FROM public.reports o WHERE o.status = 'open');
END $$;

REVOKE ALL ON FUNCTION public.claim_report_notification(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_report_notification(uuid, uuid) TO service_role;

-- 6. Helper functions are not callable from outside -----------------------------------

REVOKE ALL ON FUNCTION private.is_blocked(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_blocked(uuid) TO authenticated;
REVOKE ALL ON FUNCTION private.listings_moderation_guard(), private.messages_block_guard() FROM PUBLIC, anon;
