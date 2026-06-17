# NBA Playoff Predictor

`nba-playoffs` is the third Sports Closet product scaffold.

It is intentionally set up as a sibling app beside:

- [`app`](../app) for the NCAA tournament tracker
- [`on-the-clock`](../on-the-clock) for the NFL Draft predictor

## Current status

This folder is now a clean NBA-themed shell cloned from `On The Clock` and re-pointed toward playoff use cases.

What is already true:

- separate Vite app
- shared auth/pool infrastructure copied locally
- NBA branding and navigation
- placeholder routes for `Dashboard`, `Bracket`, and `Series`
- NBA-specific pool modes: `bracket_pool` and `series_pickem`

What is not done yet:

- NBA playoff data model
- bracket entry UI
- series pick UI
- standings/scoring logic
- NBA-specific admin tools

## Product direction

The intended blend is:

- tournament app for product mechanics
- On The Clock for shell, pacing, and design language

## Near-term build order

1. Define the NBA playoff schema and round structure.
2. Replace copied NFL pages and hooks with NBA-specific equivalents.
3. Build bracket entry and series pick flows.
4. Add standings, live scoring, and admin controls.
