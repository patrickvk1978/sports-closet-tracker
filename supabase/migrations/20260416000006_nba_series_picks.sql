-- ============================================================
-- MIGRATION 006: PUBLIC.NBA_SERIES_PICKS
-- Persistent series pick storage for nba-playoffs-v1.
-- Shape matches useSeriesPickem.js exactly.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.nba_series_picks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id         UUID NOT NULL REFERENCES public.pools(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  series_id       TEXT NOT NULL,
  round_key       TEXT NOT NULL,
  winner_team_id  TEXT NOT NULL,
  predicted_games INTEGER NOT NULL CHECK (predicted_games BETWEEN 4 AND 7),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pool_id, user_id, series_id)
);

CREATE INDEX IF NOT EXISTS idx_nba_series_picks_pool
  ON public.nba_series_picks (pool_id, user_id);

ALTER TABLE public.nba_series_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read series picks in their pools"
  ON public.nba_series_picks FOR SELECT
  USING (public.is_pool_member(pool_id));

CREATE POLICY "Users submit own series picks"
  ON public.nba_series_picks FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_pool_member(pool_id)
    AND public.pool_is_unlocked(pool_id)
  );

CREATE POLICY "Users update own series picks"
  ON public.nba_series_picks FOR UPDATE
  USING (user_id = auth.uid() AND public.pool_is_unlocked(pool_id));

CREATE POLICY "Users delete own series picks"
  ON public.nba_series_picks FOR DELETE
  USING (user_id = auth.uid());

ALTER TABLE public.nba_series_picks REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.nba_series_picks;
