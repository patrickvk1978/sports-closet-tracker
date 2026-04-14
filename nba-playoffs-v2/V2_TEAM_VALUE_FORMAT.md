# NBA Playoffs V2: Team Value Game

## Direction

V2 replaces the current series-pick format with a cleaner team-valuation game.

Once the 16-team playoff field is final, every user assigns a unique point value from `16` down to `1` to the playoff teams.

- `16` = the team you want to bank on most
- `1` = the team you trust least
- each value can be used only once
- the board locks before the first playoff game on **Saturday, April 18, 2026**

This turns the game into a playoff portfolio instead of a series-picking contest.

## Why This Is Better

This structure is a better fit for Sports Closet because it gives the product:

- a full exposure sheet for every user
- cleaner simulation inputs
- more interpretable live value and remaining equity
- much better rooting-guide and leverage outputs
- less brittle scoring than exact series-length picks

It also gives the app stronger language:

- "Boston is your biggest remaining asset."
- "You are overweight the West."
- "A Denver sweep is worth far more to you than to the room."
- "You are behind now, but your live board is stronger than the leader's."

## Scoring Model

Each series win scores points for the team that advances.

Score formula:

`team value + round bonus + dominance bonus`

### Round bonus

- `Round 1`: `+0`
- `Conference semifinals`: `+4`
- `Conference finals`: `+8`
- `NBA Finals`: `+12`

### Dominance bonus

- wins in `4`: `+3`
- wins in `5`: `+2`
- wins in `6`: `+1`
- wins in `7`: `+0`

So a team's per-series payout is always a clean integer.

### Examples

If you assigned Boston a `16`:

- Round 1 win in `4` = `19`
- Round 1 win in `7` = `16`
- Semifinal win in `5` = `22`
- Conference Finals win in `6` = `25`
- NBA Finals win in `4` = `31`

If you assigned Orlando a `3`:

- Round 1 win in `6` = `4`
- Semifinal win in `7` = `7`

## What This Preserves

- rewards having the right teams high
- rewards dominance
- makes later rounds matter more
- still keeps the rules legible

## What This Does Not Include Yet

For the first version of V2:

- no points for losing a series
- no partial credit for pushing a favorite to 6 or 7
- no play-in valuation because the board is assigned after the play-in field is final

Those can be added later if the game feels too binary, but they are not needed for the first pass.

## Product Implications

This is not a scoring tweak. It is a game redesign.

### Main workspace

The current `Series` tab should likely become a `Teams` or `Board` workspace where users assign `16` through `1`.

Recommended interaction:

- drag-and-drop ranking board
- or direct slot assignment table
- must make uniqueness obvious

### Bracket

`Bracket` stays useful, but as context for exposure rather than for pick entry.

It should help answer:

- where your biggest assets sit
- how much value is concentrated in one side of the bracket
- what results help your board most

### Standings

`Standings` becomes more simulation-forward.

Most useful columns later:

- current points
- live value remaining
- best remaining asset
- win probability

### Reports

This format should produce stronger reports than V1:

- rooting guide
- biggest remaining assets
- room exposure by team
- title concentration
- leverage by series
- win probability drivers

## Simulation Outputs This Enables

The v2 format makes these outputs much cleaner:

- current score
- points earned by round
- live value remaining
- maximum remaining upside
- win probability
- best/worst-case series swings
- team concentration and portfolio fragility

In other words, this format gives the simulation engine a full board instead of isolated picks.

## Open Questions

These still need decisions, but they do not block the model itself:

1. exact lock time on April 18, 2026
2. tie handling in standings
3. whether later we want tiny "losing effort" credit
4. whether the app should still surface market/model on every series card or concentrate more on team exposure

## Recommended Next Implementation Order

1. add a v2 scoring engine alongside the current one
2. build a team-value board entry screen
3. switch standings to team-value scoring and live-value outputs
4. rebuild reports around exposure and leverage
5. keep the current bracket page as contextual support

## Current Working Assumption

The clean working formula for V2 is:

`series win points = team value + round bonus + dominance bonus`

That is the version worth prototyping first.
