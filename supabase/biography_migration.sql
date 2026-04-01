-- Add biography_theses column to sim_results
-- Stores per-player Sonnet-generated thesis text: { "playerName": "thesis text", ... }
ALTER TABLE public.sim_results
  ADD COLUMN IF NOT EXISTS biography_theses jsonb NOT NULL DEFAULT '{}';
