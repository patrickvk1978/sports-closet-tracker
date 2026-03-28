-- Phase 6b: Allow site admins to update pools in addition to the pool commissioner
-- Run this in Supabase SQL Editor.

DROP POLICY IF EXISTS "pools_update" ON public.pools;

CREATE POLICY "pools_update" ON public.pools
  FOR UPDATE USING (
    auth.uid() = admin_id
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND is_admin = true
    )
  );
