# March Madness Pool App — Claude Code Project Prompt

## Project Overview

Build a Progressive Web App (PWA) for a March Madness bracket pool with a strategic intelligence layer. This app serves small groups (under 50 players) who want more than a standard bracket pool — they want to know which upcoming games matter most to their chances of winning.

The app is inspired by a decade-old Google Sheets-based pool ("NYC Madness") that tracks ~60 players' bracket picks in a matrix format. We're modernizing this into an interactive, real-time app with simulation-powered strategic insights.

## Core Views

### 1. Bracket View
- Classic 64-team NCAA tournament bracket visualization
- Users fill out their picks interactively by clicking/tapping matchups
- After submission, bracket is viewable with color-coded results (correct = green, eliminated = red, pending = neutral)
- Ability to view any other player's bracket
- Mobile-responsive — must work well on phones since users will check during games

### 2. Matrix View (The Signature Feature)
- Interactive table: rows = players (sorted by rank/points), columns = games (grouped by round)
- Each cell shows that player's pick for that game
- Color coding: correct picks (green), eliminated picks (red), pending picks (neutral)
- Column headers show the matchup (e.g., "Duke vs Kentucky")
- Key data columns: Rank, Points, PPR (Points Possible Remaining), Win Probability %
- Sortable by any column
- Filterable by round (Round of 64, 32, Sweet 16, Elite 8, Final Four, Championship)
- Click a game column to see pick distribution (e.g., "72% picked Duke, 28% picked Kentucky")
- Sticky header row and sticky player name column for scrolling
- Round scoring: Round of 64 = 10pts, Round of 32 = 20pts, Sweet 16 = 40pts, Elite 8 = 80pts, Final Four = 160pts, Championship = 320pts

### 3. Dashboard
- **Leaderboard** with current standings, points, PPR, and win probability
- **Win Probability Chart** — line or bar chart showing top contenders' win probability over time (updates after each game)
- **Leverage Alerts** — "Tonight's Games That Matter Most" section highlighting high-leverage games with explanations (e.g., "If Duke beats Kentucky, PlayerX's win probability jumps from 12% to 31%")
- **Consensus Picks** — for upcoming games, show what % of the pool picked each team
- **Elimination Tracker** — how many players still have their champion alive, Final Four teams alive, etc.
- **Contrarian Report** — highlight players with unique picks that could vault them up the standings

## Technical Architecture

### Frontend
- **Framework**: React (Next.js or Vite)
- **Styling**: Tailwind CSS
- **State Management**: React Context or Zustand for lightweight state
- **Charts**: Recharts or Chart.js for win probability visualizations
- **PWA**: Service worker for offline bracket viewing, add-to-homescreen support

### Backend
- **API**: Python FastAPI
- **Database**: Supabase (PostgreSQL + real-time subscriptions + auth)
- **Simulation Engine**: Python-based Monte Carlo simulation
  - Inputs: all players' brackets, current tournament state, win probabilities per remaining game
  - Process: simulate remaining tournament 10,000+ times
  - Outputs: each player's probability of winning the pool, leverage scores per upcoming game
- **Data Sources**: 
  - Game results: ESPN API or NCAA live data feed
  - Win probabilities: KenPom ratings, Vegas lines, or ESPN BPI
  - Update frequency: real-time during games, batch recalculation after each game completes

### Data Model

```
User {
  id, username, email, pool_id, created_at
}

Pool {
  id, name, admin_id, scoring_system, created_at
}

Bracket {
  id, user_id, pool_id, picks (JSON — array of 63 game predictions), submitted_at
}

Game {
  id, round, region, team1, team2, team1_seed, team2_seed, 
  winner, score, status (pending/live/final), 
  win_probability_team1, scheduled_time
}

Simulation_Result {
  id, pool_id, calculated_at, 
  player_probabilities (JSON — {user_id: win_probability}),
  leverage_scores (JSON — {game_id: {team1_win_impact, team2_win_impact}})
}
```

### Key Algorithms

**Points Calculation:**
- Compare each user's bracket picks against actual game results
- Award points based on round: R64=10, R32=20, S16=40, E8=80, F4=160, Champ=320

**Points Possible Remaining (PPR):**
- For each remaining game, check if the user's picked team is still alive
- Sum the point values for all remaining correct-eligible picks

**Win Probability (Monte Carlo):**
- For each simulation run:
  1. Simulate each remaining game using win probabilities (weighted coin flip)
  2. Calculate final points for every player given simulated outcomes
  3. Record who wins the pool
- After N simulations, each player's win probability = (times they won) / N

**Leverage Score:**
- For a given upcoming game, run simulations twice: once assuming Team A wins, once assuming Team B wins
- Leverage for a player = |P(win pool | Team A wins) - P(win pool | Team B wins)|
- High leverage = this game's outcome dramatically affects this player's chances

## Design Direction

- **Tone**: Sports data intelligence meets clean modern UI — think ESPN meets Bloomberg Terminal for brackets
- **Dark mode default** with option for light mode (people watch games at night/in bars)
- **Typography**: Bold, sporty but not cheesy. Something with weight for headers, clean sans-serif for data
- **Color palette**: Dark navy/charcoal base, bright accent colors for team matchups, green/red for correct/eliminated
- **Key interaction**: The matrix view should feel powerful — like a trading floor dashboard for your bracket pool
- **Mobile-first**: Most users will check this on their phones during games

## Build Phases

### Phase 1: Static Prototype ✅ COMPLETE
- Bracket input view with mock tournament data
- Matrix view with mock player/pick data (2015 NYC Madness data as template)
- Dashboard with static charts and mock leverage data
- No backend — all hardcoded/mock data
- Goal: validate the UX and get feedback from the group

### Phase 2: Backend + Auth ✅ COMPLETE (Mar 2026)
**Deployed at: https://sports-closet-tracker.vercel.app**

Completed:
- Supabase project setup (xuttkfikpxorvelzquuu.supabase.co)
- 6-table schema: profiles, pools, pool_members, games, brackets, scores
- Row-Level Security on all tables
- Supabase Realtime on games + scores tables
- User sign-up / sign-in / sign-out (email + password)
- Pool creation with 6-char invite codes
- Join pool flow
- Interactive bracket submission at /submit (cascading pick logic)
- All 3 views (Dashboard, Matrix, Bracket) migrated from mock → live data
- usePoolData adapter hook — views fall back to mock data gracefully
- ESPN unofficial API polling (admin browser, 60s/30s interval)
- Live in-game scores displayed in Matrix and Bracket views
- NavBar with auth state, pool name, Submit link, sign-out
- ProtectedRoute + PoolGuard route guards
- Selection Sunday admin UI at /admin:
  - R64 team name editor (32 matchups across 4 regions)
  - Pool lock toggle with confirmation
  - ESPN ID mapping table for all 63 slots
- ESPN attribution ("Scores via ESPN") throughout app
- 5 crash bugs fixed in BracketView and usePoolData

Remaining Phase 2 loose ends (pre-tournament):
- [ ] Score calculation trigger — wire scoring.js to fire when a game goes `final`
- [ ] Bracket lock automation — auto-lock submissions at tip-off or via admin toggle
- [x] Auto-redirect to /submit after joining or creating a pool
- [x] NavBar button: "Create Bracket" before picks submitted, "Edit Bracket" after
- [x] BracketView: CBS Sports style inline pick color coding
- [x] Members can't see each other — fixed via security-definer RPC `get_pool_members`
- [x] Bracket view shows TBD — fixed: pending R32+ slots now derive teams from user's
      picks at feeder slots (same logic as a filled-out paper bracket)
- [x] Final Four tab was hardcoded mock data — fully rewritten with live data + pick logic
- [x] Nav routing: "Create Bracket" → /submit (no bracket); "Bracket" → /bracket (has bracket)
      with "Edit Bracket" button on bracket page (hidden when pool is locked)
- [x] Picks visibility: matrix hides other players' picks before lock; bracket view hides
      player selector before lock; amber banner shown to explain

### Phase 3: Win Probability Engine (Planned — post Selection Sunday, Mar 15 2026)

Full technical spec defined. Summary below; see probability-spec in repo for detail.

**Architecture**
```
Market Odds → Team Strength (Bradley-Terry) → Matchup Probability Matrix
→ Monte Carlo Simulations → Bracket Scoring → Pool Win Probabilities → Leverage
```

**Simulation matrix**
- Shape: [200,000 × 63], dtype uint8
- Each cell = winning team_id (0–63) for that game in that simulation
- Generated once, reused across all pools — O(players × simulations) per pool eval
- Memory: ~12.6MB; generation time: ~1s
- Stored in Redis for fast reuse; recomputed when odds change significantly

**Game indexing (sim_index — different from frontend slot_index)**
```
sim_index 0–31:  R64  (round-based, all regions interleaved)
sim_index 32–47: R32
sim_index 48–55: S16
sim_index 56–59: E8
sim_index 60–61: F4
sim_index 62:    Champ
```
Action required: add `sim_index int` column to `games` table before Phase 3.
The frontend uses `slot_index` (region-based); Python uses `sim_index` (round-based).
A one-time mapping is set in the admin UI alongside ESPN ID mapping.

**Pick storage — recommendation: keep team name strings in Postgres**
The spec uses uint8 team IDs in the simulation matrix. Our brackets store team name
strings (e.g. "Duke"). Recommended approach: keep strings in DB (human-readable,
no migration needed), convert names → team IDs in the Python service at query time
using a `teams` lookup table. No bracket schema changes required.

**Scoring weights**
Spec uses 1/2/4/8/16/32; app uses 10/20/40/80/160/320 (×10 scale, mathematically
equivalent for ranking). Python service uses spec weights internally.

**Leverage calculation**
- Partition simulations by game outcome (S_A vs S_B)
- Pool importance = 0.5 × Σ|P_A - P_B| (Total Variation Distance)
- Per-player impact = |P_A[i] - P_B[i]|
- Tie equity: fractional win share split equally among tied players

**Infrastructure**
- Python FastAPI service (separate from React frontend)
- Postgres: pools, players, brackets (existing schema)
- Redis: simulation_matrix, pool_winner_matrix, cached odds
- Target server: AWS c6i.large (~$20-40/month)

**API endpoints to build**
```
GET /pool/{pool_id}/odds     → [{player, win_prob}]
GET /pool/{pool_id}/games    → [{game, leverage, impacts: {player: value}}]
```

**Data sources for win probabilities**
- Primary: Vegas moneyline / futures odds (most accurate)
- Fallback: KenPom ratings or ESPN BPI
- Convert implied odds → probabilities, remove vig, apply Bradley-Terry transform

**Scaling**
- simulation_matrix is global (not per-pool) — reused across 10k+ pools
- Per-pool compute: O(players × simulations) ≈ 0.2s for 20 players

### Phase 4: Polish + PWA (Planned)
- Service worker for offline bracket viewing
- Push notifications for high-leverage game alerts
- Performance optimization for matrix view with 50+ players
- Add-to-homescreen flow

## Notes for Development
- Start with Phase 1 — get the views working with mock data
- The matrix view is the most complex UI component — prioritize getting this right
- Use responsive design but optimize for mobile-first
- The simulation engine can start simple (uniform win probabilities) and add sophistication later
- Consider using Web Workers for client-side simulation calculations to keep the UI responsive
