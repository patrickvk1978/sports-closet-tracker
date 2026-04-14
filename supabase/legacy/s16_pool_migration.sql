-- S16 Mini-Pool Support: add start_round column to pools
-- Values: 'R64' (default, full tournament), 'S16', 'E8', etc.
ALTER TABLE public.pools ADD COLUMN IF NOT EXISTS start_round text NOT NULL DEFAULT 'R64';
