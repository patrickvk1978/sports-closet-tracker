-- ─── Narrative V2 Migration ───────────────────────────────────────────────────
-- Adds storyline store and audience cluster tables for the v2 narrative pipeline.
-- Run in Supabase dashboard SQL editor.
--
-- Two new tables:
--   narrative_storylines — tracks active narrative arcs per pool (persistence across cycles)
--   audience_clusters    — groups players with identical/near-identical pool situations
--
-- These support the v2 pipeline:
--   state+delta → storyline store → prep → Opus planner → Sonnet writer → validator

-- ─── narrative_storylines ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.narrative_storylines (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pool_id             uuid NOT NULL REFERENCES public.pools(id) ON DELETE CASCADE,
  storyline_id        text NOT NULL,              -- e.g. 'boblu_arizona_primary_ucd_secondary'
  affected_players    text[] NOT NULL DEFAULT '{}', -- player usernames involved
  teams_involved      text[] NOT NULL DEFAULT '{}', -- team names relevant to this storyline
  angle_type          text NOT NULL,              -- rooting, leverage, prize_race, elimination, etc.
  status              text NOT NULL DEFAULT 'emerging'
                        CHECK (status IN ('emerging', 'active', 'escalating', 'stale', 'resolving', 'resolved')),
  intensity           text NOT NULL DEFAULT 'medium'
                        CHECK (intensity IN ('low', 'medium', 'high', 'critical')),
  established_frame   text,                       -- the narrative position taken, e.g. 'Sunday is the main event'
  last_fact_used      text,                       -- headline fact from most recent mention
  mention_count       int NOT NULL DEFAULT 0,
  novelty_budget      int NOT NULL DEFAULT 3,     -- decrements per mention; at 0 planner must escalate or suppress
  escalation_threshold text,                      -- condition to escalate, e.g. 'Arizona eliminated OR UConn-Duke tips'
  suppression_note    text,                       -- e.g. 'do not restate unless escalation_threshold met'
  cluster_id          text,                       -- links to audience_clusters.cluster_id if shared
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  resolved_at         timestamptz                 -- set when status → resolved
);

-- Fast lookups: active storylines for a pool
CREATE INDEX IF NOT EXISTS idx_storylines_pool_active
  ON public.narrative_storylines (pool_id, status)
  WHERE status NOT IN ('resolved');

-- Find storylines by player
CREATE INDEX IF NOT EXISTS idx_storylines_players
  ON public.narrative_storylines USING gin (affected_players);

-- Find storylines by team (for auto-resolution when games end)
CREATE INDEX IF NOT EXISTS idx_storylines_teams
  ON public.narrative_storylines USING gin (teams_involved);

-- Uniqueness: one active storyline per pool per storyline_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_storylines_unique_active
  ON public.narrative_storylines (pool_id, storyline_id)
  WHERE status NOT IN ('resolved');


-- ─── audience_clusters ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.audience_clusters (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pool_id             uuid NOT NULL REFERENCES public.pools(id) ON DELETE CASCADE,
  cluster_id          text NOT NULL,              -- e.g. 'boblu_tcasey_twins'
  players             text[] NOT NULL DEFAULT '{}', -- member player usernames
  reason              text NOT NULL,              -- e.g. 'identical_champ_and_f4', 'similar_win_prob_trajectory'
  shared_storylines   text[] NOT NULL DEFAULT '{}', -- storyline_ids this cluster shares
  last_individual_post timestamptz,               -- last time a member got a separate (non-cluster) entry
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Fast lookups: clusters for a pool
CREATE INDEX IF NOT EXISTS idx_clusters_pool
  ON public.audience_clusters (pool_id);

-- Find clusters by member player
CREATE INDEX IF NOT EXISTS idx_clusters_players
  ON public.audience_clusters USING gin (players);

-- Uniqueness: one active cluster per pool per cluster_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_clusters_unique
  ON public.audience_clusters (pool_id, cluster_id);


-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.narrative_storylines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audience_clusters ENABLE ROW LEVEL SECURITY;

-- Open SELECT for admin page and narrative pipeline queries
CREATE POLICY storylines_select ON public.narrative_storylines
  FOR SELECT USING (true);

CREATE POLICY clusters_select ON public.audience_clusters
  FOR SELECT USING (true);

-- Service role handles all writes (Python simulate.py uses service_role_key which bypasses RLS)


-- ─── Realtime (optional — mainly for admin dashboard monitoring) ─────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.narrative_storylines;
ALTER PUBLICATION supabase_realtime ADD TABLE public.audience_clusters;


-- ─── Helper: auto-update updated_at on row changes ──────────────────────────

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER storylines_updated_at
  BEFORE UPDATE ON public.narrative_storylines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER clusters_updated_at
  BEFORE UPDATE ON public.audience_clusters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
