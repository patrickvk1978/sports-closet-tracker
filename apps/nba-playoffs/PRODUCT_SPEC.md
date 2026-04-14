# NBA Playoff Predictor V1 Product Spec

## Scope

V1 should establish NBA Playoff Predictor as a real third Sports Closet product, not just a copied shell.

The first shipping version should focus on one repo-local app with two NBA pool modes:

- `bracket_pool`
- `series_pickem`

## Product goals

- preserve the stronger shell and visual language from `On The Clock`
- reuse only the tournament mechanics that map cleanly to NBA playoffs
- keep NBA-specific logic isolated so a future Sports Closet umbrella reorg is easier

## V1 surfaces

### Dashboard

The landing surface for an active pool.

Should summarize:

- pool name
- mode
- entry state
- current playoff round
- standings snapshot
- call-to-action into bracket or series workspace

### Bracket

The full playoff prediction workspace.

Should eventually support:

- East and West bracket paths
- conference finals
- NBA Finals
- champion selection
- round-by-round lock and scoring rules

### Series

The lighter prediction workspace.

Should eventually support:

- picking each series winner
- optionally picking exact series length
- live progression as each series advances
- pool comparison and standings

## Core entities

### Shared

- `playoff_teams`
- `playoff_series`
- `playoff_games`
- `playoff_round_state`

### Pool-level

- `pools`
- `pool_members`
- `pool_settings`
- `standings`

### User-level

- `user_bracket_entries`
- `user_series_picks`

## Proposed scoring

### Bracket Pool

- points increase by round
- correct conference champion bonus
- correct NBA champion bonus

### Series Pick'em

- points for correct series winner
- bonus for exact game count

## Implementation order

1. Replace copied NFL data hooks with NBA playoff data hooks.
2. Define Supabase schema and seed/reference strategy.
3. Build create/join/settings copy around NBA terminology.
4. Implement bracket entry.
5. Implement series entry.
6. Add standings and live state.
