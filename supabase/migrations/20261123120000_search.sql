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
--    The query is built from the filters in use, so that Postgres can use the index.
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

-- Search words as one regular expression ("borr|slapv"): only a-z and 0-9 are kept, so the
-- pattern can't contain anything but literal letters; at most 20 words of 30 characters.
CREATE OR REPLACE FUNCTION private.search_pattern(_words text[])
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT nullif(array_to_string(ARRAY(
    SELECT w FROM (
      SELECT left(regexp_replace(lower(x), '[^a-z0-9]', '', 'g'), 30) AS w FROM unnest(_words) x
    ) t WHERE w <> '' LIMIT 20), '|'), '')
$$;

-- _words: the search words, already normalised and cut to 5 letters by the site; a listing
--   matches when any of them occurs in its text (same rule as the old search in the browser).
-- _sub_words: the chosen subcategory's words (src/lib/search/attributes.ts); any of them in the
--   title or description. _sub_exclude_words: the words of the subcategories listed before it,
--   so that a listing belongs to the first subcategory it matches, as before ("obromsad" is not
--   "bromsad").
-- _lat/_lng/_radius_km: distance filter; leave out for all of Stockholm county.
-- _start/_end: only listings that are free all those days and can be rented that short.
-- _sort: recommended (real listings before examples, then nearest, then newest), price,
--   price_desc, distance or newest.
-- _with_description: also return the description (for attribute filters in the browser).
--
-- The query is put together from the filters that are in use and run with EXECUTE, so that
-- Postgres plans it with the actual values and can use the trigram index for the words. Values
-- are passed with USING, never pasted into the SQL text.
CREATE OR REPLACE FUNCTION public.search_listings(
  _cities text[],
  _words text[] DEFAULT '{}',
  _category text DEFAULT NULL,
  _sub_words text[] DEFAULT '{}',
  _sub_exclude_words text[] DEFAULT '{}',
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
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_words text := private.search_pattern(_words);
  v_sub text := private.search_pattern(_sub_words);
  v_exclude text := private.search_pattern(_sub_exclude_words);
  v_days integer := CASE WHEN _start IS NOT NULL AND _end IS NOT NULL AND _end >= _start
                              AND _end - _start <= 366 THEN _end - _start + 1 END;
  v_near boolean := _lat IS NOT NULL AND _lng IS NOT NULL;
  v_where text[] := ARRAY['l.status = ''published''', 'l.listing_type = ''rent''',
                          'l.city = ANY ($1)'];
  v_order text;
BEGIN
  IF _category IS NOT NULL THEN v_where := array_append(v_where, 'l.category_slug = $2'); END IF;
  IF v_words IS NOT NULL THEN
    v_where := array_append(v_where,
      'private.search_text(l.title, l.description, l.category_slug, l.city, l.area) ~ $3');
  END IF;
  IF v_sub IS NOT NULL THEN
    v_where := array_append(v_where, 'private.search_text(l.title, l.description, NULL, NULL, NULL) ~ $4');
    IF v_exclude IS NOT NULL THEN
      v_where := array_append(v_where, 'private.search_text(l.title, l.description, NULL, NULL, NULL) !~ $5');
    END IF;
  END IF;
  IF _price_min IS NOT NULL THEN v_where := array_append(v_where, 'l.price_day >= $6'); END IF;
  IF _price_max IS NOT NULL THEN v_where := array_append(v_where, 'l.price_day <= $7'); END IF;
  IF _owner_type IS NOT NULL THEN v_where := array_append(v_where, 'l.owner_type::text = $8'); END IF;
  IF v_days IS NOT NULL THEN
    v_where := array_append(v_where, 'l.min_days <= $9');
    v_where := array_append(v_where,
      'l.id <> ALL (ARRAY(SELECT u FROM public.unavailable_listings($10, $11) u))');
  END IF;

  v_order := CASE _sort
    WHEN 'price' THEN 'f.price_day ASC, '
    WHEN 'price_desc' THEN 'f.price_day DESC, '
    WHEN 'distance' THEN 'f.dist ASC NULLS LAST, '
    WHEN 'newest' THEN ''
    ELSE '(f.owner_id IS NULL), f.dist ASC NULLS LAST, '
  END;

  RETURN QUERY EXECUTE format($q$
    WITH found AS (
      SELECT l.*, %s AS dist
        FROM public.listings l
       WHERE %s
    )
    SELECT f.id, f.title, %s, f.city, f.area, f.lat, f.lng, f.images[1], f.price_day,
           f.owner_type::text, f.owner_id, f.category_slug, COALESCE(f.published_at, f.created_at),
           f.min_days, f.dist, (count(*) OVER ())::int
      FROM found f
     WHERE %s
     ORDER BY %s COALESCE(f.published_at, f.created_at) DESC, f.id
     LIMIT $12 OFFSET $13
  $q$,
    CASE WHEN v_near THEN
      'round((2 * 6371 * asin(sqrt(power(sin(radians(l.lat - $14) / 2), 2)'
      || ' + cos(radians($14)) * cos(radians(l.lat))'
      || ' * power(sin(radians(l.lng - $15) / 2), 2))))::numeric, 1)::double precision'
    ELSE 'NULL::double precision' END,
    array_to_string(v_where, ' AND '),
    CASE WHEN _with_description THEN 'f.description' ELSE 'NULL::text' END,
    CASE WHEN v_near AND _radius_km IS NOT NULL THEN 'f.dist <= $16' ELSE 'true' END,
    v_order)
  USING _cities, _category, v_words, v_sub, v_exclude, _price_min, _price_max, _owner_type,
        v_days, _start, _end,
        least(greatest(coalesce(_limit, 24), 1), 500), greatest(coalesce(_offset, 0), 0),
        _lat, _lng, _radius_km;
END $fn$;

REVOKE ALL ON FUNCTION public.search_listings(
  text[], text[], text, text[], text[], double precision, double precision, double precision,
  date, date, numeric, numeric, text, text, integer, integer, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_listings(
  text[], text[], text, text[], text[], double precision, double precision, double precision,
  date, date, numeric, numeric, text, text, integer, integer, boolean
) TO anon, authenticated;
