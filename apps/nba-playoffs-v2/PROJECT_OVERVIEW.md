# NBA Playoff Predictor — Project Overview

## What It Is

`NBA Playoff Predictor` is a Sports Closet sibling app focused on round-by-round NBA playoff prediction pools.

It is no longer just a shell. The app now has a usable local-first product shape with:

- a real `Series Pick'em` flow
- a connected `Bracket` context page
- standings
- reports
- commissioner / admin surfaces

## Current Product Direction

The core NBA game is:

- series picked round by round
- winner + series length
- scoring based on exactness and round weighting

The app is intentionally built around:

- personalized leverage interpretation
- pool-aware reporting
- probability-informed decision support

## Core Routes

- `/dashboard`
- `/standings`
- `/series`
- `/bracket`
- `/reports`
- `/reports/:reportKey`
- `/reports/series/:seriesId`
- `/reports/opponent/:opponentId`
- `/join`
- `/create-pool`
- `/pool-settings`
- `/pool-members`
- `/admin`

## Current Architecture

- Frontend: React 19 + Vite + React Router 7
- Styling: token-based CSS shell, now re-themed specifically for NBA
- Contest model: single active format built around `Series Pick'em`
- Data state: local-first with clear seams for shared backend integration

## What Is Real Versus Placeholder

### Real enough to use locally

- series selection workflow
- bracket reflecting selected picks
- standings table
- reports overview and detail pages
- commissioner/admin role framing

### Still placeholder / seeded

- market/model percentages
- commentary generation
- shared live simulation outputs
- shared backend persistence beyond the current local-first layer

## Shared Backend Direction

The agreed multi-product architecture direction is:

1. probability inputs
2. simulation outputs
3. commentary outputs

See:

- [`PROBABILITY_COMMENTARY_PLAN.md`](./PROBABILITY_COMMENTARY_PLAN.md)
- [`HANDOFF_STATUS.md`](./HANDOFF_STATUS.md)

## Near-Term Goal

Keep the NBA app moving as a strong frontend/product draft while Patrick and the team align on the unified Sports Closet backend structure.
