-- Spam limits (task 8 in docs/mvp-plan.md).
--
-- Text and price limits on listings and profiles, and per-user rate limits on
-- listings, conversations, messages and reports. The checks only apply to new and
-- changed rows (NOT VALID), so existing data is left alone. Statements run by the
-- platform itself (SQL editor, service role) are not limited. Safe to run more
-- than once.

-- 1. Text and price limits ----------------------------------------------------------

ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_text_limits;
ALTER TABLE public.listings ADD CONSTRAINT listings_text_limits CHECK (
  char_length(btrim(title)) BETWEEN 3 AND 100
  AND char_length(description) <= 5000
  AND char_length(COALESCE(area, '')) <= 60
) NOT VALID;

ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_price_limits;
ALTER TABLE public.listings ADD CONSTRAINT listings_price_limits CHECK (
  COALESCE(price, 0) <= 10000000
  AND COALESCE(price_day, 0) <= 1000000
  AND COALESCE(price_week, 0) BETWEEN 0 AND 1000000
  AND COALESCE(deposit, 0) BETWEEN 0 AND 1000000
) NOT VALID;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_text_limits;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_text_limits CHECK (
  char_length(full_name) <= 80 AND char_length(COALESCE(city, '')) <= 60
) NOT VALID;

-- 2. Rate limits ----------------------------------------------------------------------

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
    RAISE EXCEPTION 'Du kan ha högst 50 aktiva annonser. Ta bort eller markera några som sålda först.';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER listings_rate_limit BEFORE INSERT ON public.listings
  FOR EACH ROW WHEN (NEW.owner_id IS NOT NULL) EXECUTE FUNCTION private.listings_rate_limit();

CREATE OR REPLACE FUNCTION private.conversations_rate_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user = 'postgres' AND auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF (SELECT count(*) FROM public.conversations
       WHERE renter_id = NEW.renter_id AND created_at > now() - interval '1 hour') >= 10 THEN
    RAISE EXCEPTION 'Du har kontaktat många annonsörer på kort tid. Vänta en stund och försök igen.';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER conversations_rate_limit BEFORE INSERT ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION private.conversations_rate_limit();

CREATE OR REPLACE FUNCTION private.messages_rate_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user = 'postgres' AND auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NEW.sender_id IS NOT NULL AND (SELECT count(*) FROM public.messages
       WHERE sender_id = NEW.sender_id AND created_at > now() - interval '10 minutes') >= 30 THEN
    RAISE EXCEPTION 'Du har skickat många meddelanden på kort tid. Vänta en stund och försök igen.';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER messages_rate_limit BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION private.messages_rate_limit();

CREATE OR REPLACE FUNCTION private.reports_rate_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user = 'postgres' AND auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF (SELECT count(*) FROM public.reports
       WHERE reporter_id = NEW.reporter_id AND created_at > now() - interval '24 hours') >= 20 THEN
    RAISE EXCEPTION 'Du har skickat många anmälningar i dag. Försök igen i morgon.';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER reports_rate_limit BEFORE INSERT ON public.reports
  FOR EACH ROW WHEN (NEW.reporter_id IS NOT NULL) EXECUTE FUNCTION private.reports_rate_limit();

REVOKE ALL ON FUNCTION
  private.listings_rate_limit(),
  private.conversations_rate_limit(),
  private.messages_rate_limit(),
  private.reports_rate_limit()
FROM PUBLIC, anon;
