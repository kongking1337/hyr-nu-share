-- Contact the seller (task 4 in docs/mvp-plan.md).
--
-- Buyers start a conversation about a listing with start_conversation(); the inbox
-- comes from my_conversations(), which shows the other person's public name only
-- ("Anna S."), never an email address. Read status and email-notification state
-- are kept per party on the conversation. Safe to run more than once.

-- 1. One conversation per buyer and listing; read/notify state per party ------

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS renter_last_read_at timestamptz NOT NULL DEFAULT '-infinity',
  ADD COLUMN IF NOT EXISTS owner_last_read_at timestamptz NOT NULL DEFAULT '-infinity',
  ADD COLUMN IF NOT EXISTS renter_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS owner_notified_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS conversations_listing_renter_key
  ON public.conversations (listing_id, renter_id);

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_body_length;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_body_length
  CHECK (kind <> 'text' OR char_length(btrim(body)) BETWEEN 1 AND 2000);

-- 2. A new message moves the conversation to the top and counts as read by its sender

CREATE OR REPLACE FUNCTION private.messages_touch_conversation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.conversations
     SET last_message_at = NEW.created_at,
         renter_last_read_at = CASE WHEN renter_id = NEW.sender_id THEN NEW.created_at ELSE renter_last_read_at END,
         owner_last_read_at = CASE WHEN owner_id = NEW.sender_id THEN NEW.created_at ELSE owner_last_read_at END
   WHERE id = NEW.conversation_id;
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION private.messages_touch_conversation() FROM PUBLIC, anon;

CREATE OR REPLACE TRIGGER messages_touch_conversation AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION private.messages_touch_conversation();

-- 3. Start (or continue) a conversation about a listing -----------------------

CREATE OR REPLACE FUNCTION public.start_conversation(_listing_id uuid, _body text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  l record;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Logga in för att skicka meddelanden'; END IF;
  SELECT id, owner_id, status INTO l FROM public.listings WHERE id = _listing_id;
  IF NOT FOUND OR l.status <> 'published' THEN RAISE EXCEPTION 'Annonsen finns inte längre'; END IF;
  IF l.owner_id IS NULL THEN RAISE EXCEPTION 'Exempelannonser går inte att svara på'; END IF;
  IF l.owner_id = v_uid THEN RAISE EXCEPTION 'Det här är din egen annons'; END IF;
  IF char_length(btrim(COALESCE(_body, ''))) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'Meddelandet måste vara mellan 1 och 2000 tecken';
  END IF;

  INSERT INTO public.conversations (listing_id, renter_id, owner_id)
  VALUES (_listing_id, v_uid, l.owner_id)
  ON CONFLICT (listing_id, renter_id) DO NOTHING;
  SELECT id INTO v_id FROM public.conversations WHERE listing_id = _listing_id AND renter_id = v_uid;

  INSERT INTO public.messages (conversation_id, sender_id, body) VALUES (v_id, v_uid, btrim(_body));
  RETURN v_id;
END $$;

-- 4. Inbox, read status and unread count ---------------------------------------

CREATE OR REPLACE FUNCTION public.my_conversations()
RETURNS TABLE (
  id uuid,
  listing_id uuid,
  listing_title text,
  listing_image text,
  counterpart_name text,
  i_am_seller boolean,
  last_message text,
  last_message_at timestamptz,
  unread boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id,
         c.listing_id,
         COALESCE(l.title, 'Borttagen annons'),
         l.images[1],
         private.public_name(CASE WHEN c.owner_id = auth.uid() THEN c.renter_id ELSE c.owner_id END),
         c.owner_id = auth.uid(),
         (SELECT m.body FROM public.messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1),
         c.last_message_at,
         EXISTS (
           SELECT 1 FROM public.messages m
            WHERE m.conversation_id = c.id
              AND m.sender_id IS DISTINCT FROM auth.uid()
              AND m.created_at > CASE WHEN c.owner_id = auth.uid() THEN c.owner_last_read_at ELSE c.renter_last_read_at END
         )
    FROM public.conversations c
    LEFT JOIN public.listings l ON l.id = c.listing_id
   WHERE auth.uid() IN (c.renter_id, c.owner_id)
   ORDER BY c.last_message_at DESC
$$;

CREATE OR REPLACE FUNCTION public.mark_conversation_read(_conversation_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.conversations
     SET renter_last_read_at = CASE WHEN renter_id = auth.uid() THEN now() ELSE renter_last_read_at END,
         owner_last_read_at = CASE WHEN owner_id = auth.uid() THEN now() ELSE owner_last_read_at END
   WHERE id = _conversation_id AND auth.uid() IN (renter_id, owner_id)
$$;

CREATE OR REPLACE FUNCTION public.unread_conversation_count()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.my_conversations() WHERE unread
$$;

REVOKE ALL ON FUNCTION public.start_conversation(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_conversations() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_conversation_read(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unread_conversation_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.start_conversation(uuid, text),
  public.my_conversations(),
  public.mark_conversation_read(uuid),
  public.unread_conversation_count()
TO authenticated;

-- 5. Email notifications (server only) -------------------------------------------
-- Called by the site's server with the service role key after a message is sent.
-- Returns the recipient's email address at most once per unread streak: only when
-- the recipient has read the conversation since the last email, and only if the
-- sender has an unread message waiting. Never callable from the browser.

CREATE OR REPLACE FUNCTION public.claim_message_notification(_conversation_id uuid, _sender uuid)
RETURNS TABLE (email text, listing_title text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.conversations%ROWTYPE;
  v_to_owner boolean;
  v_recipient uuid;
  v_read timestamptz;
  v_notified timestamptz;
BEGIN
  SELECT * INTO c FROM public.conversations WHERE conversations.id = _conversation_id FOR UPDATE;
  IF NOT FOUND OR _sender IS NULL OR _sender NOT IN (c.renter_id, c.owner_id) THEN RETURN; END IF;

  v_to_owner := _sender = c.renter_id;
  v_recipient := CASE WHEN v_to_owner THEN c.owner_id ELSE c.renter_id END;
  v_read := CASE WHEN v_to_owner THEN c.owner_last_read_at ELSE c.renter_last_read_at END;
  v_notified := CASE WHEN v_to_owner THEN c.owner_notified_at ELSE c.renter_notified_at END;

  IF v_notified IS NOT NULL AND v_notified > v_read THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.messages m
     WHERE m.conversation_id = c.id AND m.sender_id = _sender AND m.created_at > v_read
  ) THEN
    RETURN;
  END IF;

  UPDATE public.conversations
     SET owner_notified_at = CASE WHEN v_to_owner THEN now() ELSE owner_notified_at END,
         renter_notified_at = CASE WHEN v_to_owner THEN renter_notified_at ELSE now() END
   WHERE conversations.id = c.id;

  RETURN QUERY
    SELECT u.email::text, COALESCE((SELECT l.title FROM public.listings l WHERE l.id = c.listing_id), 'en annons')
      FROM auth.users u
     WHERE u.id = v_recipient AND u.email IS NOT NULL;
END $$;

REVOKE ALL ON FUNCTION public.claim_message_notification(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_message_notification(uuid, uuid) TO service_role;
