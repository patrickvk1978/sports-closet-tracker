-- Phase 4 Migration: Dashboard simplification + AI narratives
-- Run in Supabase SQL editor

ALTER TABLE public.sim_results
  ADD COLUMN IF NOT EXISTS prev_player_probs jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS narratives jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS player_leverage jsonb NOT NULL DEFAULT '{}';
