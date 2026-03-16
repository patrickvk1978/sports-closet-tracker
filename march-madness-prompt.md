# March Madness Pool App — Claude Code Project Prompt

## Project Overview

Build a Progressive Web App (PWA) for a March Madness bracket pool with a strategic intelligence layer. This app serves small groups (under 50 players) who want more than a standard bracket pool — they want to know which upcoming games matter most to their chances of winning.

The app is inspired by a decade-old Google Sheets-based pool ("NYC Madness") that tracks ~60 players' bracket picks in a matrix format. We're modernizing this into an interactive, real-time app with simulation-powered strategic insights.

**Live URL:** https://sports-closet-tracker.vercel.app
**Supabase project:** xuttkfikpxorvelzquuu.supabase.co
**GitHub:** patrickvk1978/sports-closet-tracker

---

## Core Views

### 1. Bracket View
- Classic 64-team NCAA tournament bracket visualization
- Users fill out their picks interactively by clicking/tapping matchups
- After submission, bracket is viewable with color-coded results (correct = green, eliminated = red, pending = neutral)
- Ability to view any other player's bracket (hidden before pool is locked)
- TBD slots in R32+ derive teams from the user's own picks at feeder slots (paper bracket logic)
- Mobile-responsive

### 2. Matrix View (The Signature Feature)
- Interactive table: rows = players (sorted by rank/points), columns = games (grouped by round)
- Each cell shows that player's pick for that game
- Color coding: correct picks (green), eliminated picks (red), pending picks (neutral)
- Column headers show the matchup (e.g., "Duke vs Kentucky")
- Key data columns: Rank, Points, PPR (Points Possible Remaining), Win Probability %
- Sortable by any column
- Filterable by round (R64, R32, S16, E8, Final Four, Championship)
- Click a game column to see pick distribution
- Sticky header row and sticky player name column
- Other players' picks hidden before pool is locked (amber banner explains)

### 3. Dashboard
- **Pre-game gate:** Non-admins see a countdown screen until the pool is locked (tip-off)
- **Leaderboard** with current standings, points, PPR, and win probability
- **Leverage Alerts** — high-leverage upcoming games with per-player impact
- **Biggest Rival** card — player with most bracket overlap and how you diverge
- **Best Path to Win** — simulation-powered path from Phase 3
- **Win probability** per player, updated after each Monte Carlo run
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
- **Game data:** ESPN unofficial API polled by admin browser client (useEspnPoller)
- **Simulation:** Python Monte Carlo script (`api/simulate.py`) — run from terminal, pushes results to Supabase Realtime

### Data Model (Supabase schema)

```
profiles     — id (FK auth.users), username, is_admin
pools        — id, name, invite_code (6 char), admin_id, locked (bool)
pool_members — pool_id, user_id, joined_at
games        — slot_index (0–62), round, region, teams (JSONB), espn_id,
               status (pending/live/final), winner, win_prob_home, updated_at
brackets     — id, pool_id, user_id, picks (JSONB array[63]), submitted_at
scores       — pool_id, user_id, points, ppr, rank, updated_at
sim_results  — id, pool_id, run_at, iterations, player_probs (JSONB),
               leverage_games (JSONB), best_paths (JSONB)
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
    usePoolData.js          ← adapter: returns mockData shape; merges sim results;
                               falls back to mock when no pool
    useSimResults.js        ← Realtime subscription on sim_results table
  components/
    NavBar.jsx              ← sticky nav + pool switcher dropdown + Submit/Edit link
    ProtectedRoute.jsx      ← <Outlet /> or redirect to /login
    PoolGuard.jsx           ← <Outlet /> or redirect to /join
  views/
    DashboardView.jsx       ← PreGameScreen (countdown + CTAs) for non-admins pre-lock;
                               full dashboard when locked or admin; Leave Pool button
    MatrixView.jsx          ← const { PLAYERS, GAMES, ROUNDS } = usePoolData()
    BracketView.jsx         ← KEY_PICKS + ALIVE computed with useMemo from live data
  pages/
    LoginPage.jsx           ← /login — email/password + Google OAuth, sign-in + sign-up tabs
    JoinPoolPage.jsx        ← /join — enter 6-char invite code (pre-filled from URL ?code=)
    CreatePoolPage.jsx      ← /create-pool — admin creates pool, shows invite code
    BracketSubmitPage.jsx   ← /submit — interactive 63-slot bracket picker + save
    AdminPage.jsx           ← /admin — 4 sub-tabs (see Admin section below)
    ResetPasswordPage.jsx   ← /reset-password — token + new password entry
  App.jsx                   ← AuthProvider > PoolProvider > BrowserRouter + nested routes
  main.jsx / index.css

api/
  simulate.py               ← Monte Carlo script; run: python api/simulate.py --pool-id UUID
  requirements.txt
  .env.example              ← needs SUPABASE_SERVICE_ROLE_KEY

supabase/
  schema.sql                ← Full 6-table schema with RLS policies + triggers
  phase3_migration.sql      ← Adds win_prob_home column + sim_results table + RLS + Realtime
```

### Routes

```
/login          → LoginPage (public)
/reset-password → ResetPasswordPage (public)
/join           → JoinPoolPage (auth required)
/create-pool    → CreatePoolPage (auth required)
/               → Dashboard (auth + pool required)
/matrix         → Matrix View (auth + pool required)
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

## Environment Variables

```
# app/.env.local
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# api/.env
SUPABASE_SERVICE_ROLE_KEY=
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
- User auth: email/password + Google OAuth; sign-up, sign-in, sign-out
- Password reset flow: "Forgot password?" on login → Supabase email → /reset-password page
- Pool creation with 6-char invite codes; join pool flow
- Interactive bracket submission at /submit (cascading pick logic)
- All 3 views migrated from mock → live data via `usePoolData` adapter hook
- ESPN unofficial API polling (admin browser, 60s/30s interval)
- Live in-game scores in Matrix and Bracket views
- NavBar: auth state, pool switcher dropdown, Submit/Edit bracket link
- ProtectedRoute + PoolGuard route guards
- Multi-pool support: PoolContext loads all memberships, active pool in localStorage, switchPool()
- Admin UI at /admin: R64 team editor, pool lock toggle, ESPN ID mapping
- Security-definer RPC `get_pool_members` — members can see pool roster without RLS bypass
- DB trigger auto-creates profile on auth user creation
- Picks visibility: matrix and bracket view hide other players' picks pre-lock
- BracketView: TBD slots derive from user's own picks at feeder slots
- NavBar link: "Create Bracket" before submission, "Edit Bracket" after
- Pre-game dashboard gate: non-admins see countdown screen until pool is locked
- ESPN attribution throughout app

### Phase 3: Win Probability Engine ✅ COMPLETE (Mar 2026)

Simplified from original Redis/FastAPI spec to a terminal script + Supabase Realtime:

- `supabase/phase3_migration.sql` — adds `win_prob_home` column to games + `sim_results` table
- `api/simulate.py` — Python Monte Carlo; run after each round batch completes
- `api/requirements.txt`, `api/.env.example`
- `useSimResults.js` — Realtime hook; sim results push live to all browsers
- `useEspnPoller.js` — fetches `win_prob_home` for live games via ESPN Core probabilities
- `usePoolData.js` — merges simResult: winProb into PLAYERS; exposes leverage_games, best_paths
- Admin Simulation tab: copy command, last-run timestamp, top-5 win probs with bar chart

**Operational steps before/during tournament:**
1. Run `supabase/phase3_migration.sql` in Supabase SQL editor
2. `cp api/.env.example api/.env` → fill in SUPABASE_SERVICE_ROLE_KEY
3. `pip install -r api/requirements.txt`
4. After brackets locked: `python api/simulate.py --pool-id UUID`
5. Re-run after each round batch completes

### Phase 3.5: Admin UX + Pool Management ✅ COMPLETE (Mar 16 2026)

- AdminPage reorganized into 4 sub-tabs: Bracket | Members | Pool | Simulation
- Remove Member per row in Members tab (hidden for self)
- Pool tab: LockToggle + Invite Link copy + Delete Pool danger zone (with confirmation)
- Dashboard pre-game CTA: "Edit Your Bracket" when bracket already saved, "Submit Your Bracket" when not
- Leave Pool: button in pre-game CTAs + locked dashboard header (non-admins only); confirm modal deletes from pool_members + navigates to /join

### Phase 4: Polish + PWA (Planned)
- Service worker for offline bracket viewing
- Push notifications for high-leverage game alerts
- Performance optimization for matrix view with 50+ players
- Add-to-homescreen flow

---

## Notes for Development
- The matrix view is the most complex UI component
- Use responsive design, optimize for mobile-first
- Mock data falls back gracefully when no live pool is active (dev mode)
- Score calculation trigger (wire scoring.js to fire when game goes `final`) is still a loose end
