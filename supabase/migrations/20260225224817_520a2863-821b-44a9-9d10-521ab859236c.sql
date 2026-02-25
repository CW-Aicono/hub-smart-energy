
-- Add source, valid_until, and is_archived columns to arbitrage_strategies
ALTER TABLE public.arbitrage_strategies
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS valid_until timestamptz,
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
