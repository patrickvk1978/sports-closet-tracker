-- Phase 5: Add narrative_day column to sim_results
-- Tracks which tournament day the last narrative was generated for,
-- enabling reliable day-opener detection without parsing LLM text.

ALTER TABLE public.sim_results
  ADD COLUMN IF NOT EXISTS narrative_day int NOT NULL DEFAULT 0;
