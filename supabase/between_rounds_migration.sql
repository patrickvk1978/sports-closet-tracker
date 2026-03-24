-- Between-rounds countdown: admin sets the next round's tipoff time.
-- When next_tipoff is set and in the future, non-admin users see a
-- countdown + leaderboard instead of the full dashboard.
ALTER TABLE public.pools ADD COLUMN IF NOT EXISTS next_tipoff timestamptz DEFAULT NULL;
