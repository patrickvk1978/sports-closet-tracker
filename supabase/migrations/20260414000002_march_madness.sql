-- ============================================================
-- MIGRATION 002: MARCH MADNESS SCHEMA
-- Game-specific raw data tables.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS march_madness;

-- Games: 63 bracket slots, seeded from ESPN
CREATE TABLE IF NOT EXISTS march_madness.games (
  id              SERIAL PRIMARY KEY,
  pool_id         UUID REFERENCES public.pools(id) ON DELETE CASCADE,
  espn_id         TEXT,
  round           INTEGER NOT NULL,  -- 1=R64, 2=R32, 3=S16, 4=E8, 5=F4, 6=Championship
  slot            INTEGER NOT NULL,  -- 1–63
  home_team       TEXT,
  away_team       TEXT,
  home_seed       INTEGER,
  away_seed       INTEGER,
  winner          TEXT,
  home_score      INTEGER,
  away_score      INTEGER,
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'live', 'final')),
  win_prob_home   NUMERIC,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mm_games_pool ON march_madness.games (pool_id, round, slot);

-- Enable realtime on games
ALTER TABLE march_madness.games REPLICA IDENTITY FULL;

-- Brackets: one per pool_entry (supports multi-entry)
CREATE TABLE IF NOT EXISTS march_madness.brackets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id      UUID REFERENCES public.pools(id) ON DELETE CASCADE,
  entry_id     UUID REFERENCES public.pool_entries(id) ON DELETE CASCADE,
  -- legacy: user_id kept for backward compat with existing queries
  user_id      UUID REFERENCES public.profiles(id),
  picks        JSONB NOT NULL,   -- 63-element array of picked team names
  tiebreaker   INTEGER,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (pool_id, entry_id),
  UNIQUE (pool_id, user_id)      -- legacy constraint
);

CREATE INDEX IF NOT EXISTS idx_mm_brackets_pool ON march_madness.brackets (pool_id);

-- Simulation results: probability data from Monte Carlo engine
-- Still used by the Python API internally; summary goes to simulation_outputs
CREATE TABLE IF NOT EXISTS march_madness.sim_results (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id            UUID REFERENCES public.pools(id) ON DELETE CASCADE,
  player_probs       JSONB,
  prev_player_probs  JSONB,
  finish_probs       JSONB,
  prev_finish_probs  JSONB,
  leverage_games     JSONB,
  player_leverage    JSONB,
  best_paths         JSONB,
  narrative_day      TEXT,
  created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mm_sim_pool ON march_madness.sim_results (pool_id, created_at DESC);

-- Narrative infrastructure (preserved from existing migrations)
CREATE TABLE IF NOT EXISTS march_madness.narrative_storylines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id           UUID REFERENCES public.pools(id) ON DELETE CASCADE,
  storyline_type    TEXT NOT NULL,
  status            TEXT DEFAULT 'emerging'
    CHECK (status IN ('emerging','active','escalating','resolving','resolved')),
  players           TEXT[] DEFAULT '{}',
  teams             TEXT[] DEFAULT '{}',
  novelty_budget    INTEGER DEFAULT 3,
  escalation_count  INTEGER DEFAULT 0,
  metadata          JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mm_storylines_pool
  ON march_madness.narrative_storylines (pool_id, status);
CREATE INDEX IF NOT EXISTS idx_mm_storylines_players
  ON march_madness.narrative_storylines USING GIN (players);

-- Narrative config: admin controls per pool
CREATE TABLE IF NOT EXISTS march_madness.narrative_config (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id       UUID REFERENCES public.pools(id) ON DELETE CASCADE,
  config_type   TEXT NOT NULL,
  setting       TEXT,
  value         TEXT,
  instruction   TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Narrative log: structured event log
CREATE TABLE IF NOT EXISTS march_madness.narrative_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id    UUID REFERENCES public.pools(id) ON DELETE CASCADE,
  source     TEXT,   -- 'poller', 'simulate', 'manual'
  level      TEXT DEFAULT 'info' CHECK (level IN ('info','warn','error')),
  message    TEXT,
  metadata   JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mm_narrative_log_pool
  ON march_madness.narrative_log (pool_id, created_at DESC);

-- Poller heartbeat
CREATE TABLE IF NOT EXISTS march_madness.poller_heartbeat (
  id          INTEGER PRIMARY KEY DEFAULT 1,
  last_poll   TIMESTAMPTZ,
  status      TEXT,
  CHECK (id = 1)  -- single-row table
);
