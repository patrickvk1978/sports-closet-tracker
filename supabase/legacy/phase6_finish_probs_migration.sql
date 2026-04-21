-- Phase 6: Add exact finish-place probability columns to sim_results
-- Run this in Supabase SQL Editor before running the updated simulator.

ALTER TABLE public.sim_results
  ADD COLUMN IF NOT EXISTS finish_probs jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS prev_finish_probs jsonb NOT NULL DEFAULT '{}';
