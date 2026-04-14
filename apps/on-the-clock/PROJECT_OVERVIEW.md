# On the Clock — Project Overview

## What It Is

`On the Clock` is a standalone NFL Draft pool app built for the first round of the NFL Draft.

It is not a draft tracker. It is a competitive game layered on top of the draft.

The app is designed around three core ideas:

- decision-making
- reveal moments
- competition

The app lives at:

- Local: `/Users/patrickvankeerbergen/Documents/Documents/Projects/SportsCloset/tournamenttracker/on-the-clock`
- Supabase project: `On the Clock` (ID: `kkcbnpritiuqyobyrunp`, region: `us-east-1`)
- Deployment: Vercel (Phase 9 — see Roadmap)

It is intentionally separate from Tournament Tracker. Same org, different Supabase project, different deployment.

---

## Product Direction

`On the Clock` is one product with multiple modes, not separate tools.

### Live Draft

The interactive draft-night game.

Players:
- prepare with a Big Board
- set up team-based picks before the draft
- make or adjust `Current Pick` live during the draft
- `Submit the Card`
- compete in real time as picks are revealed and scored

### Mock Challenge

The lower-friction, bracket-like version.

Players:
- fill out their round-one predictions once
- `Submit Predictions`
- optionally keep editing until lock
- watch scoring unfold live during the draft

### Tracking Mode

Not a separate pool type — it is the live scoring state of `Mock Challenge` after submission lock / draft start.

---

## Core Product Terminology

One consistent vocabulary across the app:

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

---

## Core UX Structure

### Create / Join

1. sign in / sign up
2. create pool or join pool
3. if creating, choose game mode
4. if joining, pool type is already set
5. land directly in the correct pool experience

### Live Draft UX

The live experience is built around a hero state:

- `Current Pick`
- `Your Pick`
- `Reveal`

These feel like one evolving game moment, not disconnected modules.

Supporting surfaces: standings, upcoming picks / round-one flow, Big Board.

### Mock Challenge Pre-Draft

One guided workflow:

1. select a team slot
2. use the Big Board to choose a player
3. submit the full prediction set

### Mock Challenge Tracking

Live scoring event, not a static table. Priority order:

- current pick
- actual pick + your pick
- opponent comparison
- leaderboard

---

## Big Board

The Big Board is a core system engine, not just a research page.

Supports:
- research and ranking
- assignment to team slots
- fallback logic for auto-submit
- live auto-submit behavior

Features:
- search, filter by position, sort by multiple ranking columns
- shows your rank + external ranks
- shows assigned state and available vs drafted state

---

## Scoring Model

### Live Draft (defaults)
- exact player: `5`
- correct position: `2`

### Mock Challenge (defaults)
- exact hit: `3`
- 1 away: `2`
- 2 away: `1`
- scoring window: a pick in slot `N` becomes `Out of range` once pick `N+3` becomes live

---

## Color System

One consistent state system (tokenized in CSS):

- exact hit → `--exact-*` (green)
- 1 away → medium green
- 2 away → light green
- in play → `--near-*` (amber/yellow)
- out of range → `--miss-*` (neutral gray)

Color is always paired with text or points — never color alone.

---

## Live Data Strategy

All pools read from one shared canonical draft state (`draft_feed` singleton + `draft_actual_picks`).

Admin can override:
- team on the clock
- pick status
- revealed player
- rollback / correction
- partial or full provider failure

Pool-specific data: membership, scoring, user picks, Big Board, standings.

Long-term target: ESPN live draft ingestion (or equivalent validated provider).

### Rehearsal notes

The live WNBA draft rehearsal findings are documented here:

- `DRAFT_FEED_REHEARSAL.md`

That document captures the real ESPN draftcast behaviors we observed and the implementation rules we want to carry forward into the NFL draft build.

---

## Current Build State

**Status: Production-ready Supabase backend, full 32-pick data seeded, design-polished frontend. Ready for Vercel deployment.**

### What is live and working

- **Auth**: Supabase email/password, auto-profile creation trigger, 3-retry fallback
- **Database**: 14 tables, RLS on all, RPC functions (`get_pool_members`, `get_pool_by_invite_code`), realtime on 6 tables
- **Pool CRUD**: create, join, settings, member list — all Supabase
- **Reference data**: 32 NFL teams, 32 round-1 picks, 200 prospects (50 real + 150 placeholders) — all in Supabase via `useReferenceData` hook
- **Big Board**: per-user per-pool board order, seeded from prospect list, Supabase persistence
- **Predictions & live cards**: `useLiveDraft`, `useMockChallenge` — read/write Supabase
- **Shared draft feed**: `useDraftFeed` — singleton table, realtime subscriptions, admin controls
- **Admin page**: full draft feed controls + **Sync Prospects** button (edit JSON → click → upserts all 200 rows)
- **Design**: Inter font, dark nav, full design token system, skeleton loaders, empty states, hover/focus/active states, reveal animations

### Architecture

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite + React Router 7 |
| Styling | Custom CSS (design token system, ~2000 lines) |
| Backend | Supabase (Postgres + Auth + Realtime + RLS) |
| Deployment | Vercel (Phase 9) |

### Key files

| File | Purpose |
|---|---|
| `src/lib/supabase.js` | Supabase client singleton |
| `src/context/AuthContext.jsx` | Auth (sign in/up/out, profile fetch) |
| `src/context/PoolContext.jsx` | Pool CRUD + membership |
| `src/hooks/useReferenceData.js` | Loads teams/prospects/picks from DB |
| `src/hooks/useDraftFeed.js` | Shared draft state + realtime + admin writes |
| `src/hooks/useBigBoard.js` | Per-user board persistence |
| `src/hooks/useLiveDraft.js` | Live draft picks, cards, scoring, standings |
| `src/hooks/useMockChallenge.js` | Mock predictions, scoring, tracking rows |
| `src/data/prospects2026.json` | Source of truth for prospect data (edit → Sync) |
| `src/components/Skeleton.jsx` | Shimmer skeleton loaders |
| `src/components/EmptyState.jsx` | Empty state component |
| `vercel.json` | SPA rewrite + build config |
| `.env.local` | `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (gitignored) |

### Database tables

**Global (shared across all pools):**
`profiles`, `nfl_teams`, `prospects`, `round_1_picks`, `draft_feed` (singleton id=1), `draft_actual_picks`, `draft_team_overrides`

**Pool-scoped:**
`pools`, `pool_members`, `user_big_boards`, `user_predictions`, `user_live_cards`, `mock_submissions`, `pick_scores`

### Prospect update workflow

1. Edit `src/data/prospects2026.json`
2. Go to `/admin` → **Sync Prospects**
3. 200 rows upserted to Supabase — no SQL, no redeploy

### Draft pick order note

The 32 round-1 picks are seeded in approximate order based on 2024 season records. For trade corrections, use the admin team override system (picks stay as-is, the override table tracks the current holder). For a full order correction, run a new SQL migration.

---

## Open Product Decisions

- Should Big Board always be visible in Live Draft, or become a stronger toggle?
- In Mock pre-draft, should assignment flow be `team → player`, `player → team`, or both?
- How visible should auto-pick logic be versus implicit?
- For large pools, show all users in tracking or `You + top N` by default?
- How immersive should motion be: functional/restrained or moderate broadcast-style?

---

## Implementation Roadmap

### Phase 0: Project Setup — ✅ DONE
Supabase project, npm install, supabase client, env config, broke symlink to shared node_modules.

### Phase 1: Database Schema — ✅ DONE
14 tables, RLS + policies on all, RPC functions, realtime enabled on 6 tables, draft_feed singleton seeded.

### Phase 2: Auth Integration — ✅ DONE
AuthContext rewritten to Supabase Auth. Sign up with 3-retry profile creation loop, orphan-account fallback, email confirmation handling.

### Phase 3: Pool CRUD & Membership — ✅ DONE
810-line PoolContext decomposed. Pool CRUD, invite code join, member list — all Supabase.

### Phase 4: Big Board Persistence — ✅ DONE
`useBigBoard` hook. Per-user per-pool board order, seeded from prospect list, optimistic updates.

### Phase 5: Predictions & Live Cards — ✅ DONE
`useLiveDraft` and `useMockChallenge` hooks. Supabase read/write, realtime card subscriptions, fallback/resolution engine, standings computed from live data.

### Phase 6: Shared Draft Feed & Realtime — ✅ DONE
`useDraftFeed` hook. Singleton table, realtime subscriptions on 3 tables, full admin write API.

### Phase 7: Reference Data Layer — ✅ DONE
- 32 NFL teams + 32 round-1 picks seeded into Supabase
- 200 prospects in `prospects2026.json` + Admin Sync Prospects button
- `useReferenceData` hook replaces all hardcoded `draftData.js` imports
- `ReferenceDataProvider` added to App.jsx
- All 8 consumer files migrated to DB field names (`consensus_rank`, `espn_rank`, `pff_rank`, `predicted_range`)

### Phase 8: Design & UX Polish — ✅ DONE
- Full CSS rewrite: Inter font, dark nav (#111827), 50+ design tokens
- Animations: `shimmer`, `fade-in`, `reveal-pop`, `score-flash-green/amber`, `live-pulse`
- `Skeleton.jsx`: SkeletonLine, SkeletonBlock, SkeletonPickList, SkeletonBoardTable, SkeletonPanel
- `EmptyState.jsx` component
- Loading states in LiveDraftView, MockChallengeView, BigBoardTable
- NavBar: dark, OTC branding, active route detection, aria labels
- LoginPage: placeholders, autocomplete, info/error distinction, sign-up prompt
- All interactive elements: hover + active + `:focus-visible` states
- Mobile responsive: 1120px and 760px breakpoints refined

### Phase 9: Deployment — 🔄 IN PROGRESS
- `vercel.json` created (SPA rewrite, build config)
- Deploy via Vercel CLI or GitHub integration
- Set env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Update Supabase Auth allowed URLs (site URL + redirect URLs)

### Phase 10: Real-Time Multiplayer Hardening
- Stress-test realtime with multiple connected sessions
- Add optimistic conflict resolution
- Connection status indicator (reconnecting, offline)
- Handle missed realtime events (re-fetch on reconnect)

### Phase 11: Live Draft Feed Integration (Future)
- ESPN or comparable live draft data ingestion
- Edge function or server-side poller writing to `draft_actual_picks`
- Admin override remains first-class fallback

---

## Summary

`On the Clock` is a production-ready NFL Draft pool app with a Supabase backend, real multiplayer via realtime subscriptions, and a polished design system.

Two game modes (Live Draft, Mock Challenge) share one auth model, one data layer, and one Big Board concept.

The immediate next step is Vercel deployment.
