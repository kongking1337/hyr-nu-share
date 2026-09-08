REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_stale_offers() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.place_offer(uuid, date, date, integer, numeric, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.respond_offer(uuid, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_offer(uuid, date, date, integer, numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_offer(uuid, text, numeric, text) TO authenticated;