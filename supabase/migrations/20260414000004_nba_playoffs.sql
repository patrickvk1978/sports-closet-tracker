-- ============================================================
-- MIGRATION 004: NBA PLAYOFFS SCHEMA
-- ============================================================

CREATE SCHEMA IF NOT EXISTS nba_playoffs;

-- Matchups: series in the bracket
CREATE TABLE IF NOT EXISTS nba_playoffs.matchups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id    UUID REFERENCES public.pools(id) ON DELETE CASCADE,
  round      INTEGER NOT NULL,        -- 1=First Round, 2=Semis, 3=Conf Finals, 4=Finals
  conference TEXT,                    -- 'East', 'West', 'Finals'
  home_team  TEXT NOT NULL,
  away_team  TEXT NOT NULL,
  home_seed  INTEGER,
  away_seed  INTEGER,
  winner     TEXT,
  games_played INTEGER CHECK (games_played BETWEEN 4 AND 7),
  status     TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'final')),
  starts_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_nba_matchups_pool
  ON nba_playoffs.matchups (pool_id, round);

ALTER TABLE nba_playoffs.matchups REPLICA IDENTITY FULL;

-- User picks: predicted winner + series length per matchup
CREATE TABLE IF NOT EXISTS nba_playoffs.picks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id           UUID REFERENCES public.pools(id) ON DELETE CASCADE,
  entry_id          UUID REFERENCES public.pool_entries(id) ON DELETE CASCADE,
  user_id           UUID REFERENCES public.profiles(id),   -- legacy
  matchup_id        UUID REFERENCES nba_playoffs.matchups(id) ON DELETE CASCADE,
  predicted_winner  TEXT NOT NULL,
  predicted_games   INTEGER NOT NULL CHECK (predicted_games BETWEEN 4 AND 7),
  submitted_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (pool_id, entry_id, matchup_id),
  UNIQUE (pool_id, user_id, matchup_id)
);

CREATE INDEX IF NOT EXISTS idx_nba_picks_pool
  ON nba_playoffs.picks (pool_id, matchup_id);
