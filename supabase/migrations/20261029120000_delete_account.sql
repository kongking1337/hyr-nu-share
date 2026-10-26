-- Delete your own account (task 6 in docs/mvp-plan.md).
--
-- Removes the login. The existing ON DELETE CASCADE rules then remove the
-- profile, listings, favourites, saved searches and conversations (with their
-- messages, also for the other person). Reports the user filed are kept without
-- the reporter. Safe to run more than once.

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  DELETE FROM auth.users WHERE id = auth.uid();
END $$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
