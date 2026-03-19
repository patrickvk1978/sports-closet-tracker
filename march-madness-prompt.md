# March Madness Pool App — Claude Code Project Prompt

## Project Overview

Build a Progressive Web App (PWA) for a March Madness bracket pool with a strategic intelligence layer. This app serves small groups (under 50 players) who want more than a standard bracket pool — they want to know which upcoming games matter most to their chances of winning.

The app is inspired by a decade-old Google Sheets-based pool ("NYC Madness") that tracks ~60 players' bracket picks in a matrix format. We're modernizing this into an interactive, real-time app with simulation-powered strategic insights.

**Live URL:** https://sports-closet-tracker.vercel.app
**Supabase project:** xuttkfikpxorvelzquuu.supabase.co
**GitHub:** patrickvk1978/sports-closet-tracker
**VPS:** Hetzner Helsinki — runs `api/poller.py` in a `screen` session

---

## Core Views

### 1. Bracket View
- Classic 64-team NCAA tournament bracket visualization
- Users fill out their picks interactively by clicking/tapping matchups
- After submission, bracket is viewable with color-coded results (correct = green, eliminated = red, pending = neutral)
- Ability to view any other player's bracket (hidden before pool is locked)
- TBD slots in R32+ derive teams from the user's own picks at feeder slots (paper bracket logic)
- Mobile-responsive

### 2. Picks View (formerly Matrix View)
- Interactive table: rows = players (sorted by rank/points), columns = games (grouped by round)
- Each cell shows that player's pick for that game
- Color coding: correct picks (green), eliminated picks (red), pending picks (neutral)
- Column headers show matchup (e.g., "Duke vs Kentucky"), scheduled tip-off time (ET) for pending games, live score + game clock for live games, final score for completed games
- Key data columns: Rank, Points, PPR (Points Possible Remaining), Win Probability %
- Sortable by any column
- Filterable by round (R64, R32, S16, E8, Final Four, Championship)
- Click a game column to see pick distribution
- Sticky header row and sticky player name column
- Other players' picks hidden before pool is locked (amber banner explains)

### 3. Dashboard
- **Pre-game gate:** Non-admins see a countdown screen until the pool is locked (tip-off)
- **Pool commissioner** displayed under pool name in both pre-game and live headers
- **Single-scroll layout** (no tabs):
  1. Pool header bar with player selector + invite link
  2. **Today's Briefing** — pool-wide AI day-opener (second person plural, 80 words, `_pool` key)
  3. **Stat Strip** — rank, points, PPR, win prob with delta arrow (green ▲ / red ▼)
  4. **Your Situation** — per-player AI narrative (second person, 40 words)
  5. **Pool Key Games** — top 3 highest-leverage upcoming games, badge shows `↕ N% swing`
  6. **Your Key Games** — top 3 games by personal swing; shows "Root for TEAM ▲ +X%"
  7. **Leaderboard** — all players sorted by rank/points/PPR (sort pills), with win prob delta arrows
- **Win probability deltas** — tracked between simulation runs via `prev_player_probs`
- Admins can view the full dashboard before pool is locked

---

## Technical Architecture

### Frontend
- **Framework:** Vite + React
- **Styling:** Tailwind CSS v3
- **Routing:** react-router-dom (BrowserRouter, nested routes)
- **State:** React Context (AuthContext, PoolContext)
- **Backend client:** @supabase/supabase-js (React talks directly to Supabase via RLS)
- **Deployment:** Vercel (`app/vercel.json` has SPA rewrites)

### Backend
- **Database + Auth + Realtime:** Supabase (Postgres + RLS + Realtime subscriptions)
- **Game data:** ESPN unofficial API polled by `api/poller.py` on VPS (60s / 30s live)
- **Simulation:** Python Monte Carlo script (`api/simulate.py`) — called by poller or run manually

### Data Model (Supabase schema)

```
profiles          — id (FK auth.users), username, is_admin
pools             — id, name, invite_code (6 char), admin_id, locked (bool)
pool_members      — pool_id, user_id, joined_at
games             — slot_index (0–62), round, region, teams (JSONB), espn_id,
                    status (pending/live/final), winner, win_prob_home, updated_at
brackets          — id, pool_id, user_id, picks (JSONB array[63]), submitted_at
scores            — pool_id, user_id, points, ppr, rank, updated_at
sim_results       — id, pool_id, run_at, iterations, player_probs (JSONB),
                    leverage_games (JSONB), best_paths (JSONB),
                    prev_player_probs (JSONB), narratives (JSONB),
                    player_leverage (JSONB)
poller_heartbeat  — id (always 1), polled_at, pools_found, games_updated,
                    live_count, error
```

### App File Structure

```
app/src/
  data/mockData.js          ← Phase 1 mock data; views fall back when no live data
  lib/
    supabase.js             ← Supabase client (reads VITE_SUPABASE_URL/ANON_KEY)
    scoring.js              ← calculateScore, calculatePPR, buildPlayersArray, KEY_SLOTS
    espn.js                 ← fetchEspnGames, fetchEspnWinProb, transformEspnGame
  context/
    AuthContext.jsx         ← session, profile, signIn/signUp/signOut
    PoolContext.jsx         ← pool, members, brackets, PLAYERS_LIVE, joinPool,
                               createPool, switchPool, simResult (via useSimResults)
  hooks/
    useAuth.js / usePool.js ← context accessors (throw if used outside provider)
    useGames.js             ← Realtime subscription on games table
    useScores.js            ← Realtime subscription on scores table
    useEspnPoller.js        ← admin-only ESPN poll every 60s/30s, upserts to games;
                               also fetches win_prob_home for live games
    usePoolData.js          ← adapter: returns mockData shape; merges sim results
                               (winProb, winProbDelta, NARRATIVES, PLAYER_LEVERAGE);
                               falls back to mock
    useSimResults.js        ← Realtime subscription on sim_results table
  components/
    NavBar.jsx              ← sticky nav + pool switcher (static badge for single pool,
                               dropdown for multi-pool) + Submit/Edit link
    ProtectedRoute.jsx      ← <Outlet /> or redirect to /login
    PoolGuard.jsx           ← <Outlet /> or redirect to /join
  views/
    DashboardView.jsx       ← PreGameScreen (countdown + CTAs) for non-admins pre-lock;
                               single-scroll dashboard when locked or admin:
                               PoolNarrativeCard → StatStrip → PlayerNarrativeCard →
                               PoolKeyGamesCard → YourKeyGamesCard → Leaderboard
    MatrixView.jsx          ← const { PLAYERS, GAMES, ROUNDS } = usePoolData()
    BracketView.jsx         ← KEY_PICKS + ALIVE computed with useMemo from live data
  pages/
    LoginPage.jsx           ← /login — email/password, sign-in + sign-up tabs
                               (Google OAuth button hidden — pending consent screen setup)
    JoinPoolPage.jsx        ← /join — enter 6-char invite code (pre-filled from URL ?code=)
    CreatePoolPage.jsx      ← /create-pool — admin creates pool, shows invite code
    BracketSubmitPage.jsx   ← /submit — interactive 63-slot bracket picker + save
    AdminPage.jsx           ← /admin — 4 sub-tabs (see Admin section below)
    ResetPasswordPage.jsx   ← /reset-password — token + new password entry
  App.jsx                   ← AuthProvider > PoolProvider > BrowserRouter + nested routes
  main.jsx / index.css

api/
  simulate.py               ← Monte Carlo script + AI narrative generation;
                               flags: --pool-id UUID [--iterations N] [--dry-run]
                                      [--no-narratives] [--narrative-model MODEL]
                               default narrative model: claude-haiku-4-5-20251001
                               Opus model: claude-opus-4-6 (used for overnight/lock runs)
  poller.py                 ← VPS background process; polls ESPN every 60s (30s live);
                               upserts games; runs hourly sim (--no-narratives) during
                               first weekend; Opus narrative on bracket lock + 3 AM ET nightly
  requirements.txt          ← supabase, requests, python-dotenv, anthropic>=0.39.0
  .env.example              ← needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + ANTHROPIC_API_KEY
  ratings.json              ← BPI ratings for 365 teams

supabase/
  schema.sql                ← Full schema with RLS policies + triggers
  phase3_migration.sql      ← Adds win_prob_home column + sim_results table + RLS + Realtime
  phase4_migration.sql      ← Adds prev_player_probs, narratives, player_leverage columns
```

### Routes

```
/login          → LoginPage (public)
/reset-password → ResetPasswordPage (public)
/join           → JoinPoolPage (auth required)
/create-pool    → CreatePoolPage (auth required)
/               → Dashboard (auth + pool required)
/matrix         → Picks View (auth + pool required)
/bracket        → Bracket View (auth + pool required)
/submit         → BracketSubmitPage (auth + pool required)
/admin          → AdminPage (auth + pool + is_admin required)
```

### Bracket Slot Layout (63 slots)

```
Midwest: slots 0–14  (R64: 0-7, R32: 8-11, S16: 12-13, E8: 14)
West:    slots 15–29
South:   slots 30–44
East:    slots 45–59
F4 SF1 (Midwest vs West):  slot 60
F4 SF2 (South vs East):    slot 61
Championship:              slot 62
KEY_SLOTS = [14, 29, 44, 59, 60, 61, 62]  — maps 63-slot picks → 7-slot summary
```

### Scoring
R64=10, R32=20, S16=40, E8=80, F4=160, Champ=320 pts

---

## Admin Page (`/admin`)

Four sub-tabs. Header bar (Pre-fill 2026 Bracket button + ESPN polling badge) always visible above tabs.

### Bracket tab
- **R64 Team Editor** — 4-region tabbed interface, edit 8 matchups per region, save per-region or all at once
- **Pre-fill 2026 Bracket** button — fills all 32 R64 team names + ESPN IDs from Selection Sunday data
- **ESPN ID Mapping** table — all 63 slots; enter ESPN event IDs for the live score poller

### Members tab
- Table of all pool members with username + role badge
- **Remove Member** button per row (hidden for own row) — deletes from pool_members
- **Send Password Reset Email** form — triggers Supabase reset email for any member

### Pool tab
- **Pool Lock toggle** — lock/unlock submissions with confirmation dialog
- **Invite Link** — shows full join URL (`{origin}/join?code={invite_code}`), copy button
- **Danger Zone** — Delete Pool button with confirmation modal; cascades to members + brackets

### Simulation tab
- Copy-to-clipboard command: `python api/simulate.py --pool-id {uuid}`
- Last-run timestamp + iteration count
- Top-5 win probabilities with bar visualization

---

## VPS Poller (`api/poller.py`)

Runs continuously on a Hetzner Helsinki VPS in a `screen` session named `poller`.

### Sim schedule (first weekend: Mar 19–22)
| Trigger | Model | Narratives |
|---------|-------|------------|
| Bracket lock detected (`pools.locked` flips true) | Opus (`claude-opus-4-6`) | Yes — first narrative run |
| Overnight: 3–4 AM ET each game night | Opus | Yes — reflects on that day's games |
| Hourly (every 60 min, rest of day) | — | No (`--no-narratives`, preserves existing) |

Outside first weekend: sims trigger on round completion (existing behavior).

### Heartbeat
Writes to `poller_heartbeat` table (id=1) after every poll cycle: `polled_at`, `games_updated`, `live_count`, `error`.

### VPS setup
```bash
cd ~/sports-closet-tracker
python3 -m venv api/venv
api/venv/bin/pip install -r api/requirements.txt
screen -S poller
api/venv/bin/python api/poller.py
# Ctrl+A, D to detach
```

---

## AI Narrative System

### Narrative types
- **`_pool`** (Today's Briefing card): pool-wide day-opener, ~80 words, second person plural.
  Always opens "Welcome to Day N" or variation. Reflects on yesterday's results (skips Day 1). References 1–2 highest-leverage games by team name with standings context.
- **Per-player** (Your Situation card): ~40 words, second person ("you're sitting in 3rd..."). References their specific teams, rank, win prob delta, and best path.

### Context provided to Claude
- Tournament day number (Day 1 = Mar 19, 2026)
- Current round, games completed, today's upcoming games
- Notable upsets (seed diff ≥ 5)
- Yesterday's final results (filtered by `updated_at` ET date)
- Today's upcoming games (gameTime with no day prefix = today)
- Per-player: rank, points, win prob, delta, best path bullets
- Top 5 leverage games: matchup, pool swing %, pick distribution

### Models
- **Haiku** (`claude-haiku-4-5-20251001`): default for manual runs and testing
- **Opus** (`claude-opus-4-6`): overnight + bracket lock runs via poller

### Cost
~$0.50–$1 total for first weekend (Opus only fires ~6 times; hourly runs skip Claude entirely).

---

## Environment Variables

```
# app/.env.local
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# api/.env  (VPS + local)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=          # optional — enables AI narrative generation
```

---

## Build Phases

### Phase 1: Static Prototype ✅ COMPLETE
- Bracket, Matrix, and Dashboard views with mock data (2015 NYC Madness data)
- No backend — all hardcoded
- Goal: validate UX

### Phase 2: Backend + Auth ✅ COMPLETE (Mar 2026)
- Supabase project setup, 6-table schema, RLS on all tables
- Supabase Realtime on games + scores tables
- User auth: email/password sign-up, sign-in, sign-out
- Password reset flow
- Pool creation with 6-char invite codes; join pool flow
- Interactive bracket submission at /submit (cascading pick logic)
- All 3 views migrated from mock → live data via `usePoolData` adapter hook
- ESPN unofficial API polling (admin browser, 60s/30s interval)
- Live in-game scores in Matrix and Bracket views
- Multi-pool support: PoolContext loads all memberships, active pool in localStorage
- Admin UI at /admin: R64 team editor, pool lock toggle, ESPN ID mapping
- Pre-game dashboard gate: non-admins see countdown screen until pool is locked

### Phase 3: Win Probability Engine ✅ COMPLETE (Mar 2026)
- `supabase/phase3_migration.sql` — adds `win_prob_home` column + `sim_results` table
- `api/simulate.py` — Python Monte Carlo (10,000 iterations); BPI + seed blended model
- `useSimResults.js` — Realtime hook; sim results push live to all browsers
- `useEspnPoller.js` — fetches `win_prob_home` for live games via ESPN Core probabilities
- `usePoolData.js` — merges simResult: winProb into PLAYERS; exposes leverage_games, best_paths
- Admin Simulation tab: copy command, last-run timestamp, top-5 win probs with bar chart

### Phase 3.5: Admin UX + Pool Management ✅ COMPLETE (Mar 16 2026)
- AdminPage reorganized into 4 sub-tabs: Bracket | Members | Pool | Simulation
- Remove Member, Leave Pool, Delete Pool with confirmation dialogs
- Pool commissioner label on dashboard
- Matrix column headers show scheduled tip-off time (ET) for pending games
- Leverage threshold lowered to 5%

### Phase 3.6: VPS Background Poller ✅ COMPLETE (Mar 19 2026)
- `api/poller.py` running on Hetzner Helsinki VPS
- Polls ESPN every 60s (30s when live games detected)
- Writes heartbeat to `poller_heartbeat` table after every cycle
- Sim scheduling: hourly (no narratives) + overnight Opus + bracket lock Opus
- Eliminates need to keep admin browser tab open during tournament

### Phase 4: Dashboard Simplification + AI Narratives ✅ COMPLETE (Mar 19 2026)
- Dashboard restructured to single-scroll (no tabs)
- **Pool narrative** (`_pool` key): day-opener, opens "Welcome to Day N", references leverage games and pool standings; generated by Opus overnight / on bracket lock
- **Per-player narrative**: second person, 40 words, references their teams + rank + delta
- **Win probability deltas**: green ▲ / red ▼ arrows on StatStrip and Leaderboard
- **Your Key Games** card: top 3 personal-leverage games with "Root for TEAM ▲ +X%" framing
- **Pool Key Games** badge: `↕ N% swing` language
- **Leaderboard sort pills**: Points (default) / Win% / PPR
- `supabase/phase4_migration.sql` — adds `prev_player_probs`, `narratives`, `player_leverage`
- NavBar: "Matrix" → "Picks"; single-pool static badge

**Operational steps:**
1. Run `supabase/phase4_migration.sql` in Supabase SQL editor
2. Add `ANTHROPIC_API_KEY` to `api/.env` on VPS
3. `git pull origin main` on VPS; restart poller
4. Test: `api/venv/bin/python api/simulate.py --pool-id UUID`

### Phase 5: Polish + PWA (Planned)
- Service worker for offline bracket viewing
- Push notifications for high-leverage game alerts
- Performance optimization for matrix view with 50+ players
- Add-to-homescreen flow

---

## Notes for Development
- The matrix (Picks) view is the most complex UI component
- Use responsive design, optimize for mobile-first
- Mock data falls back gracefully when no live pool is active (dev mode)
- `simulate.py` uses `ZoneInfo('America/New_York')` for all ET scheduling — safe on any VPS timezone
- Narratives gracefully absent if `ANTHROPIC_API_KEY` not set or Claude API fails
