-- ─── Narrative Feed Table ─────────────────────────────────────────────────────
-- Append-only feed of AI-generated commentary entries per pool + player.
-- Replaces the single-slot "narratives" jsonb on sim_results.

CREATE TABLE IF NOT EXISTS public.narrative_feed (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pool_id     uuid NOT NULL REFERENCES public.pools(id) ON DELETE CASCADE,
  player_name text NOT NULL,                     -- player username, or '_pool' for pool-wide entries
  entry_type  text NOT NULL DEFAULT 'game_end',  -- alert | game_end | deep_dive | overnight
  persona     text NOT NULL DEFAULT 'stat_nerd', -- stat_nerd | color_commentator | barkley
  content     text NOT NULL,
  leverage_pct numeric(5,1),                     -- nullable; for alerts, the leverage % that triggered it
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for efficient per-pool feed queries (newest first)
CREATE INDEX IF NOT EXISTS idx_narrative_feed_pool_created
  ON public.narrative_feed (pool_id, created_at DESC);

-- Index for per-player feed filtering
CREATE INDEX IF NOT EXISTS idx_narrative_feed_pool_player
  ON public.narrative_feed (pool_id, player_name, created_at DESC);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.narrative_feed ENABLE ROW LEVEL SECURITY;

-- Members can read their pool's feed
CREATE POLICY narrative_feed_select ON public.narrative_feed
  FOR SELECT USING (
    pool_id IN (SELECT pool_id FROM public.pool_members WHERE user_id = auth.uid())
  );

-- Service role inserts (no user inserts needed)
-- The Python simulate.py uses service_role_key which bypasses RLS.

-- ─── Realtime ────────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.narrative_feed;

-- ─── Cleanup: prune entries older than 7 days (run periodically or via cron) ─
-- Optional: CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule('prune-narrative-feed', '0 5 * * *',
--   $$DELETE FROM public.narrative_feed WHERE created_at < now() - interval '7 days'$$);
