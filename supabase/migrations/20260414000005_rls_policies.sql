-- ============================================================
-- MIGRATION 005: ROW-LEVEL SECURITY POLICIES
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pools           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pool_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pool_entries    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.probability_inputs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulation_outputs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commentary_outputs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE march_madness.games         ENABLE ROW LEVEL SECURITY;
ALTER TABLE march_madness.brackets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE march_madness.sim_results   ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft.boards                ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft.actual_picks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE nba_playoffs.matchups       ENABLE ROW LEVEL SECURITY;
ALTER TABLE nba_playoffs.picks          ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------
-- HELPER: reusable membership check
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_pool_member(p_pool_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pool_members
    WHERE pool_id = p_pool_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.pool_is_unlocked(p_pool_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT NOT is_locked FROM public.pools WHERE id = p_pool_id;
$$;

-- -------------------------------------------------------
-- PROFILES
-- -------------------------------------------------------
CREATE POLICY "Users read own profile"
  ON public.profiles FOR SELECT USING (id = auth.uid());

CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE USING (id = auth.uid());

-- -------------------------------------------------------
-- POOLS
-- -------------------------------------------------------
CREATE POLICY "Members read their pools"
  ON public.pools FOR SELECT
  USING (public.is_pool_member(id));

CREATE POLICY "Authenticated users create pools"
  ON public.pools FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Pool admins update their pools"
  ON public.pools FOR UPDATE
  USING (created_by = auth.uid() OR admin_id = auth.uid());

-- -------------------------------------------------------
-- POOL MEMBERS
-- -------------------------------------------------------
CREATE POLICY "Members see members in their pools"
  ON public.pool_members FOR SELECT
  USING (public.is_pool_member(pool_id));

CREATE POLICY "Authenticated users join pools"
  ON public.pool_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- -------------------------------------------------------
-- POOL ENTRIES
-- -------------------------------------------------------
CREATE POLICY "Members see entries in their pools"
  ON public.pool_entries FOR SELECT
  USING (public.is_pool_member(pool_id));

CREATE POLICY "Users create own entries in unlocked pools"
  ON public.pool_entries FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_pool_member(pool_id)
    AND public.pool_is_unlocked(pool_id)
    AND (
      SELECT COUNT(*) FROM public.pool_entries e
      WHERE e.pool_id = pool_entries.pool_id AND e.user_id = auth.uid()
    ) < COALESCE(
      (SELECT (settings->>'max_entries_per_user')::int FROM public.pools WHERE id = pool_entries.pool_id),
      1
    )
  );

-- -------------------------------------------------------
-- OUTPUT LAYERS (read-only for users — written by service_role)
-- -------------------------------------------------------
CREATE POLICY "Members read probability inputs for their pools"
  ON public.probability_inputs FOR SELECT
  USING (TRUE);  -- probabilities are not sensitive; public within the app

CREATE POLICY "Members read sim outputs for their pools"
  ON public.simulation_outputs FOR SELECT
  USING (public.is_pool_member(pool_id));

CREATE POLICY "Members read commentary for their pools"
  ON public.commentary_outputs FOR SELECT
  USING (public.is_pool_member(pool_id));

-- -------------------------------------------------------
-- MARCH MADNESS
-- -------------------------------------------------------
CREATE POLICY "Members read games in their pools"
  ON march_madness.games FOR SELECT
  USING (public.is_pool_member(pool_id));

CREATE POLICY "Members read brackets in their pools"
  ON march_madness.brackets FOR SELECT
  USING (public.is_pool_member(pool_id));

CREATE POLICY "Users submit own bracket in unlocked pools"
  ON march_madness.brackets FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_pool_member(pool_id)
    AND public.pool_is_unlocked(pool_id)
  );

CREATE POLICY "Users update own bracket in unlocked pools"
  ON march_madness.brackets FOR UPDATE
  USING (user_id = auth.uid() AND public.pool_is_unlocked(pool_id));

CREATE POLICY "Members read sim results in their pools"
  ON march_madness.sim_results FOR SELECT
  USING (public.is_pool_member(pool_id));

-- -------------------------------------------------------
-- DRAFT
-- -------------------------------------------------------
CREATE POLICY "Members read boards in their pools"
  ON draft.boards FOR SELECT
  USING (public.is_pool_member(pool_id));

CREATE POLICY "Users submit own board in unlocked pools"
  ON draft.boards FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_pool_member(pool_id)
    AND public.pool_is_unlocked(pool_id)
  );

CREATE POLICY "Users update own board in unlocked pools"
  ON draft.boards FOR UPDATE
  USING (user_id = auth.uid() AND public.pool_is_unlocked(pool_id));

CREATE POLICY "Members read actual picks in their pools"
  ON draft.actual_picks FOR SELECT
  USING (public.is_pool_member(pool_id));

-- -------------------------------------------------------
-- NBA PLAYOFFS
-- -------------------------------------------------------
CREATE POLICY "Members read matchups in their pools"
  ON nba_playoffs.matchups FOR SELECT
  USING (public.is_pool_member(pool_id));

CREATE POLICY "Members read picks in their pools"
  ON nba_playoffs.picks FOR SELECT
  USING (public.is_pool_member(pool_id));

CREATE POLICY "Users submit own picks in unlocked pools"
  ON nba_playoffs.picks FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_pool_member(pool_id)
    AND public.pool_is_unlocked(pool_id)
  );

CREATE POLICY "Users update own picks in unlocked pools"
  ON nba_playoffs.picks FOR UPDATE
  USING (user_id = auth.uid() AND public.pool_is_unlocked(pool_id));
