# On the Clock

`On the Clock` is a Round 1 NFL Draft prediction game built on the same core stack as Tournament Tracker:

- Vercel frontend
- Supabase auth and database
- Shared live sports data ingestion
- Pool-based scoring and standings

## Why this name works

`On the Clock` is strong.

- It is native to the NFL Draft experience.
- It immediately signals urgency and live participation.
- It works well as both a product name and a UI motif.
- It is broad enough to support future draft-related modes.

## V1 product summary

V1 is a Round 1-only game where users:

- join a pool
- create slot-by-slot predictions for Picks `1-32`
- maintain a personal big board
- follow the live draft in a shared `Draft` workspace
- score points for exact player hits and position hits

The app uses one shared live draft state for all pools. Pool-specific data is limited to:

- scoring settings
- user predictions
- user big boards
- standings

## Core model

Each user has two different but connected artifacts:

1. `Draft predictions`
   Predictions for Picks `1-32`.
2. `Big board`
   A ranked list of prospects, pre-populated from a global board and editable by the user.

During the draft, the app resolves a user's effective pick for each slot using this order:

1. manual live override for that slot
2. otherwise the slot prediction, if the predicted player is still available
3. otherwise fallback from the user's big board

Fallback from the big board is pool-configurable:

- `queue_only`
- `queue_plus_team_need`

`queue_only`:
- Use the highest remaining player on the user's big board.

`queue_plus_team_need`:
- Use the highest remaining player on the user's big board whose position matches any defined need for the team currently on the clock.
- If none match a defined need, use the highest remaining player overall.

## Product shape

The app should feel like a single workspace with two internal tabs:

### `Draft`

The live command center.

Contains:

- current pick and team on the clock
- live draft board for Picks `1-32`
- user's prediction and effective pick per slot
- trade indicator
- official selection once declared
- revealed pool picks once the pick is official
- scoreboard

### `Board`

The research and ranking workspace.

Contains:

- sortable and filterable player research table
- light player metadata
- rankings from multiple public boards
- reorderable personal big board
- `Assign to Pick` actions that tag a player into the draft prediction list

The `Board` tab updates the fallback engine used in `Draft` immediately.

## Scoring

Scoring should be adjustable by pool.

Recommended default V1 settings:

- exact player points: `5`
- correct position points: `2`
- lock rule: `declared`
- fallback mode: `queue_plus_team_need`
- hide other picks until declared: `true`
- allow live edits for future picks: `true`

## Trades

Trades do not renumber picks.

`Pick 12` is always `Pick 12`.

Trades only change:

- the `current_team_id` for that pick
- the trade history display
- fallback suggestions for users whose prediction no longer cleanly fits the new team context

## Live data strategy

The app should be built around one shared canonical draft state for all pools.

### Primary plan

Use ESPN draft data as the primary provider if the unofficial endpoints hold up during testing.

Potential draft endpoint family discussed in planning:

- `.../seasons/{year}/draft`
- `.../seasons/{year}/draft/rounds`
- `.../seasons/{year}/draft/athletes`
- `.../seasons/{year}/draft/status`

### Important constraint

Even if ESPN provides reliable live picks, trades may not be surfaced cleanly enough for us to trust them without testing.

So the system should support:

- provider-driven live pick ingestion
- manual admin override for any live draft field

### Shared live state

All pools should read from the same live draft tables:

- current draft status
- pick-by-pick live state
- official selections
- trade history

Pool-specific tables should never duplicate the live draft source of truth.

## Admin fallback

Admin fallback should be first-class, not a patch.

Commissioner/admin should be able to set or override:

- team on the clock
- current pick status
- official selection
- declared/revealed state
- trade for a future pick
- rollback/correction for a mistaken pick

Recommended draft state mode for V1:

- `provider_with_admin_override`

## Suggested Supabase tables

Shared/global tables:

- `prospects`
- `prospect_rankings`
- `nfl_teams`
- `team_needs`
- `draft_round_picks`
- `draft_pick_trades`
- `draft_provider_events`
- `draft_admin_overrides`

Pool/user tables:

- `pools`
- `pool_members`
- `user_big_board_items`
- `user_pick_predictions`
- `pick_scores`

## Implementation phases

### Phase 1

Foundation

- create the new app scaffold
- add draft-specific schema
- extend pools with draft settings
- seed teams, prospects, rankings, and team needs

### Phase 2

Board experience

- research table
- filters
- multi-board rankings
- personal big board
- assign-to-pick interactions

### Phase 3

Draft experience

- Round 1 board
- prediction rows
- effective pick resolver
- scoreboard
- revealed pool picks

### Phase 4

Live operations

- ESPN provider adapter
- canonical draft state updater
- manual admin override tools
- realtime subscriptions
- scoring on declaration

### Phase 5

Polish

- mobile ergonomics
- clearer trade messaging
- projection badges and explanations
- commissioner controls

## Immediate next steps

1. Create the initial app scaffold in this folder.
2. Write the first Supabase migration for draft tables.
3. Implement the shared domain model and resolver logic before building UI polish.
