-- Sell and rent (task 3 in docs/mvp-plan.md).
--
-- A listing is either for sale ("Säljes") or for rent ("Uthyres").
--   sale: one price in kr in `price` (0 = "Skänkes", given away). Can be marked sold.
--   rent: price per day in `price_day`, as before.
-- Existing listings are rentals. Safe to run more than once.

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS listing_type text NOT NULL DEFAULT 'rent',
  ADD COLUMN IF NOT EXISTS price numeric;

ALTER TABLE public.listings ALTER COLUMN price_day DROP NOT NULL;

ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_type_check;
ALTER TABLE public.listings
  ADD CONSTRAINT listings_type_check CHECK (listing_type IN ('sale', 'rent'));

ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_price_check;
ALTER TABLE public.listings
  ADD CONSTRAINT listings_price_check CHECK (
    CASE listing_type
      WHEN 'sale' THEN price IS NOT NULL AND price >= 0
      ELSE price_day IS NOT NULL AND price_day >= 0
    END
  );

-- Only things for sale can be sold. Sold listings are not "published", so the
-- existing rules already hide them from everyone but the owner.
ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_sold_check;
ALTER TABLE public.listings
  ADD CONSTRAINT listings_sold_check CHECK (status <> 'sold' OR listing_type = 'sale');
