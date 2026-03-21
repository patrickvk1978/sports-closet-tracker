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
- **Single-scroll layout** (5 sections):
  1. **Stat Bar** — compact row: rank, points, win prob with delta arrow, champion alive/eliminated pill, "Need: X, Y, Z" (compressed best path picks)
  2. **Narrative** — single context-aware card: player narrative during live games ("Latest Update"), pool narrative in morning ("Morning Briefing"). Never both simultaneously.
  3. **Score Grid** — responsive grid (2→3→4 columns) of ESPN-style game cards. Shows live games (amber glow + pulse), recently-final games (≤15 min), and about-to-tip games (≤15 min before start). Each card: seeds + teams + scores + "You: ▲+X% if Team" (delta from current win prob) + pool's biggest winner.
  4. **Coming Up** — top 3 highest-impact pending games for the selected player (games >15 min from tip). Shows both-side deltas: "Arizona: ▲+5.2% · LIU: ▼-17.1%"
  5. **Leaderboard** — all players sorted by rank/points/PPR (sort pills), with win prob delta arrows
- **Win probability deltas** — tracked between simulation runs via `prev_player_probs`; leverage display uses delta from current win prob (not raw swing)
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
                    player_leverage (JSONB), narrative_day (int)
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
                               StatBar → NarrativeCard → ScoreGrid → ComingUp → Leaderboard
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
                                      [--narrative-type overnight|game_end]
                                      [--just-finished "Team A over Team B"]
                               default narrative model: claude-haiku-4-5-20251001
                               Opus model: claude-opus-4-6 (used for overnight runs)
  poller.py                 ← VPS background process; polls ESPN every 60s (30s live);
                               upserts games; triggers sim on game completion (game_end
                               narrative) + hourly (no narratives) + 3 AM ET (overnight
                               narrative); dynamic tournament detection (no hardcoded dates);
                               seeds prev_final_set from DB on startup to avoid false triggers
  requirements.txt          ← supabase, requests, python-dotenv, anthropic>=0.39.0
  .env.example              ← needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + ANTHROPIC_API_KEY
  ratings.json              ← BPI ratings for 365 teams

supabase/
  schema.sql                ← Full schema with RLS policies + triggers
  phase3_migration.sql      ← Adds win_prob_home column + sim_results table + RLS + Realtime
  phase4_migration.sql      ← Adds prev_player_probs, narratives, player_leverage columns
  phase5_migration.sql      ← Adds narrative_day column to sim_results
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

### Tournament detection
Dynamic — no hardcoded date sets. `tournament_active` is True when any game has status `live` or `final`. ESPN dates are fetched using ET timezone (not UTC) with yesterday included to avoid missing late-night games.

### Startup safety
On startup, queries DB for all games already `final` to seed `prev_final_set`. Prevents false mass-sim triggers when restarting the poller mid-tournament.

### Sim schedule
| Trigger | Model | Narrative type | Details |
|---------|-------|---------------|---------|
| Game goes final | Haiku | `game_end` | Runs sim + 40-word narrative per player about that game's impact. `--just-finished "Team A over Team B"` passed as context. |
| Overnight: 3 AM ET | Opus | `overnight` | 60-word day-ahead briefing per player + pool summary. |
| Hourly (every 60 min) | — | None | `--no-narratives` — odds refresh only. |
| Bracket lock detected | Opus | `overnight` | First narrative run. |

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

### Two narrative triggers
1. **`overnight`** (3 AM ET / bracket lock): 60-word day-ahead briefing per player + `_pool` summary. Generated by Opus. Pool narrative opens "Welcome to Day N". Player narratives preview the day's key games and what to watch for.
2. **`game_end`** (every game completion): 40-word reaction per player about the just-finished game's impact. Generated by Haiku. No pool narrative — player-only. `--just-finished` provides game result context.

### Narrative display (dashboard)
- Single `NarrativeCard` component — never shows both pool and player narrative simultaneously.
- Morning (before games start): pool narrative ("Morning Briefing")
- During/after games: player narrative ("Latest Update")

### Rank vs Win Probability distinction
The LLM prompt explicitly instructs Claude that "rank" = points rank and "win prob" = simulated chance of winning. Players sorted by points rank in the prompt. This allows narratives like "even though you're 3rd in points, your win probability is highest because your remaining picks are strong."

### Context provided to Claude
- Tournament day number (Day 1 = first game day)
- `narrative_day` stored in sim_results for day-opener detection
- Current round, games completed, today's upcoming games
- Notable upsets (seed diff ≥ 5)
- Yesterday's final results (filtered by `updated_at` ET date)
- Per-player: rank (by points), points, win prob, delta, best path bullets
- Top 5 leverage games: matchup, pool swing %, pick distribution
- For `game_end`: `--just-finished` game result string

### Models
- **Haiku** (`claude-haiku-4-5-20251001`): game_end narratives + manual runs
- **Opus** (`claude-opus-4-6`): overnight + bracket lock runs

### Cost
~$0.50–$1 total for first weekend (Opus fires ~4 times; game_end uses Haiku; hourly runs skip Claude entirely).

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
- **Bug fix:** ESPN date fetching switched from UTC to ET timezone (games after 8 PM ET were disappearing from fetch window); now includes yesterday in date range

### Phase 4: Dashboard + AI Narratives ✅ COMPLETE (Mar 19 2026)
- Dashboard restructured to single-scroll (no tabs)
- **Pool narrative** + **per-player narrative** system (later redesigned in Phase 5)
- **Win probability deltas**: green ▲ / red ▼ arrows
- **Leaderboard sort pills**: Points (default) / Win% / PPR
- `supabase/phase4_migration.sql` — adds `prev_player_probs`, `narratives`, `player_leverage`
- NavBar: "Matrix" → "Picks"; single-pool static badge

**Operational steps:**
1. Run `supabase/phase4_migration.sql` in Supabase SQL editor
2. Add `ANTHROPIC_API_KEY` to `api/.env` on VPS
3. `git pull origin main` on VPS; restart poller
4. Test: `api/venv/bin/python api/simulate.py --pool-id UUID`

### Phase 5: Dashboard Redesign + Narrative Overhaul ✅ COMPLETE (Mar 20 2026)
- **Dashboard redesign** — 7 stacked cards → 5 focused sections: StatBar, NarrativeCard, ScoreGrid, ComingUp, Leaderboard
- **ScoreGrid** — ESPN-style responsive game cards (grid-cols-2/3/4) showing live games (amber glow), recent finals (≤15 min), about-to-tip (≤15 min). Each card shows seeds + scores + "You: ▲+X% if Team" + pool biggest winner
- **ComingUp** — top 3 high-impact pending games with both-side deltas per team
- **StatBar** — compact row merging rank, points, win prob delta, champion pill, "Need: X, Y, Z" best path
- **Leverage display overhaul** — raw swing → delta from current win prob; both outcomes shown for personal games
- **All game impact data** sent to frontend (removed 5% threshold filter on leverage_games)
- **Matrix root-for** expanded to live + pending games, shows upside delta (`▲+X%`), skips <0.5%
- **Two-trigger narrative model** — overnight (3 AM, Opus, 60-word) + game_end (every final, Haiku, 40-word)
- **Dynamic tournament detection** — replaces hardcoded FIRST_WEEKEND date set
- **Startup prev_final_set seeding** — prevents false mass-sim triggers on poller restart
- **Rank vs win prob distinction** in LLM prompt — players sorted by points rank, explicit instruction
- `supabase/phase5_migration.sql` — adds `narrative_day` column
- New simulate.py flags: `--narrative-type`, `--just-finished`

### Phase 6: Polish + PWA (Planned)
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
- LEADERBOARD NOT UPDATING: My guess it is giving updates for only the previous 24 hours. On the morning of 3/21, the picks table is only showing results from 3/20 (not 3/19). Bracket too. The site seems to have forgotten results from Day 1 of the tournament.
- LEAGUE ADMIN VS SITE ADMIN: Will eventually need to differentiate these roles.
- AI NOTES: Morning briefing is using some incorrect data, e.g., "yesterday's 12-game slate" when there 16 games, Duke-Siena was actually not yesterday
- STANDINGS ACCURACY: When teams have the same points, they should be listed as tied for the same place in the standings.
