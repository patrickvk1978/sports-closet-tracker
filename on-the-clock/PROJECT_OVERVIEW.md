# On the Clock Project Overview

## What It Is

`On the Clock` is a standalone NFL Draft pool app built for the first round of the NFL Draft.

It is not a draft tracker. It is a competitive game layered on top of the draft.

The app is designed around three core ideas:

- decision-making
- reveal moments
- competition

The current prototype lives in:

- `/Users/patrickvankeerbergen/Documents/Documents/Projects/SportsCloset/tournamenttracker/on-the-clock`

It is intentionally separate from Tournament Tracker.

We are reusing proven patterns from Tournament Tracker:

- auth flow shape
- create/join pool flow
- pool membership patterns
- commissioner/admin structure

But the apps are not connected in runtime, backend, or deployment logic.

## Product Direction

`On the Clock` is one product with multiple modes, not separate tools.

### Live Draft

This is the interactive draft-night game.

Players:

- prepare with a Big Board
- set up team-based picks before the draft
- make or adjust `Current Pick` live during the draft
- `Submit the Card`
- compete in real time as picks are revealed and scored

### Mock Challenge

This is the lower-friction, bracket-like version.

Players:

- fill out their round-one predictions once
- `Submit Predictions`
- optionally keep editing until lock
- watch scoring unfold live during the draft

### Tracking Mode

Tracking is not a separate pool type.

It is the live scoring state of `Mock Challenge` after submission lock / draft start.

## Core Product Terminology

The product should use one vocabulary across the app:

- `Big Board`
- `Current Pick`
- `Submit the Card`
- `Submit Predictions`
- `On the Clock`
- `Pick is in`
- `Exact hit (+3)`
- `1 away (+2)`
- `2 away (+1)`
- `Out of range`
- `In play`

`Consensus` always means external rankings, not crowd behavior inside the pool.

## Core UX Structure

### Create / Join

The target flow is:

1. sign in / sign up
2. create pool or join pool
3. if creating, choose game mode
4. if joining, the pool type is already set
5. land directly in the correct pool experience

### Live Draft UX

The live experience should be built around a hero state:

- `Current Pick`
- `Your Pick`
- `Reveal`

These should feel like one evolving game moment, not disconnected modules.

Supporting surfaces:

- standings
- upcoming picks / round-one flow
- Big Board

### Mock Challenge Pre-Draft

The pre-draft experience should feel like one guided workflow:

1. select a team slot
2. use the Big Board to choose a player
3. submit the full prediction set

The relationship between picks and Big Board should be obvious.

### Mock Challenge Tracking

Tracking mode should feel like a live scoring event, not a static table.

Priority order:

- current pick
- actual pick + your pick
- opponent comparison
- leaderboard

The current pick should be visually dominant.

## Big Board

The Big Board is not just a research page.

It is a core system engine.

It should support:

- research
- ranking
- assignment to team slots
- fallback logic
- live auto-submit behavior

Key features:

- search
- filter by position
- sort by multiple ranking columns
- show your rank + external ranks
- show assigned state
- show available vs drafted state

## Scoring Model

### Live Draft

Default live draft scoring:

- exact player: `5`
- correct position: `2`

### Mock Challenge

Default mock scoring:

- exact hit: `3`
- 1 away: `2`
- 2 away: `1`

Mock scoring window rule:

- a pick in slot `N` becomes `Out of range` once pick `N+3` becomes live

## Color System

The app should use one consistent state system:

- exact hit = strong green
- 1 away = medium green
- 2 away = light green
- in play = light yellow
- out of range = neutral gray

No gradients should carry meaning.

Color should always be paired with text or points.

## Live Data Strategy

The long-term plan is to build around one shared canonical draft state.

Primary provider target:

- ESPN draft data, if validated

But the system must support admin override as a first-class control path.

Admin needs to be able to override:

- team on the clock
- pick status
- revealed player
- rollback / correction
- partial or full provider failure

All pools should read from the same live draft state.

Pool-specific data should only cover:

- membership
- scoring
- user picks
- Big Board
- standings

## Current Prototype State

The current Vercel-ready build is a wired prototype backed by localStorage.

It is not yet a shared production backend.

What is already real in the prototype:

- standalone auth shell
- create / join flow
- game mode selection
- local pool creation
- local membership model
- commissioner settings page
- global admin page
- Live Draft workspace
- Mock Challenge workspace
- Tracking mode
- persistent Big Board
- persistent predictions
- seeded demo pools
- computed standings and reveal states

What is still mocked:

- real backend / Supabase
- real multi-device sync
- real ESPN ingestion
- real pool sharing across browsers

So the current prototype is best described as:

- a functional product mock
- not yet a true shared multiplayer beta

## Current Design Priorities

The current refinement direction is:

1. stronger hierarchy
2. clearer hero moments
3. cleaner relationship between Big Board and pick entry
4. more visible multiplayer comparison
5. more energy in reveal and scoring states

## Open Product Decisions

The major decisions still open:

- should Big Board always be visible in Live Draft, or eventually become a stronger toggle?
- in Mock pre-draft, should assignment be primarily `team -> player`, `player -> team`, or both?
- how visible should auto-pick logic be versus implicit?
- for large pools, should tracking show all users, or `You + top N` by default?
- how immersive should motion be:
  - functional and restrained
  - or moderate broadcast-style emphasis

## Recommended Plan Going Forward

### Phase 1: Finish the local prototype

Goal:

- make the prototype fully usable for design and product review

Work:

- refine hierarchy further
- improve pick selection interactions
- improve reveal transitions
- deepen multiplayer simulation
- polish countdown and scoring feedback

### Phase 2: Standalone backend

Goal:

- replace localStorage with a real standalone backend

Work:

- create a separate Supabase project for On the Clock
- build standalone schema
- wire real auth
- wire pools / membership
- wire settings and admin persistence

### Phase 3: Shared draft state

Goal:

- support real live draft night usage

Work:

- canonical draft feed tables
- provider abstraction
- ESPN ingestion testing
- admin overrides
- rollback / correction logic

### Phase 4: Real multiplayer beta

Goal:

- let multiple users participate in the same pool across devices

Work:

- realtime pool updates
- shared standings
- shared reveals
- invite links
- commissioner workflow

## Summary

`On the Clock` is shaping into a strong standalone sports game product.

The concept is validated enough to keep building:

- Live Draft for engaged draft-night players
- Mock Challenge for lower-friction pools
- one shared Big Board concept
- one admin/control model
- one long-term live draft feed

The immediate objective is to keep the local prototype strong enough for fast design iteration, then transition into a real standalone backend once the UX is stable.
