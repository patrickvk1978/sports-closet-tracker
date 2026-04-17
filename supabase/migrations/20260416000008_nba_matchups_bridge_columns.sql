-- ============================================================
-- MIGRATION 008: NBA_PLAYOFFS.MATCHUPS — BRIDGE COLUMNS
-- Adds series_key (matches playoffData.js string IDs),
-- short team IDs, winner_team_id, and per-team win counters.
-- Required for the Python adapter to join picks → results.
-- ============================================================

ALTER TABLE nba_playoffs.matchups
  ADD COLUMN IF NOT EXISTS series_key     TEXT,
  ADD COLUMN IF NOT EXISTS home_team_id   TEXT,
  ADD COLUMN IF NOT EXISTS away_team_id   TEXT,
  ADD COLUMN IF NOT EXISTS winner_team_id TEXT,
  ADD COLUMN IF NOT EXISTS home_wins      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS away_wins      INTEGER NOT NULL DEFAULT 0;
