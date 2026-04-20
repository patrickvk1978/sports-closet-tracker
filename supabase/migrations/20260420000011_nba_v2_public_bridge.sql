-- Public RPC bridge for v2 so the browser client can read/write NBA team value
-- data without requiring the nba_playoffs schema to be exposed over PostgREST.

CREATE OR REPLACE FUNCTION public.get_nba_matchups(p_pool_id UUID)
RETURNS TABLE (
  series_key TEXT,
  status TEXT,
  home_team_id TEXT,
  away_team_id TEXT,
  winner_team_id TEXT,
  home_wins INTEGER,
  away_wins INTEGER,
  lock_at TIMESTAMPTZ,
  next_game_at TIMESTAMPTZ,
  next_game_number INTEGER,
  next_home_team_id TEXT,
  next_away_team_id TEXT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    m.series_key,
    m.status,
    m.home_team_id,
    m.away_team_id,
    m.winner_team_id,
    m.home_wins,
    m.away_wins,
    m.lock_at,
    m.next_game_at,
    m.next_game_number,
    m.next_home_team_id,
    m.next_away_team_id
  FROM nba_playoffs.matchups m
  WHERE m.pool_id = p_pool_id
    AND (public.is_pool_member(p_pool_id) OR public.can_manage_pool(p_pool_id));
$$;

CREATE OR REPLACE FUNCTION public.get_nba_team_values(p_pool_id UUID)
RETURNS TABLE (
  user_id UUID,
  team_id TEXT,
  assigned_value INTEGER,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    tv.user_id,
    tv.team_id,
    tv.assigned_value,
    tv.updated_at
  FROM nba_playoffs.team_values tv
  WHERE tv.pool_id = p_pool_id
    AND (public.is_pool_member(p_pool_id) OR public.can_manage_pool(p_pool_id));
$$;

CREATE OR REPLACE FUNCTION public.upsert_nba_team_values(
  p_pool_id UUID,
  p_user_id UUID,
  p_rows JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT (
    (auth.uid() = p_user_id AND public.is_pool_member(p_pool_id))
    OR public.can_manage_pool(p_pool_id)
  ) THEN
    RAISE EXCEPTION 'Not allowed to update team values for this pool/user';
  END IF;

  DELETE FROM nba_playoffs.team_values
  WHERE pool_id = p_pool_id
    AND user_id = p_user_id;

  INSERT INTO nba_playoffs.team_values (pool_id, user_id, team_id, assigned_value, updated_at)
  SELECT
    p_pool_id,
    p_user_id,
    row_value->>'team_id',
    (row_value->>'assigned_value')::INTEGER,
    COALESCE((row_value->>'updated_at')::TIMESTAMPTZ, now())
  FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) AS row_value;
END;
$$;
