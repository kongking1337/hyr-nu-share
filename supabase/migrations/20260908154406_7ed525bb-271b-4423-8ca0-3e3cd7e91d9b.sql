ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS published_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS vehicle jsonb,
  ADD COLUMN IF NOT EXISTS views_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clicks_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS favorite_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS share_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS request_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quality_score integer;