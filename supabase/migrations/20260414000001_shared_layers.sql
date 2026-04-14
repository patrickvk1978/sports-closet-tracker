-- ============================================================
-- MIGRATION 001: SHARED OUTPUT LAYERS
-- The 3 reusable layers (Codex plan) that every game type writes to
-- and every frontend reads from.
-- ============================================================

-- ------------------------------------------------------------
-- LAYER 1: Probability Inputs
-- Raw probability data from any source, any game type.
-- Written by Python adapters (poller / ESPN / markets).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.probability_inputs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_key  TEXT NOT NULL,           -- 'march_madness', 'nba_playoffs', etc.
  entity_type  TEXT NOT NULL,           -- 'game', 'series', 'pick_slot'
  entity_id    TEXT NOT NULL,           -- 'east-r1-3', 'game-42', 'slot-7'
  source_type  TEXT NOT NULL,           -- 'espn', 'market', 'model', 'elo'
  source_name  TEXT NOT NULL,           -- 'espn_bpi', 'consensus_market', 'internal_sim'
  probabilities JSONB NOT NULL,         -- {home_win_pct: 61, away_win_pct: 39} or game-specific
  captured_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prob_inputs_unique
  ON public.probability_inputs (product_key, entity_id, source_type, source_name, captured_at);

CREATE INDEX IF NOT EXISTS idx_prob_inputs_lookup
  ON public.probability_inputs (product_key, entity_id, source_type);

CREATE INDEX IF NOT EXISTS idx_prob_inputs_recent
  ON public.probability_inputs (product_key, captured_at DESC);


-- ------------------------------------------------------------
-- LAYER 2: Simulation Outputs
-- Per-entry standings in a pool at a point in time.
-- Written by Python simulation adapter after each run.
-- Read by frontend Leaderboard component (any game type).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.simulation_outputs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_key  TEXT NOT NULL,
  pool_id      UUID REFERENCES public.pools(id) ON DELETE CASCADE,
  entry_id     UUID REFERENCES public.pool_entries(id) ON DELETE CASCADE,
  -- legacy: user_id kept for backward compat with existing tournament-tracker sim_results queries
  user_id      UUID REFERENCES public.profiles(id),
  window_key   TEXT NOT NULL DEFAULT 'current',  -- 'current', 'round_1', 'final', etc.
  win_odds     NUMERIC,                           -- % chance to win pool
  points_total NUMERIC DEFAULT 0,
  points_back  NUMERIC,                           -- points behind leader
  rank         INTEGER,
  max_possible NUMERIC,                           -- can they still win?
  details      JSONB DEFAULT '{}',                -- game-specific breakdown
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sim_outputs_unique
  ON public.simulation_outputs (pool_id, entry_id, window_key)
  WHERE entry_id IS NOT NULL;

-- Legacy index for tournament-tracker queries that use user_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_sim_outputs_legacy_unique
  ON public.simulation_outputs (pool_id, user_id, window_key)
  WHERE entry_id IS NULL AND user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sim_outputs_pool
  ON public.simulation_outputs (pool_id, window_key, rank);

-- Enable realtime
ALTER TABLE public.simulation_outputs REPLICA IDENTITY FULL;


-- ------------------------------------------------------------
-- LAYER 3: Commentary Outputs
-- Structured narrative cards any frontend can render.
-- Written by Python narrative pipeline.
-- Read by CommentaryCard component (any game type).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.commentary_outputs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_key   TEXT NOT NULL,
  pool_id       UUID REFERENCES public.pools(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES public.profiles(id),   -- NULL = pool-wide commentary
  headline      TEXT NOT NULL,
  body          TEXT,
  action_label  TEXT,        -- e.g. 'Open reports', 'View bracket'
  action_target TEXT,        -- e.g. '/reports', '/bracket/user-123'
  priority      TEXT DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  tags          TEXT[] DEFAULT '{}',
  persona       TEXT DEFAULT 'default',
  metadata      JSONB DEFAULT '{}',
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commentary_pool
  ON public.commentary_outputs (pool_id, priority, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_commentary_tags
  ON public.commentary_outputs USING GIN (tags);

-- Enable realtime
ALTER TABLE public.commentary_outputs REPLICA IDENTITY FULL;
