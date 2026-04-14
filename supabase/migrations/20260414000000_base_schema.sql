-- ============================================================
-- MIGRATION 000: BASE SCHEMA
-- Shared tables used by all game types.
-- ============================================================

-- Profiles: extends Supabase auth.users
CREATE TABLE IF NOT EXISTS public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username     TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url   TEXT,
  is_admin     BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Trigger: auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Game types
CREATE TYPE public.game_type AS ENUM (
  'march_madness',
  'nfl_draft',
  'wnba_draft',
  'nba_playoffs'
);

-- Pools: one per game instance (tournament, draft, etc.)
CREATE TABLE IF NOT EXISTS public.pools (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_type      public.game_type NOT NULL,
  season         INTEGER NOT NULL DEFAULT date_part('year', now()),
  name           TEXT NOT NULL,
  invite_code    TEXT UNIQUE NOT NULL,
  created_by     UUID REFERENCES public.profiles(id),
  -- legacy column kept for backward compat with existing tournament-tracker queries
  admin_id       UUID REFERENCES public.profiles(id),
  is_locked      BOOLEAN DEFAULT FALSE,
  -- legacy column name kept for existing app queries
  locked         BOOLEAN GENERATED ALWAYS AS (is_locked) STORED,
  start_round    TEXT,
  scoring_config JSONB DEFAULT '{}',
  settings       JSONB DEFAULT '{}',
  next_event_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Pool membership
CREATE TABLE IF NOT EXISTS public.pool_members (
  pool_id   UUID REFERENCES public.pools(id) ON DELETE CASCADE,
  user_id   UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  role      TEXT DEFAULT 'member' CHECK (role IN ('member', 'admin', 'owner')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (pool_id, user_id)
);

-- Pool entries: supports multi-entry per user per pool
CREATE TABLE IF NOT EXISTS public.pool_entries (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id    UUID REFERENCES public.pools(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  entry_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pool_entries_pool ON public.pool_entries (pool_id, user_id);

-- RPC: get pool members with profile info (security definer bypasses RLS for the join)
CREATE OR REPLACE FUNCTION public.get_pool_members(p_pool_id UUID)
RETURNS TABLE (user_id UUID, joined_at TIMESTAMPTZ, username TEXT, is_admin BOOLEAN)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    pm.user_id,
    pm.joined_at,
    p.username,
    p.is_admin
  FROM public.pool_members pm
  JOIN public.profiles p ON p.id = pm.user_id
  WHERE pm.pool_id = p_pool_id;
$$;

-- RPC: get pool by invite code
CREATE OR REPLACE FUNCTION public.get_pool_by_invite_code(code TEXT)
RETURNS SETOF public.pools LANGUAGE sql SECURITY DEFINER AS $$
  SELECT * FROM public.pools WHERE invite_code = upper(trim(code));
$$;
