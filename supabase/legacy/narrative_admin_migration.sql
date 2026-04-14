-- ─── Narrative Admin Migration ───────────────────────────────────────────────
-- Adds two tables:
--   narrative_log    — structured event log (replaces print statements)
--   narrative_config — admin controls (persona overrides, instructions, triggers)
--
-- Run in Supabase dashboard SQL editor.

-- ─── narrative_log ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.narrative_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pool_id     uuid REFERENCES public.pools(id) ON DELETE CASCADE,  -- nullable for global events
  source      text NOT NULL CHECK (source IN ('poller', 'simulate')),
  level       text NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warn', 'error')),
  event_type  text NOT NULL,
  message     text NOT NULL,
  metadata    jsonb DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- event_type values:
--   poll_cycle, narrative_call, narrative_insert, alert_fired, champ_danger,
--   champ_eliminated, game_end_trigger, deep_dive_trigger, overnight_trigger,
--   sim_run, trigger_manual, config_change

CREATE INDEX IF NOT EXISTS idx_narrative_log_created
  ON public.narrative_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_narrative_log_pool
  ON public.narrative_log (pool_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_narrative_log_level
  ON public.narrative_log (level, created_at DESC);

ALTER TABLE public.narrative_log ENABLE ROW LEVEL SECURITY;

-- Open SELECT for admin page (page itself is gated behind is_admin check in React)
CREATE POLICY narrative_log_select ON public.narrative_log
  FOR SELECT USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.narrative_log;

-- Pruning: delete rows older than 7 days
-- Run manually or via pg_cron:
--   SELECT cron.schedule('prune-narrative-log', '0 4 * * *',
--     $$DELETE FROM public.narrative_log WHERE created_at < now() - interval '7 days'$$);


-- ─── narrative_config ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.narrative_config (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pool_id       uuid REFERENCES public.pools(id) ON DELETE CASCADE,  -- nullable = global/all pools
  config_type   text NOT NULL CHECK (config_type IN ('persona_override', 'instruction', 'setting', 'trigger')),
  config_key    text NOT NULL,
  config_value  jsonb NOT NULL DEFAULT '{}',
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- config_type / config_key combinations:
--   persona_override / persona_davin|persona_mo|persona_zelda
--     config_value: {"content": "markdown text..."}
--   instruction / next_instruction
--     config_value: {"text": "roast danhudder", "one_shot": true}
--   setting / feed_enabled
--     config_value: true | false
--   trigger / manual_trigger
--     config_value: {"narrative_type": "deep_dive"}

CREATE INDEX IF NOT EXISTS idx_narrative_config_lookup
  ON public.narrative_config (pool_id, config_type, active);

CREATE UNIQUE INDEX IF NOT EXISTS idx_narrative_config_unique_active
  ON public.narrative_config (COALESCE(pool_id, '00000000-0000-0000-0000-000000000000'::uuid), config_type, config_key)
  WHERE active = true;

ALTER TABLE public.narrative_config ENABLE ROW LEVEL SECURITY;

-- Open read/write for authenticated users (admin page gated in React)
CREATE POLICY narrative_config_select ON public.narrative_config
  FOR SELECT USING (true);

CREATE POLICY narrative_config_insert ON public.narrative_config
  FOR INSERT WITH CHECK (true);

CREATE POLICY narrative_config_update ON public.narrative_config
  FOR UPDATE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.narrative_config;
