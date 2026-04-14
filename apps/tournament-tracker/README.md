# Sports Closet — Tournament Tracker

A March Madness bracket pool app. Live leaderboard, pick matrix, and interactive bracket view for your group.

## Tech Stack

- **Frontend**: Vite + React + Tailwind CSS v3 + react-router-dom
- **Backend**: Supabase (Postgres + Auth + Realtime + Row-Level Security)
- **Deployment**: Vercel

---

## Local Development

### 1. Install dependencies

```bash
cd app
npm install
```

### 2. Configure environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your Supabase project values (find these in Supabase dashboard → Project Settings → API):

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

### 3. Set up the database

Run these SQL files **in order** in the Supabase SQL Editor (Dashboard → SQL Editor → New Query):

1. `supabase/schema.sql` — creates all 6 tables + RLS policies + Realtime
2. `supabase/seed.sql` — seeds 63 bracket slots (placeholder 2015 teams until Selection Sunday)

After running schema.sql, enable Realtime for the `games` and `scores` tables:
Dashboard → Database → Replication → supabase_realtime → Add tables

### 4. Run the dev server

```bash
npm run dev
```

App runs at `http://localhost:5173`.

---

## Database Schema

| Table | Purpose |
|-------|---------|
| `profiles` | Extends `auth.users`; stores `username`, `is_admin` flag |
| `pools` | A pool has a name, admin, scoring config, and 6-char invite code |
| `pool_members` | Join table linking users to pools |
| `games` | 63 bracket slots (slot_index 0-62); stores teams, winner, status |
| `brackets` | One per (user, pool); `picks` is a 63-item JSON array |
| `scores` | Computed points, PPR, and rank per bracket per pool |

### Slot index mapping

```
Midwest:  0–14   (R64: 0-7, R32: 8-11, S16: 12-13, E8: 14)
West:    15–29
South:   30–44
East:    45–59
F4:      60–61
Champ:   62
```

---

## Scoring

| Round | Points |
|-------|--------|
| R64   | 10 |
| R32   | 20 |
| S16   | 40 |
| E8    | 80 |
| F4    | 160 |
| Champ | 320 |

---

## Routes

| Path | View |
|------|------|
| `/` | Dashboard — leaderboard, race chart, leverage |
| `/matrix` | Matrix — players × games table |
| `/bracket` | Bracket — regional bracket + Final Four |
| `/submit` | Submit/edit your bracket (requires auth + pool) |
| `/login` | Sign in or create an account |
| `/join` | Join a pool with an invite code |
| `/create-pool` | Admin: create a new pool |

---

## Admin Setup

1. Sign up normally, then go to Supabase Dashboard → Table Editor → `profiles` and set `is_admin = true` for your account.
2. The admin's browser polls ESPN every 60s and upserts live game results.
3. After Selection Sunday (Mar 15 2026): update team names in `games` table and assign ESPN IDs for live tracking.

---

## Deployment (Vercel)

1. Push to GitHub
2. Import repo in Vercel, set **Root Directory** to `app/`
3. Add environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
4. Deploy

`vercel.json` (already in `app/`) handles SPA rewrites so all routes work on refresh.

---

## Phases

| Phase | Status | Description |
|-------|--------|-------------|
| 1 | Complete | Static prototype with 2015 mock data |
| 2 | Complete | Supabase auth, real picks, live game updates, ESPN polling |
| 3 | Planned | Monte Carlo win probability + leverage scores (Python/FastAPI) |
| 4 | Planned | Push notifications |
