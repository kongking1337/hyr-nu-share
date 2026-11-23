-- Search in the database (docs/performance-review.md, step 4).
--
-- Until now the site downloaded the 200 newest listings and filtered them in the browser, so
-- older listings were never found once there were more than 200, and every search downloaded
-- the same rows again. search_listings() does the filtering, sorting and paging here and returns
-- one page of result cards plus the total number of hits.
--
-- 1. private.search_text(): a listing's text in lower case without å/ä/ö accents and punctuation,
--    the same way the site normalises search words (normalize() in src/lib/geo.ts).
-- 2. A trigram index on that text (pg_trgm), so that words can be found anywhere in the text,
--    also inside compound words ("borr" in "slagborrmaskin"), without reading every listing.
-- 3. search_listings(): text, category, subcategory words, municipality list, distance, free
--    dates, price, private/company, sorting and paging. Only published rentals, like before.
--
-- Nothing changes in who can see what: the function returns only published rental listings and
-- the same columns the listing cards already showed. Safe to run more than once. Tested locally
-- with supabase/tests/permissions.test.mjs

-- 1. Normalised text -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.search_text(
  _title text, _description text, _category text, _city text, _area text
)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT regexp_replace(
    translate(
      lower(coalesce(_title, '') || ' ' || coalesce(_description, '') || ' ' || coalesce(_category, '')
            || ' ' || coalesce(_city, '') || ' ' || coalesce(_area, '')),
      'åäöÅÄÖ', 'aaoaao'),
    '[^a-z0-9 ]', ' ', 'g')
$$;

-- 2. Trigram index -------------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- The operator class lives in whichever schema pg_trgm was installed in.
DO $$
DECLARE
  s text;
BEGIN
  SELECT n.nspname INTO s
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
   WHERE e.extname = 'pg_trgm';
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS listings_search_trgm ON public.listings USING gin '
    '(private.search_text(title, description, category_slug, city, area) %I.gin_trgm_ops) '
    'WHERE status = ''published'' AND listing_type = ''rent''', s);
END $$;

-- 3. Search --------------------------------------------------------------------------------------

-- _words: the search words, already normalised and cut to 5 letters by the site; a listing
--   matches when any of them occurs in its text (same rule as the old search in the browser).
-- _sub_words: the chosen subcategory's words (src/lib/search/attributes.ts); any of them in the
--   title or description.
-- _lat/_lng/_radius_km: distance filter; leave out for all of Stockholm county.
-- _start/_end: only listings that are free all those days and can be rented that short.
-- _sort: recommended (real listings before examples, then nearest, then newest), price,
--   price_desc, distance or newest.
-- _with_description: also return the description (for attribute filters in the browser).
CREATE OR REPLACE FUNCTION public.search_listings(
  _cities text[],
  _words text[] DEFAULT '{}',
  _category text DEFAULT NULL,
  _sub_words text[] DEFAULT '{}',
  _lat double precision DEFAULT NULL,
  _lng double precision DEFAULT NULL,
  _radius_km double precision DEFAULT NULL,
  _start date DEFAULT NULL,
  _end date DEFAULT NULL,
  _price_min numeric DEFAULT NULL,
  _price_max numeric DEFAULT NULL,
  _owner_type text DEFAULT NULL,
  _sort text DEFAULT 'recommended',
  _limit integer DEFAULT 24,
  _offset integer DEFAULT 0,
  _with_description boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  city text,
  area text,
  lat double precision,
  lng double precision,
  image text,
  price_day numeric,
  owner_type text,
  owner_id uuid,
  category_slug text,
  published_at timestamptz,
  min_days integer,
  distance_km double precision,
  total_count integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH p AS (
    SELECT
      nullif(array_to_string(ARRAY(
        SELECT w FROM (SELECT regexp_replace(lower(x), '[^a-z0-9]', '', 'g') AS w FROM unnest(_words) x) t
         WHERE w <> ''), '|'), '') AS word_re,
      nullif(array_to_string(ARRAY(
        SELECT w FROM (SELECT regexp_replace(lower(x), '[^a-z0-9]', '', 'g') AS w FROM unnest(_sub_words) x) t
         WHERE w <> ''), '|'), '') AS sub_re,
      CASE WHEN _start IS NOT NULL AND _end IS NOT NULL AND _end >= _start AND _end - _start <= 366
           THEN _end - _start + 1 END AS days
  ),
  busy AS MATERIALIZED (
    SELECT u AS listing_id FROM p, public.unavailable_listings(_start, _end) u WHERE p.days IS NOT NULL
  ),
  hits AS (
    SELECT l.*,
           CASE WHEN _lat IS NULL OR _lng IS NULL THEN NULL
                ELSE round((2 * 6371 * asin(sqrt(
                       power(sin(radians(l.lat - _lat) / 2), 2)
                       + cos(radians(_lat)) * cos(radians(l.lat)) * power(sin(radians(l.lng - _lng) / 2), 2)
                     )))::numeric, 1)::double precision
           END AS dist
      FROM public.listings l, p
     WHERE l.status = 'published' AND l.listing_type = 'rent'
       AND l.city = ANY (_cities)
       AND (_category IS NULL OR l.category_slug = _category)
       AND (p.word_re IS NULL
            OR private.search_text(l.title, l.description, l.category_slug, l.city, l.area) ~ p.word_re)
       AND (p.sub_re IS NULL OR private.search_text(l.title, l.description, NULL, NULL, NULL) ~ p.sub_re)
       AND (_price_min IS NULL OR l.price_day >= _price_min)
       AND (_price_max IS NULL OR l.price_day <= _price_max)
       AND (_owner_type IS NULL OR l.owner_type::text = _owner_type)
       AND (p.days IS NULL OR (l.min_days <= p.days
            AND NOT EXISTS (SELECT 1 FROM busy b WHERE b.listing_id = l.id)))
  ),
  found AS (
    SELECT * FROM hits WHERE _radius_km IS NULL OR dist IS NULL OR dist <= _radius_km
  )
  SELECT f.id, f.title,
         CASE WHEN _with_description THEN f.description END,
         f.city, f.area, f.lat, f.lng, f.images[1], f.price_day, f.owner_type::text, f.owner_id,
         f.category_slug, COALESCE(f.published_at, f.created_at), f.min_days, f.dist,
         (count(*) OVER ())::int
    FROM found f
   ORDER BY
     CASE WHEN _sort = 'recommended' THEN (f.owner_id IS NULL)::int END,
     CASE WHEN _sort IN ('recommended', 'distance') THEN f.dist END,
     CASE WHEN _sort = 'price' THEN f.price_day END ASC,
     CASE WHEN _sort = 'price_desc' THEN f.price_day END DESC,
     COALESCE(f.published_at, f.created_at) DESC,
     f.id
   LIMIT least(greatest(_limit, 1), 500) OFFSET greatest(_offset, 0)
$$;

REVOKE ALL ON FUNCTION public.search_listings(
  text[], text[], text, text[], double precision, double precision, double precision, date, date,
  numeric, numeric, text, text, integer, integer, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_listings(
  text[], text[], text, text[], double precision, double precision, double precision, date, date,
  numeric, numeric, text, text, integer, integer, boolean
) TO anon, authenticated;
