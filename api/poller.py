#!/usr/bin/env python3
"""
Sports Closet Tournament Tracker — VPS Background Poller
Phase 5

Polls ESPN every 60s (30s when live games detected), upserts results to
the Supabase games table, and triggers simulate.py with narratives.

Narrative model — two triggers only:
  • Overnight (3 AM ET): 60-word day-ahead summaries (morning newsletter)
  • Every game end: 40-word quick reactions with just-finished context
  • Hourly sim still runs for odds refresh, but no narrative

Usage:
  python api/poller.py --pool-id <UUID>

Needs the same api/.env as simulate.py:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
"""

import argparse
import os
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
from dotenv import load_dotenv
from supabase import create_client

# ─── Environment ──────────────────────────────────────────────────────────────

_script_dir = Path(__file__).parent
load_dotenv(_script_dir / '.env')
load_dotenv(_script_dir.parent / '.env')

SUPABASE_URL              = os.environ.get('SUPABASE_URL', '')
SUPABASE_SERVICE_ROLE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')

ET = ZoneInfo('America/New_York')

# ─── ESPN API ─────────────────────────────────────────────────────────────────

ESPN_SCOREBOARD = (
    'https://site.api.espn.com/apis/site/v2/sports/basketball/'
    'mens-college-basketball/scoreboard?groups=100&limit=50&dates={date}'
)
ESPN_CORE_PROBS = (
    'https://sports.core.api.espn.com/v2/sports/basketball/'
    'leagues/mens-college-basketball/events/{id}/competitions/{id}/probabilities'
)


def fetch_espn_games(date_str):
    """Fetch ESPN scoreboard for a YYYYMMDD date string. Returns [] on error."""
    try:
        r = requests.get(ESPN_SCOREBOARD.format(date=date_str), timeout=10)
        r.raise_for_status()
        return r.json().get('events', [])
    except Exception as e:
        print(f'  [ESPN] fetch error {date_str}: {e}')
        return []


def fetch_win_prob(espn_id):
    """Fetch live win probability (0–1) for home team, or None."""
    try:
        r = requests.get(ESPN_CORE_PROBS.format(id=espn_id), timeout=10)
        if not r.ok:
            return None
        items = r.json().get('items', [])
        if not items:
            return None
        ref = items[-1].get('$ref')
        if not ref:
            return None
        r2 = requests.get(ref, timeout=10)
        if not r2.ok:
            return None
        pct = r2.json().get('homeTeamOdds', {}).get('winPercentage')
        return pct / 100 if pct is not None else None
    except Exception:
        return None


def format_game_time(iso_date):
    """Format an ISO UTC datetime to 'Thu 12:15 PM ET' (omits day if today ET)."""
    if not iso_date:
        return None
    try:
        dt    = datetime.fromisoformat(iso_date.replace('Z', '+00:00')).astimezone(ET)
        today = datetime.now(ET).date()
        t     = dt.strftime('%-I:%M %p ET')
        return t if dt.date() == today else dt.strftime('%a ') + t
    except Exception:
        return None


def transform_event(event):
    """Transform a raw ESPN event dict into the shape we upsert to games."""
    comp = (event.get('competitions') or [{}])[0]
    if not comp:
        return None

    competitors = comp.get('competitors', [])
    away = next((c for c in competitors if c.get('homeAway') == 'away'), None)
    home = next((c for c in competitors if c.get('homeAway') == 'home'), None)

    state     = comp.get('status', {}).get('type', {}).get('state', '')
    completed = comp.get('status', {}).get('type', {}).get('completed', False)

    if completed or state == 'post':
        status = 'final'
    elif state == 'in':
        status = 'live'
    else:
        status = 'pending'

    winner = None
    if status == 'final' and away and home:
        a_score = int(away.get('score') or 0)
        h_score = int(home.get('score') or 0)
        winner  = (away if a_score > h_score else home).get('team', {}).get('displayName')

    def parse_score(c):
        s = (c or {}).get('score')
        return int(s) if s not in (None, '') else None

    def parse_seed(c):
        s = (c or {}).get('curatedRank', {}).get('current') or (c or {}).get('seed')
        try:
            return int(s) or None
        except (TypeError, ValueError):
            return None

    game_note = None
    if status == 'final':
        game_note = 'Final'
    elif status == 'live':
        short = event.get('status', {}).get('type', {}).get('shortDetail', '')
        clock = comp.get('status', {}).get('displayClock', '')
        period = comp.get('status', {}).get('period')
        if short:
            game_note = short
        elif period and clock:
            game_note = f"{'1st' if period == 1 else '2nd'} Half {clock}"

    return {
        'espn_id':   event.get('id'),
        'status':    status,
        'winner':    winner,
        'score1':    parse_score(away),
        'score2':    parse_score(home),
        'game_note': game_note,
        'game_time': format_game_time(event.get('date')) if status == 'pending' else None,
        'teams': {
            'team1': (away or {}).get('team', {}).get('displayName'),
            'seed1': parse_seed(away),
            'team2': (home or {}).get('team', {}).get('displayName'),
            'seed2': parse_seed(home),
        },
    }


# ─── Slot metadata ─────────────────────────────────────────────────────────────

ROUND_SLOTS = {
    'R64':  [s for b in (0, 15, 30, 45) for s in range(b,      b + 8)],
    'R32':  [s for b in (0, 15, 30, 45) for s in range(b + 8,  b + 12)],
    'S16':  [s for b in (0, 15, 30, 45) for s in range(b + 12, b + 14)],
    'E8':   [b + 14 for b in (0, 15, 30, 45)],
    'F4':   [60, 61],
    'Champ': [62],
}
ROUND_ORDER = ['R64', 'R32', 'S16', 'E8', 'F4', 'Champ']

# ─── Sim schedule ────────────────────────────────────────────────────────────
#
# Narratives fire on two triggers only:
#   1. Every game end → 40-word quick reactions (--narrative-type game_end)
#   2. Overnight 3 AM ET → 60-word day-ahead summaries (--narrative-type overnight)
# Hourly sim runs for odds refresh only (no narrative).

NARRATIVE_MODEL            = 'claude-opus-4-6'
HOURLY_NARRATIVE_MODEL     = 'claude-opus-4-6'
SIM_INTERVAL_SECS          = 3600  # hourly odds refresh (no narrative)
GAME_WINDOW_START_ET       = 12    # noon ET
GAME_WINDOW_END_ET         = 24    # midnight ET
OVERNIGHT_HOUR_ET          = 3     # 3 AM ET — overnight narrative trigger
OVERNIGHT_CUTOFF_ET        = 4     # stop trying after 4 AM


def slot_meta(slot):
    """Return (round_key, region_key) for a slot index."""
    for key, base in (('midwest', 0), ('west', 15), ('south', 30), ('east', 45)):
        if base <= slot < base + 15:
            off = slot - base
            rnd = 'R64' if off < 8 else 'R32' if off < 12 else 'S16' if off < 14 else 'E8'
            return rnd, key
    if slot in (60, 61): return 'F4',   None
    if slot == 62:        return 'Champ', None
    return 'R64', None


def completed_rounds(db_games):
    """Return set of round keys where all slots with known teams are final."""
    done = set()
    for rnd, slots in ROUND_SLOTS.items():
        known = [
            db_games[s] for s in slots
            if s in db_games and (db_games[s].get('teams') or {}).get('team1')
        ]
        if known and all(g.get('status') == 'final' for g in known):
            done.add(rnd)
    return done


# ─── Poll loop ─────────────────────────────────────────────────────────────────

def run_sim(sim_script, pool_ids, extra_args=()):
    """Run simulate.py for every pool with optional extra args."""
    for pid in pool_ids:
        try:
            subprocess.run(
                [sys.executable, str(sim_script), '--pool-id', pid, *extra_args],
                check=True,
            )
            print(f'  Simulation complete: pool {pid}')
        except subprocess.CalledProcessError as e:
            print(f'  Simulation failed for pool {pid}: {e}')


def run_poller(pool_ids, client):
    sim_script       = _script_dir / 'simulate.py'
    last_done_rounds = set()

    # ── Sim scheduling state ──────────────────────────────────────────────────
    epoch = datetime.fromtimestamp(0, tz=timezone.utc)
    last_hourly_sim_time          = epoch  # tracks last hourly sim run
    overnight_narrative_done_date = ''    # game-day date (YYYYMMDD) already covered
    locked_narrative_done         = set() # pool IDs that have had their lock-trigger narrative

    # ── Seed prev_final_set from DB so first cycle doesn't false-trigger ─────
    resp = client.table('games').select('espn_id, status').execute()
    prev_final_set = {
        g['espn_id'] for g in (resp.data or [])
        if g.get('status') == 'final' and g.get('espn_id')
    }
    print(f'Seeded {len(prev_final_set)} existing final game(s)')

    print(f'Poller started  pools={pool_ids}')
    print('Ctrl+C to stop\n')

    while True:
        ts = datetime.now(ET).strftime('%H:%M:%S ET')
        print(f'[{ts}] Polling…', end=' ', flush=True)

        live_count = updated_count = 0
        error_msg  = None

        try:
            # ── Fetch ESPN for today + next 4 days ──────────────────────────────
            dates  = [(datetime.now(timezone.utc) + timedelta(days=i)).strftime('%Y%m%d')
                      for i in range(5)]
            events = [ev for d in dates for ev in fetch_espn_games(d)]

            # ── Load current DB state (refreshed every poll for new R32+ ESPN IDs) ─
            resp     = client.table('games').select('slot_index, espn_id, status, teams').execute()
            db_games = {g['slot_index']: g for g in (resp.data or [])}
            espn_map = {g['espn_id']: g['slot_index']
                        for g in (resp.data or []) if g.get('espn_id')}

            # ── Upsert each matched event ────────────────────────────────────────
            for event in events:
                t = transform_event(event)
                if not t or not t.get('espn_id'):
                    continue
                slot = espn_map.get(t['espn_id'])
                if slot is None:
                    continue

                rnd, region = slot_meta(slot)

                payload = {
                    'espn_id':    t['espn_id'],
                    'slot_index': slot,
                    'round':      rnd,
                    'region':     region,
                    'teams': {
                        **t['teams'],
                        'score1':   t['score1'],
                        'score2':   t['score2'],
                        'gameNote': t['game_note'],
                        'gameTime': t['game_time'],
                    },
                    'winner':     t['winner'],
                    'status':     t['status'],
                    'updated_at': datetime.now(timezone.utc).isoformat(),
                }

                if t['status'] == 'live':
                    live_count += 1
                    wp = fetch_win_prob(t['espn_id'])
                    if wp is not None:
                        payload['win_prob_home'] = wp
                elif t['status'] == 'final':
                    payload['win_prob_home'] = None

                result = client.table('games').upsert(payload, on_conflict='slot_index').execute()
                if result.data:
                    updated_count += 1

            print(f'{updated_count} updated  {live_count} live')

            # ── Game-completion sim: fire immediately when a game goes final ──
            current_final_set = {
                t['espn_id'] for event in events
                if (t := transform_event(event)) and t.get('status') == 'final'
            }
            newly_final = current_final_set - prev_final_set
            prev_final_set = current_final_set

            if newly_final:
                # Build just-finished matchup descriptions for narrative context
                finished_matchups = []
                for event in events:
                    t = transform_event(event)
                    if t and t.get('espn_id') in newly_final:
                        teams = t.get('teams', {})
                        winner = t.get('winner', '')
                        loser = teams.get('team2') if winner == teams.get('team1') else teams.get('team1')
                        score = f"{t.get('score1')}-{t.get('score2')}" if t.get('score1') is not None else ''
                        finished_matchups.append(f"{winner} def. {loser or 'TBD'} {score}".strip())

                just_finished = '; '.join(finished_matchups)
                now_utc = datetime.now(timezone.utc)
                print(f'  → {len(newly_final)} game(s) just went final — running sim + narrative…')
                run_sim(sim_script, pool_ids, (
                    '--narrative-model', HOURLY_NARRATIVE_MODEL,
                    '--narrative-type', 'game_end',
                    '--just-finished', just_finished,
                ))
                last_hourly_sim_time = now_utc

            # ── Sim scheduling ───────────────────────────────────────────────────
            current_done = completed_rounds(db_games)
            newly_done   = current_done - last_done_rounds
            last_done_rounds = current_done

            now_et    = datetime.now(ET)
            hour_et   = now_et.hour
            elapsed   = (datetime.now(timezone.utc) - last_hourly_sim_time).total_seconds()

            # Dynamic tournament detection: active if any game is live or final
            tournament_active = any(
                g.get('status') in ('live', 'final')
                for g in db_games.values()
            )

            if tournament_active:
                # ── Bracket lock: one-off narrative per pool when admin locks brackets
                pools_resp   = client.table('pools').select('id, locked').execute()
                newly_locked = [
                    p['id'] for p in (pools_resp.data or [])
                    if p.get('locked') and p['id'] not in locked_narrative_done
                ]
                if newly_locked:
                    print(f'  → Bracket lock detected — running narrative sim…')
                    run_sim(sim_script, newly_locked,
                            ('--narrative-model', NARRATIVE_MODEL,
                             '--narrative-type', 'game_end'))
                    locked_narrative_done.update(newly_locked)
                    last_hourly_sim_time = datetime.now(timezone.utc)

                # ── Overnight narrative: 3–4 AM ET, attributed to the previous
                #    calendar day so a 3 AM Friday run covers Thursday's games.
                elif OVERNIGHT_HOUR_ET <= hour_et < OVERNIGHT_CUTOFF_ET:
                    game_day = (now_et - timedelta(days=1)).strftime('%Y%m%d')
                    if game_day != overnight_narrative_done_date:
                        print(f'  → Overnight narrative run (game day {game_day})…')
                        run_sim(sim_script, pool_ids,
                                ('--narrative-model', NARRATIVE_MODEL,
                                 '--narrative-type', 'overnight'))
                        overnight_narrative_done_date = game_day
                        last_hourly_sim_time = datetime.now(timezone.utc)

                # ── Hourly sim: odds refresh only, no narrative ──────────────
                elif elapsed >= SIM_INTERVAL_SECS:
                    print(f'  → Hourly sim (no narrative)…')
                    run_sim(sim_script, pool_ids, ('--no-narratives',))
                    last_hourly_sim_time = datetime.now(timezone.utc)

            else:
                # ── Pre-tournament: trigger on round completion only
                if newly_done:
                    rounds_str = ', '.join(sorted(newly_done, key=lambda r: ROUND_ORDER.index(r)))
                    print(f'  ✓ Round(s) complete: {rounds_str} — running simulate.py…')
                    run_sim(sim_script, pool_ids)

        except Exception as poll_err:
            error_msg = str(poll_err)
            print(f'ERROR: {poll_err}')

        # ── Write heartbeat ───────────────────────────────────────────────────
        try:
            client.table('poller_heartbeat').upsert({
                'id':            1,
                'polled_at':     datetime.now(timezone.utc).isoformat(),
                'pools_found':   len(pool_ids),
                'games_updated': updated_count,
                'live_count':    live_count,
                'error':         error_msg,
            }).execute()
        except Exception as hb_err:
            print(f'  [heartbeat] write failed: {hb_err}')

        # ── Sleep ────────────────────────────────────────────────────────────
        time.sleep(30 if live_count > 0 else 60)


# ─── Entry point ──────────────────────────────────────────────────────────────

def main():
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        print('ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in api/.env',
              file=sys.stderr)
        sys.exit(1)

    client   = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    resp     = client.table('pools').select('id, name').execute()
    pools    = resp.data or []

    if not pools:
        print('ERROR: No pools found in database.', file=sys.stderr)
        sys.exit(1)

    pool_ids = [p['id'] for p in pools]
    print(f'Found {len(pools)} pool(s):')
    for p in pools:
        print(f'  {p["name"]}  ({p["id"]})')

    try:
        run_poller(pool_ids, client)
    except KeyboardInterrupt:
        print('\nPoller stopped.')


if __name__ == '__main__':
    main()
