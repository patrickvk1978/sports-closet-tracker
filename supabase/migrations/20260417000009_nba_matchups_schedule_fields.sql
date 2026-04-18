ALTER TABLE nba_playoffs.matchups
  ADD COLUMN IF NOT EXISTS lock_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_game_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_game_number  INTEGER,
  ADD COLUMN IF NOT EXISTS next_home_team_id TEXT,
  ADD COLUMN IF NOT EXISTS next_away_team_id TEXT;
