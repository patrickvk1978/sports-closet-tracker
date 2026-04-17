-- ============================================================
-- MIGRATION 007: NBA_PLAYOFFS.TEAM_VALUES
-- Persistent board assignment storage for nba-playoffs-v2.
-- Replaces the localStorage-only useTeamValueBoard.js pattern.
-- Shape: one row per (pool, user, team) with the assigned value slot.
-- ============================================================

CREATE TABLE IF NOT EXISTS nba_playoffs.team_values (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id         UUID NOT NULL REFERENCES public.pools(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id         TEXT NOT NULL,
  assigned_value  INTEGER NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pool_id, user_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_nba_team_values_pool
  ON nba_playoffs.team_values (pool_id, user_id);

ALTER TABLE nba_playoffs.team_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read team values in their pools"
  ON nba_playoffs.team_values FOR SELECT
  USING (public.is_pool_member(pool_id));

CREATE POLICY "Users submit own team values"
  ON nba_playoffs.team_values FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_pool_member(pool_id)
    AND public.pool_is_unlocked(pool_id)
  );

CREATE POLICY "Users update own team values"
  ON nba_playoffs.team_values FOR UPDATE
  USING (user_id = auth.uid() AND public.pool_is_unlocked(pool_id));

ALTER TABLE nba_playoffs.team_values REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE nba_playoffs.team_values;
