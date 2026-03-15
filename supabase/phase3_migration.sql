-- ─── Phase 3 Migration ──────────────────────────────────────────────────────────
-- Run this in your Supabase project (SQL Editor > New Query) after Phase 2 schema.

-- 1. Add win_prob_home to games table
-- Nullable float [0,1]; NULL = no ESPN probability data yet.
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS win_prob_home float
    CHECK (win_prob_home IS NULL OR (win_prob_home >= 0 AND win_prob_home <= 1));

-- 2. Create sim_results table
-- One row per pool (UNIQUE on pool_id), replaced on each simulation run.
-- player_probs: { "username": 0.234 }
-- leverage_games: matches LEVERAGE_GAMES mock shape
-- best_paths: matches BEST_PATH mock shape
CREATE TABLE IF NOT EXISTS public.sim_results (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pool_id        uuid NOT NULL REFERENCES public.pools(id) ON DELETE CASCADE,
  run_at         timestamptz NOT NULL DEFAULT now(),
  iterations     int NOT NULL,
  player_probs   jsonb NOT NULL DEFAULT '{}',
  leverage_games jsonb NOT NULL DEFAULT '[]',
  best_paths     jsonb NOT NULL DEFAULT '{}',
  UNIQUE (pool_id)
);

ALTER TABLE public.sim_results ENABLE ROW LEVEL SECURITY;

-- Pool members can read their pool's sim results
CREATE POLICY "sim_results_select" ON public.sim_results
  FOR SELECT
  USING (pool_id IN (SELECT pool_id FROM public.pool_members WHERE user_id = auth.uid()));

-- Admins can write (insert/update/delete)
CREATE POLICY "sim_results_write" ON public.sim_results
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- Enable Realtime for sim_results
ALTER PUBLICATION supabase_realtime ADD TABLE public.sim_results;
