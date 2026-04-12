# NFL Survivor Pool V1 Product Spec

## Scope

V1 should establish `NFL Survivor Pool` as the next Sports Closet product with the highest odds of shipping well before the 2026 NFL season.

This product should be intentionally smaller than fantasy football and more founder-fit than World Cup. The first version should focus on one clear mode:

- `survivor_pool`

The goal is not to build every house rule on day one. The goal is to ship a clean, trustworthy weekly pick experience for real groups.

## Why This Product Next

- strong founder familiarity with the game and player behavior
- high probability of real usage this season
- compact ruleset compared with fantasy football
- reuses Sports Closet foundations cleanly: auth, pools, invites, commissioner tools, standings

## Architecture note

This product should be built as a sibling app that plugs into the shared Sports Closet architecture, not as a one-off side system.

Relevant docs:

- [`../SHARED_ARCHITECTURE.md`](../SHARED_ARCHITECTURE.md)
- [`../PVK_TOURNEY_ARCHITECTURE_MAPPING.md`](../PVK_TOURNEY_ARCHITECTURE_MAPPING.md)

The important implementation rule is:

- build Survivor against the shared three-layer model
- do not rewrite or destabilize Patrick's proven March Madness backend while doing so

## Product goals

- make weekly picks feel fast, clear, and slightly tense
- support the most common private-pool survivor rules first
- keep commissioner actions simple and visible
- create a product we can launch early, test with a few pools, and improve during the season

## Core game loop

Each week:

1. pool members open the app and see the current NFL slate
2. they make one survivor pick for the week
3. if their team wins, they advance
4. if their team loses or ties, they are eliminated
5. used teams become unavailable for future weeks
6. standings update as games go final

## V1 rule support

V1 should support the default rule set most people expect:

- pick one NFL team each week
- cannot reuse a team once it has been used
- win advances you
- loss or tie eliminates you
- missed pick is configurable: eliminate or auto-pick from highest spread / no action in V1
- one pick per week, locked at scheduled kickoff of the selected game
- pool continues until one survivor remains or all remaining entrants are eliminated

## Rules to defer until later

These are good expansion candidates but should not block V1:

- double-pick weeks
- Thanksgiving-only special rules
- strikes / lives
- optional tie-advances setting
- pick-trading / undo windows after kickoff
- confidence points
- public pick percentages and game-theory recommendations
- integration with betting lines and hedge tools

## Core surfaces

### Dashboard

The main home for an active survivor pool.

Should summarize:

- current NFL week
- your status: alive, pending, eliminated
- your current week's pick or missing-pick warning
- number of survivors remaining
- upcoming lock deadlines
- quick link into weekly picks

### Weekly Picks

The primary game workspace.

Should support:

- viewing all games for the selected NFL week
- selecting one eligible team
- showing previously used teams as unavailable
- clear lock times by game
- confirmation state after saving or submitting

### Standings

Should answer the main social pool questions:

- who is still alive
- who picked whom this week
- which users are still pending
- which users were eliminated and when

### Pool Members

Mostly shared Sports Closet functionality:

- invite / join flow
- member list
- commissioner designation
- pool identity and invite code

### Commissioner / Admin

V1 commissioner tools should stay narrow:

- create pool
- edit pool name
- choose season year
- choose pick deadline behavior
- choose missed-pick behavior
- manually override a user's survival result if needed
- reopen or clear a pick before kickoff if something went wrong

## Core entities

### Shared league data

- `nfl_seasons`
- `nfl_weeks`
- `nfl_teams`
- `nfl_games`

### Pool-level

- `pools`
- `pool_members`
- `pool_settings`
- `survivor_weeks`

### User-level

- `survivor_entries`
- `survivor_picks`
- `survivor_status_history`

## Suggested data model

### `pools`

Reuse the shared Sports Closet pool table with:

- `game_mode = survivor_pool`
- `settings.product_key = nfl_survivor`

### `nfl_games`

Reference schedule table keyed by:

- `season`
- `week`
- `home_team_id`
- `away_team_id`
- `kickoff_at`
- `status`
- `winner_team_id`
- `is_tie`

### `survivor_entries`

One row per user per pool:

- `pool_id`
- `user_id`
- `status` (`alive`, `eliminated`, `winner`)
- `eliminated_week`
- `eliminated_game_id`
- `used_team_ids` JSON or derived view in V1

### `survivor_picks`

One row per user per week:

- `pool_id`
- `user_id`
- `season`
- `week`
- `team_id`
- `game_id`
- `pick_status` (`pending`, `won`, `lost`, `tied`, `missed`, `void`)
- `locked_at`
- `submitted_at`

### `survivor_status_history`

Audit-style event log for transparency:

- `pool_id`
- `user_id`
- `week`
- `event_type`
- `notes`
- `created_at`

## MVP UX principles

- one clear action per week: make your pick
- no ambiguous eligibility state
- used teams must be obvious before the user clicks
- standings should feel alive even before all games finish
- commissioner overrides must be explicit and traceable

## Recommended V1 routes

- `/dashboard`
- `/picks`
- `/standings`
- `/pool-members`
- `/pool-settings`
- `/admin`
- `/join`
- `/create-pool`

## Reuse from existing Sports Closet apps

These pieces likely transfer with modest changes:

- auth flow
- create/join pool flow
- active-pool switching
- pool member list
- commissioner permissions
- shared nav shell
- admin page pattern
- Supabase client and RLS approach

These need new sport-specific logic:

- NFL schedule and results ingestion
- weekly pick eligibility logic
- used-team enforcement
- elimination resolution
- survivor-specific standings and history

## Scoring / outcome logic

Survivor does not need points-first scoring in V1.

Primary ordering:

1. alive status
2. elimination week
3. elimination game kickoff or final timestamp

Optional display metrics:

- total weeks survived
- current pick status
- last surviving pick

## Key product decisions

### Missed picks

Recommendation for V1:

- default to elimination
- allow commissioner to change this setting per pool later if needed

Reason:

- simplest to explain
- closest to the harsh, familiar survivor experience
- avoids needing an auto-pick engine early

### Pick visibility

Recommendation for V1:

- picks hidden until that user's selected game locks
- commissioner can view all picks

Reason:

- preserves pool suspense
- avoids piggyback behavior
- still keeps implementation manageable

### Multi-pool support

Recommendation for V1:

- support users belonging to multiple survivor pools
- active pool switching should work exactly like NBA Playoffs

## Phased build plan

### Phase 1 — Product shell and pool plumbing

- create `nfl-survivor` app shell
- wire auth, pool context, join/create/settings, pool members
- define product copy and route structure

### Phase 2 — NFL data foundation

- load NFL teams and weekly schedule
- define current week logic
- seed or ingest schedule data
- create admin tools for game status correction if feed issues happen

### Phase 3 — Weekly picks

- build picks page
- enforce one team per week
- enforce no reused teams
- lock picks at kickoff
- show used-team history

### Phase 4 — Resolution and standings

- resolve wins, losses, ties, eliminations
- build alive / eliminated standings
- show weekly pick table and pool pulse

### Phase 5 — Commissioner quality-of-life

- override results
- handle missed picks cleanly
- reopen or clear pre-lock picks
- add activity log

## Launch-ready V1 checklist

- pool creation works end to end
- invite / join works end to end
- users can submit one valid weekly pick
- reused teams are blocked
- picks lock correctly at kickoff
- results update survivor status correctly
- standings clearly show alive vs eliminated
- commissioner can correct bad data without SQL

## Good V1.5 / V2 extensions

- public pick distribution
- upset alerts and leverage angles
- pick recommendation layer
- strikes / lives pools
- double-pick holiday weeks
- notifications for missing picks and lock windows
- weekly recap / commentary

## Recommendation

If Sports Closet wants the best balance of fun, launchability, and reuse, `NFL Survivor Pool` should be the next product built after the NBA Playoffs push slows down.

It is the cleanest path to a real seasonal launch while also strengthening shared multi-product infrastructure for larger future bets like fantasy football.
