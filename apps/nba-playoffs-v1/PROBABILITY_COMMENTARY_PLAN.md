# NBA Probability + Commentary Plan

## Goal

Move `nba-playoffs` from local placeholder probability values to a shared Sports Closet data contract that can support:

- market probabilities
- model probabilities
- current-round win odds
- user-specific commentary

This plan is intentionally product-first and backend-aware. It is designed so the NBA app can keep moving before the fully shared backend is attached.

## Current State

Today, the NBA app has:

- local/sample `market` and `model` values in [`src/data/playoffData.js`](./src/data/playoffData.js)
- local current-round simulation in [`src/lib/standings.js`](./src/lib/standings.js)
- local commentary logic in [`src/lib/insights.js`](./src/lib/insights.js)

That means the app already has the right *surfaces*, but not yet the real shared data flow.

## Recommendation

Treat the shared backend as three layers:

1. `probability inputs`
2. `simulation outputs`
3. `commentary outputs`

The NBA app should read these layers, not re-invent them page by page.

## Layer 1: Probability Inputs

This is the near-term replacement for hard-coded `market` and `model` values.

### Shared concept

One row per contest or series, per source.

### Suggested shape

```json
{
  "product_key": "nba_playoffs",
  "entity_type": "series",
  "entity_id": "east-r1-3",
  "source_type": "market",
  "source_name": "consensus_market",
  "home_win_pct": 61,
  "away_win_pct": 39,
  "captured_at": "2026-04-12T14:10:00Z"
}
```

### For NBA V1

Recommended minimum:

- `market`
  - manual or scripted import from a trusted sportsbook consensus / public market source
- `model`
  - manual or scripted import from one chosen external model

The app does not need many sources yet. It just needs one clear market source and one clear model source.

## Layer 2: Simulation Outputs

This is the shared equivalent of the current local `current-round win odds` logic.

### Shared concept

For a given pool and user, store probabilities derived from current picks + remaining probabilities.

### Suggested shape

```json
{
  "product_key": "nba_playoffs",
  "pool_id": "uuid",
  "user_id": "uuid",
  "window_key": "round_1",
  "win_odds": 18.4,
  "points_back": 4,
  "exact_calls": 2,
  "updated_at": "2026-04-12T14:12:00Z"
}
```

### Optional later

- finish-place probabilities
- top-2 / cash odds
- odds delta since prior run

## Layer 3: Commentary Outputs

This is the shared equivalent of the local Dashboard hero logic.

### Shared concept

The backend returns a small, structured interpretation object for a user and context.

### Suggested response shape

```json
{
  "headline": "Boston is your clearest swing right now.",
  "body": "Only 28% of the room is with you here, so a Boston win would move your current-round outlook more than a consensus result.",
  "action_label": "Open reports",
  "action_target": "/reports",
  "priority": "high",
  "tags": ["leverage", "against_consensus", "round_1"],
  "updated_at": "2026-04-12T14:15:00Z"
}
```

### Why structured output matters

The frontend can render this consistently on:

- Dashboard hero
- Reports
- eventually series-level and opponent-level views

This also makes it easier to adapt the same contract for NCAA, NFL pick'em, survivor, and later products.

## How This Maps to Existing Tourney Work

The repo already has tournament-side backend pieces:

- simulation engine: [`api/simulate.py`](../api/simulate.py)
- live poller: [`api/poller.py`](../api/poller.py)
- narrative pipeline: [`api/narrative_v3`](../api/narrative_v3)
- feed table: [`supabase/narrative_feed_migration.sql`](../supabase/narrative_feed_migration.sql)

That means the missing piece is not “start from nothing.”

The missing piece is:

- extract a shared contract
- adapt the tourney-oriented pipeline to NBA inputs
- expose outputs in a reusable way

## What Can Be Real Soon

Without waiting for the full shared commentary engine, the near-term plan could be:

1. Replace local `market` values with imported/stored NBA probabilities.
2. Replace local `model` values with imported/stored NBA model probabilities.
3. Keep local win-odds simulation temporarily, but read real input probabilities.
4. Keep local commentary heuristics temporarily, but shape them around the same contract.

That would make the app feel much more real even before Patrick exposes the full shared backend.

## What Still Needs Patrick / Shared Backend Work

- live ingestion / scheduled updates
- service-role writes
- shared simulation job for NBA pools
- real commentary generation service or feed
- deployment / VPS / cron / edge-function decisions

## Practical Frontend Contract

If we want the frontend to be ready now, the NBA app should eventually consume:

### A probability read hook

```ts
useProbabilityInputs(productKey, entityIds)
```

Returns:

- `market`
- `model`
- `updated_at`

### A simulation read hook

```ts
usePoolOdds(productKey, poolId, userId, windowKey)
```

Returns:

- `win_odds`
- `points_back`
- `exact_calls`
- `updated_at`

### A commentary read hook

```ts
useCommentary(productKey, poolId, userId, contextKey)
```

Returns:

- `headline`
- `body`
- `action_label`
- `action_target`
- `priority`
- `tags`
- `updated_at`

## Recommendation for Next Backend Conversation

The best next discussion with Patrick is not:

- “Can we plug into the API?”

It is:

- “Can we expose the tourney backend as these three reusable layers?”

Specifically:

1. `probability inputs`
2. `pool odds outputs`
3. `commentary outputs`

That makes the architecture easier to share across Sports Closet products.
