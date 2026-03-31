# On the Clock V1 Product Spec

## Scope

`On the Clock` V1 is a Round 1 NFL Draft pool game.

It is intentionally constrained to Picks `1-32`.

The goals of V1:

- make pre-draft prep meaningful
- make live draft-night participation fun
- recover intelligently from chaos caused by surprises and trades
- allow absent users to remain competitive through their prep

## Primary entities

### User-level entities

- `big_board`
- `draft_predictions`
- `live_manual_overrides`

### Shared entities

- `prospects`
- `teams`
- `team_needs`
- `round_1_picks`
- `live_draft_status`
- `trade_events`

### Pool-level entities

- `scoring_settings`
- `standings`
- `membership`

## Game loop

### Before draft night

Users:

- join a pool
- review player research
- reorder their personal big board
- assign players to specific pick slots

The big board is pre-populated from a global ranking list so every user starts with a usable queue.

### During draft night

Users primarily interact with the `Draft` tab.

For each pick:

- the app shows their current prediction
- the app computes their effective pick
- the app updates when a player is taken or a trade changes the team on the clock
- the app locks the resolved pick when the pick is declared
- the app scores the pick after the official selection is known

### After a pick is official

The app:

- reveals other users' picks for that slot if the pool allows reveal-on-declare
- awards scoring
- updates standings

## Effective pick resolution

Inputs:

- pool settings
- current official pick number
- current team on the clock
- user manual pick for slot, if present
- user slot prediction for slot
- user big board
- already selected prospects
- team needs for the current team

Resolution order:

1. use manual live override if present
2. else use the user's slot prediction if the prospect is still available
3. else use fallback from the user's big board

Fallback modes:

### `queue_only`

- choose the highest-ranked remaining prospect on the user's big board

### `queue_plus_team_need`

- filter the user's remaining big board to prospects whose position matches any defined need for the current team
- choose the highest-ranked remaining prospect in that filtered set
- if no remaining prospects match team needs, choose the highest-ranked remaining prospect overall

The user's big board order is always the ranking priority. Team need acts only as a filter, not as a ranking override.

## Prediction list versus big board

These must remain separate.

### Draft prediction list

Purpose:
- capture what the user thinks each slot will be

Characteristics:
- slot-based
- one prediction per pick number
- can be manually edited on draft night

### Big board

Purpose:
- capture how the user ranks players overall
- power fallback logic when the prediction list breaks

Characteristics:
- player-based
- ordered
- shared across all pick resolutions
- editable before and during the draft

### Interaction between the two

Users should be able to:

- browse or sort players in the `Board` tab
- assign a player to a specific draft slot
- see that assignment reflected as a tag on the player row

Important rule:

- editing the big board should not silently rewrite the draft prediction list
- assigning a player to a slot should update the draft prediction list

## Single workspace UX

The product should behave like one workspace with two tabs:

- `Draft`
- `Board`

Not separate routes that feel like independent products.

### Draft tab

Primary elements:

- current pick hero section
- 32-pick draft board
- selected pick detail panel
- scoreboard panel
- reveal panel for other pool picks

Each pick row should show:

- pick number
- current team on the clock
- trade badge if changed from original owner
- user's slot prediction
- user's effective pick
- status badge
- actual selection once official
- points earned

Suggested status badges:

- `Prediction valid`
- `Prediction gone`
- `Auto from board`
- `Need match`
- `Trade changed team`
- `Locked`

### Board tab

Primary elements:

- player search
- filters by position, school, and board source
- sortable rankings
- light player profile details
- reorderable personal big board
- assign-to-pick control

Board changes should update fallback projections in the `Draft` tab immediately.

## Scoring model

Per-pool configurable fields:

- `exact_player_points`
- `correct_position_points`
- `lock_rule`
- `fallback_mode`
- `hide_other_picks_until_declared`
- `allow_live_editing_for_future_picks`

Recommended defaults:

- `exact_player_points = 5`
- `correct_position_points = 2`
- `lock_rule = declared`
- `fallback_mode = queue_plus_team_need`

V1 scoring outcomes:

- exact player hit
- correct position hit
- miss

## Locking

Recommended V1 lock behavior:

- lock when the official pick is declared

This needs to be driven by the shared live draft state, not by pool data.

If a user misses the deadline:

- use manual prediction if still valid
- otherwise resolve from big board using pool fallback mode

## Trades

Trades affect live pick ownership, not pick numbering.

Schema and UI should preserve:

- `pick_number`
- `original_team_id`
- `current_team_id`

When a trade occurs:

- predictions remain attached to the pick number
- fallback suggestions are recomputed against the new team on the clock
- UI should surface that the team changed

## Live data architecture

The shared live draft state should support a provider-based ingestion model with admin override.

### Provider strategy

Primary candidate:
- ESPN unofficial draft endpoints, if validated during testing

Potential endpoint family identified during planning:

- `draft`
- `draft/rounds`
- `draft/athletes`
- `draft/status`

### Shared canonical state

All pools read from the same effective draft state.

The app should normalize incoming data into canonical tables rather than reading raw provider payloads directly in the frontend.

### Admin override

Admin controls must be able to override:

- team on the clock
- pick declared status
- official selected player
- trade ownership for a pick
- corrected or rolled back state

Recommended V1 operating mode:

- provider data with admin override precedence

## Data model outline

### Shared tables

`prospects`
- `id`
- `name`
- `position`
- `school`
- `status`
- `headshot_url`
- `metadata`

`prospect_rankings`
- `prospect_id`
- `source`
- `rank`
- `updated_at`

`nfl_teams`
- `id`
- `abbr`
- `name`

`team_needs`
- `season`
- `team_id`
- `position`

`draft_round_picks`
- `season`
- `round`
- `pick_number`
- `original_team_id`
- `current_team_id`
- `status`
- `selected_prospect_id`
- `declared_at`
- `confirmed_at`

`draft_pick_trades`
- `pick_number`
- `from_team_id`
- `to_team_id`
- `announced_at`
- `details`

`draft_provider_events`
- raw provider payload history

`draft_admin_overrides`
- field-level override records

### Pool/user tables

`user_big_board_items`
- `pool_id`
- `user_id`
- `prospect_id`
- `rank_order`
- `created_from_default`

`user_pick_predictions`
- `pool_id`
- `user_id`
- `pick_number`
- `prospect_id`
- `source`
- `updated_at`

`pick_scores`
- `pool_id`
- `user_id`
- `pick_number`
- `points_awarded`
- `hit_type`
- `scored_at`

## Build order

### 1. Foundation

- create app scaffold
- write Supabase schema
- seed teams and prospects
- seed baseline rankings and team needs

### 2. Resolution engine

- implement effective pick resolver
- implement scoring engine
- write tests around prediction/fallback/trade scenarios

### 3. Board tab

- research table
- filters
- reorderable big board
- assign-to-pick flow

### 4. Draft tab

- live board UI
- pick row state
- scoreboard
- reveal panel

### 5. Live draft ingestion

- ESPN provider adapter
- canonical state updater
- admin override UI
- realtime updates

### 6. Polish

- mobile ergonomics
- status explanations
- commissioner tools
- audit trail and correction flows
