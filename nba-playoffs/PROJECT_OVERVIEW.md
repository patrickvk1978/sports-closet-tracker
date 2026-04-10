# NBA Playoff Predictor — Project Overview

## What It Is

`NBA Playoff Predictor` is the new Sports Closet sibling app for NBA postseason pools.

Right now it is a scaffold, not a finished product. The purpose of this folder is to give us:

- a separate app boundary
- a cleaner shell modeled after `On The Clock`
- room to port playoff mechanics from the NCAA tournament app selectively

## Current architecture

- Frontend: React 19 + Vite + React Router 7
- Styling: copied token-based CSS shell from `On The Clock`, then re-themed
- Auth/pool foundation: copied locally so the app can evolve independently
- Status: scaffolded product shell with placeholder NBA routes

## Current routes

- `/dashboard`
- `/bracket`
- `/series`
- `/join`
- `/create-pool`
- `/pool-settings`
- `/pool-members`
- `/admin`

## Current product modes

- `bracket_pool`
- `series_pickem`

These are placeholders for the two clearest NBA product directions:

- a full playoff bracket product
- a lower-friction series-by-series prediction product

## What this app should inherit

From the NCAA tournament app:

- playoff pool mechanics
- bracket progression concepts
- live scoring and standings ideas
- commissioner controls

From `On The Clock`:

- top-level shell
- navigation feel
- workspace framing
- CSS token system

## Immediate next work

1. Remove copied NFL-specific hooks and pages from the critical path.
2. Define NBA playoff entities and Supabase tables.
3. Build real bracket and series-entry surfaces.
4. Add standings and game/series progression logic.
