# NBA Probability Bridge

Current status as of April 15, 2026:

- The shared `public.probability_inputs` table is now populated for `product_key = nba_playoffs`.
- Both NBA apps (`v1` and `v2`) read those shared rows first and safely fall back to their local static probability snapshots when needed.
- The current backend writer is still a curated series snapshot, not a live market/model feed yet.

## Refresh the NBA probability layer

From the monorepo root:

```bash
npm run seed:nba:probabilities
```

Or directly:

```bash
python3 services/api/seed_nba_probabilities.py
```

## What this writes

- `entity_type = series`
- `product_key = nba_playoffs`
- both `market` and `model` rows
- stable IDs that match the frontend series IDs like:
  - `east-r1-1`
  - `west-r1-2`
  - `west-playin-2`
  - `nba-finals`

## Current limitation

The live Supabase project does not yet appear to expose the newer `nba_playoffs.*`
schema over the REST path used by the frontend checks in this repo. Because of
that, the first backend bridge targets `public.probability_inputs` directly and
does not yet rely on `nba_playoffs.matchups` / `nba_playoffs.picks`.

## Next recommended step

Replace the curated snapshot in `services/api/adapters/nba_playoffs_snapshot.py`
with a true live market/model source, while keeping the same shared
`probability_inputs` contract.

