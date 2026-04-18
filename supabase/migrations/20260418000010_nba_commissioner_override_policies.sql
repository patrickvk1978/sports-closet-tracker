CREATE OR REPLACE FUNCTION public.is_site_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND is_admin = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_pool(p_pool_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pools
    WHERE id = p_pool_id
      AND (admin_id = auth.uid() OR public.is_site_admin())
  );
$$;

CREATE POLICY "Pool admins manage series picks"
  ON public.nba_series_picks FOR INSERT
  WITH CHECK (public.can_manage_pool(pool_id));

CREATE POLICY "Pool admins update series picks"
  ON public.nba_series_picks FOR UPDATE
  USING (public.can_manage_pool(pool_id))
  WITH CHECK (public.can_manage_pool(pool_id));

CREATE POLICY "Pool admins delete series picks"
  ON public.nba_series_picks FOR DELETE
  USING (public.can_manage_pool(pool_id));

CREATE POLICY "Pool admins manage team values"
  ON nba_playoffs.team_values FOR INSERT
  WITH CHECK (public.can_manage_pool(pool_id));

CREATE POLICY "Pool admins update team values"
  ON nba_playoffs.team_values FOR UPDATE
  USING (public.can_manage_pool(pool_id))
  WITH CHECK (public.can_manage_pool(pool_id));
