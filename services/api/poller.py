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


# ─── Structured logging ───────────────────────────────────────────────────────

def log_event(client, pool_id, source, level, event_type, message, metadata=None):
    """Insert a structured log entry into narrative_log. Never raises."""
    try:
        row = {
            'source':     source,
            'level':      level,
            'event_type': event_type,
            'message':    message,
            'metadata':   metadata or {},
        }
        if pool_id:
            row['pool_id'] = pool_id
        client.table('narrative_log').insert(row).execute()
    except Exception:
        pass  # logging must never crash the process


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
            'abbrev1': (away or {}).get('team', {}).get('abbreviation'),
            'team2': (home or {}).get('team', {}).get('displayName'),
            'seed2': parse_seed(home),
            'abbrev2': (home or {}).get('team', {}).get('abbreviation'),
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
DEEP_DIVE_MODEL            = 'claude-sonnet-4-6'  # faster model for frequent deep dives
SIM_INTERVAL_SECS          = 3600  # hourly odds refresh (no narrative)
DEEP_DIVE_INTERVAL_SECS   = 900   # ~15 min between deep-dive commentaries during live games
ALERT_SWING_THRESHOLD      = 5.0   # leverage% × |wp_now - wp_at_start| must exceed this
ALERT_FLIP_MIN_LEVERAGE    = 10.0  # min leverage% for a favorite-flip alert
ALERT_COOLDOWN_SECS        = 600   # min 10 min between alerts for the same game slot
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


def load_champ_picks(client, pool_ids):
    """Load championship picks (slot 62) for all players across all pools.

    Returns { pool_id: { player_username: team_name } }
    """
    result = {}
    for pid in pool_ids:
        result[pid] = {}
        try:
            resp = client.table('brackets') \
                .select('profiles(username), picks') \
                .eq('pool_id', pid) \
                .execute()
            for row in (resp.data or []):
                picks = row.get('picks') or []
                username = (row.get('profiles') or {}).get('username', '')
                if username and len(picks) > 62 and picks[62]:
                    result[pid][username] = picks[62]
        except Exception as e:
            print(f'  Warning: could not load champ picks for pool {pid}: {e}')
    return result


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
    last_deep_dive_time           = epoch  # tracks last deep-dive narrative
    overnight_narrative_done_date = ''    # game-day date (YYYYMMDD) already covered
    locked_narrative_done         = set() # pool IDs that have had their lock-trigger narrative

    # ── Deep-dive delta gate state ──────────────────────────────────────────
    last_deep_dive_scores = {}     # { slot_index: (score1, score2) } at last deep_dive

    # ── Alert state ──────────────────────────────────────────────────────────
    wp_at_game_start = {}          # { slot_index: win_prob_home } when game first went live
    wp_flipped = set()             # slot_indices where favorite already flipped (fire once)
    alert_last_fired = {}          # { slot_index: datetime } cooldown tracker
    champ_danger_fired = set()     # slot_indices where champ-in-danger alert already fired
    champ_elim_fired = set()       # team names where champ-eliminated alert already fired
    champ_team_players = {}        # team → [(pool_id, username), ...] cached per session

    # ── Seed prev_final_set from DB so first cycle doesn't false-trigger ─────
    resp = client.table('games').select('espn_id, status, slot_index, win_prob_home').execute()
    prev_final_set = {
        g['espn_id'] for g in (resp.data or [])
        if g.get('status') == 'final' and g.get('espn_id')
    }
    # Seed wp_at_game_start for already-live games so first cycle doesn't false-trigger
    for g in (resp.data or []):
        if g.get('status') == 'live' and g.get('win_prob_home') is not None:
            wp_at_game_start[g['slot_index']] = g['win_prob_home']
    print(f'Seeded {len(prev_final_set)} existing final game(s), {len(wp_at_game_start)} live win probs')

    print(f'Poller started  pools={pool_ids}')
    print('Ctrl+C to stop\n')

    while True:
        ts = datetime.now(ET).strftime('%H:%M:%S ET')
        print(f'[{ts}] Polling…', end=' ', flush=True)

        live_count = updated_count = 0
        error_msg  = None

        try:
            # ── Fetch ESPN for past 2 days + today + next 3 days (ET) ─────────
            #     Use ET so late-night games aren't missed after midnight UTC.
            #     -2 days ensures games that go final late aren't missed.
            now_et_dt = datetime.now(ET)
            dates  = [(now_et_dt + timedelta(days=i)).strftime('%Y%m%d')
                      for i in range(-2, 4)]
            events = [ev for d in dates for ev in fetch_espn_games(d)]

            # ── Load current DB state (refreshed every poll for new R32+ ESPN IDs) ─
            resp     = client.table('games').select('slot_index, espn_id, status, teams, win_prob_home').execute()
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

            final_count = sum(1 for event in events
                              if (t := transform_event(event)) and t.get('status') == 'final')
            print(f'{updated_count} updated  {live_count} live  {final_count} final')

            # ── Load champion picks for alert detection (cached per session) ────
            if not champ_team_players:
                champ_picks_by_pool = load_champ_picks(client, pool_ids)
                for pid, picks in champ_picks_by_pool.items():
                    for username, team in picks.items():
                        champ_team_players.setdefault(team, []).append((pid, username))
                if champ_team_players:
                    print(f'  Loaded champ picks: {len(champ_team_players)} unique teams')

            # ── Alert detection: leverage × cumulative wp swing ──────────────
            #
            # Three trigger types (any can fire):
            #   1. Cumulative swing: leverage% × |wp_now - wp_at_start| > threshold
            #   2. Favorite flip: wp crosses 50% in a game with leverage > min (once)
            #   3. Champ in danger: champ-pick team wp drops below 0.30 (once per game)
            #
            # Leverage data comes from last sim run (sim_results.leverage_games).
            if live_count > 0:
                # Load leverage per slot from sim_results (use first pool — leverage is pool-specific)
                leverage_by_slot = {}
                try:
                    sr_resp = client.table('sim_results').select('leverage_games').eq('pool_id', pool_ids[0]).execute()
                    for lg in ((sr_resp.data or [{}])[0].get('leverage_games') or []):
                        leverage_by_slot[lg['id']] = lg.get('leverage', 0)
                except Exception:
                    pass

                # Update wp_at_game_start for newly-live games; build current wp map
                current_wps = {}
                for event in events:
                    t = transform_event(event)
                    if not t or t.get('status') != 'live':
                        continue
                    slot = espn_map.get(t.get('espn_id'))
                    if slot is None:
                        continue
                    wp = db_games.get(slot, {}).get('win_prob_home')
                    if wp is None:
                        continue
                    current_wps[slot] = wp
                    if slot not in wp_at_game_start:
                        wp_at_game_start[slot] = wp  # first sighting — record opening line

                now_utc = datetime.now(timezone.utc)
                alert_slots = []

                for slot, wp_now in current_wps.items():
                    wp_start = wp_at_game_start.get(slot)
                    if wp_start is None:
                        continue
                    lev = leverage_by_slot.get(slot, 0)
                    if lev <= 0:
                        continue

                    # Cooldown check
                    last_alert = alert_last_fired.get(slot)
                    if last_alert and (now_utc - last_alert).total_seconds() < ALERT_COOLDOWN_SECS:
                        continue

                    fired = False

                    # Trigger 1: cumulative swing
                    swing = abs(wp_now - wp_start)
                    alert_score = lev * swing
                    if alert_score >= ALERT_SWING_THRESHOLD:
                        teams = (db_games.get(slot, {}).get('teams') or {})
                        t1 = teams.get('team1', 'TBD')
                        t2 = teams.get('team2', 'TBD')
                        print(f'  ⚡ ALERT (swing): slot {slot} {t1} vs {t2} '
                              f'leverage={lev:.1f}% wp_shift={swing:.2f} score={alert_score:.1f}')
                        log_event(client, None, 'poller', 'info', 'alert_fired',
                                  f'Swing alert: {t1} vs {t2} (slot {slot})',
                                  metadata={'trigger': 'swing', 'slot': slot,
                                            'team1': t1, 'team2': t2,
                                            'leverage': lev, 'wp_shift': round(swing, 3),
                                            'alert_score': round(alert_score, 2)})
                        alert_slots.append(slot)
                        fired = True

                    # Trigger 2: favorite flip (wp crosses 50%, first time only)
                    if not fired and slot not in wp_flipped and lev >= ALERT_FLIP_MIN_LEVERAGE:
                        started_above = wp_start >= 0.5
                        now_above = wp_now >= 0.5
                        if started_above != now_above:
                            teams = (db_games.get(slot, {}).get('teams') or {})
                            t1 = teams.get('team1', 'TBD')
                            t2 = teams.get('team2', 'TBD')
                            print(f'  ⚡ ALERT (flip): slot {slot} {t1} vs {t2} '
                                  f'leverage={lev:.1f}% wp {wp_start:.2f}→{wp_now:.2f}')
                            log_event(client, None, 'poller', 'info', 'alert_fired',
                                      f'Flip alert: {t1} vs {t2} (slot {slot})',
                                      metadata={'trigger': 'flip', 'slot': slot,
                                                'team1': t1, 'team2': t2,
                                                'leverage': lev, 'wp_start': round(wp_start, 3),
                                                'wp_now': round(wp_now, 3)})
                            alert_slots.append(slot)
                            wp_flipped.add(slot)
                            fired = True

                    if fired:
                        alert_last_fired[slot] = now_utc

                    # Trigger 3: champ in danger (champ-pick team wp drops below 0.30)
                    if slot not in champ_danger_fired:
                        game = db_games.get(slot, {})
                        teams = (game.get('teams') or {})
                        t1, t2 = teams.get('team1', ''), teams.get('team2', '')
                        # Determine which team is trailing (wp_home is team1's perspective)
                        trailing_team = t2 if wp_now > 0.5 else t1
                        trailing_wp = (1.0 - wp_now) if wp_now > 0.5 else wp_now
                        if trailing_team and trailing_wp <= 0.30:
                            affected = champ_team_players.get(trailing_team, [])
                            if affected:
                                names = [u for _, u in affected]
                                champ_danger_fired.add(slot)
                                print(f'  ⚠️ CHAMP IN DANGER: {trailing_team} (wp={trailing_wp:.2f}) — {names}')
                                log_event(client, None, 'poller', 'warn', 'champ_danger',
                                          f'Champ in danger: {trailing_team} (wp={trailing_wp:.2f})',
                                          metadata={'team': trailing_team, 'wp': round(trailing_wp, 3),
                                                    'affected_players': names, 'slot': slot})
                                run_sim(sim_script, pool_ids, (
                                    '--narrative-model', NARRATIVE_MODEL,
                                    '--narrative-type', 'alert',
                                    '--just-finished',
                                    f'CHAMP IN DANGER: {trailing_team} trailing '
                                    f'(championship pick for: {", ".join(names)})',
                                ))

                if alert_slots:
                    print(f'  → Firing alert sim for {len(alert_slots)} game(s)…')
                    run_sim(sim_script, pool_ids, (
                        '--narrative-model', NARRATIVE_MODEL,
                        '--narrative-type', 'alert',
                    ))

                # Clean up: remove start-wp for games no longer live
                live_slots = set(current_wps.keys())
                for slot in list(wp_at_game_start.keys()):
                    if slot not in live_slots:
                        del wp_at_game_start[slot]
                        wp_flipped.discard(slot)

            # ── Game-completion sim: fire immediately when a game goes final ──
            current_final_set = {
                t['espn_id'] for event in events
                if (t := transform_event(event)) and t.get('status') == 'final'
            }
            newly_final = current_final_set - prev_final_set
            if newly_final:
                print(f'  ✓ newly_final detected: {newly_final}')
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

                # ── Champ-eliminated alert: fire if a losing team was anyone's champ pick
                for event in events:
                    t = transform_event(event)
                    if not t or t.get('espn_id') not in newly_final:
                        continue
                    winner = t.get('winner', '')
                    teams = t.get('teams', {})
                    loser = teams.get('team2') if winner == teams.get('team1') else teams.get('team1')
                    if not loser or loser in champ_elim_fired:
                        continue
                    affected = champ_team_players.get(loser, [])
                    if affected:
                        names = [u for _, u in affected]
                        champ_elim_fired.add(loser)
                        score = f"{t.get('score1')}-{t.get('score2')}" if t.get('score1') is not None else ''
                        print(f'  💀 CHAMP ELIMINATED: {loser} — affects {names}')
                        log_event(client, None, 'poller', 'warn', 'champ_eliminated',
                                  f'Champ eliminated: {loser} (affects {names})',
                                  metadata={'team': loser, 'score': score, 'affected_players': names})
                        run_sim(sim_script, pool_ids, (
                            '--narrative-model', NARRATIVE_MODEL,
                            '--narrative-type', 'alert',
                            '--just-finished',
                            f'CHAMP ELIMINATED: {loser} lost {score} '
                            f'(championship pick for: {", ".join(names)})',
                        ))

            # ── Sim scheduling ───────────────────────────────────────────────────
            current_done = completed_rounds(db_games)
            newly_done   = current_done - last_done_rounds
            last_done_rounds = current_done

            now_et    = datetime.now(ET)
            hour_et   = now_et.hour
            elapsed   = (datetime.now(timezone.utc) - last_hourly_sim_time).total_seconds()

            # Dynamic tournament detection: active if any game has a result or is live
            tournament_active = any(
                g.get('winner') or g.get('status') in ('live', 'final')
                for g in db_games.values()
            )

            # Pre-tournament: a scheduled game tips off within 24 hours
            tournament_ready = False
            if not tournament_active:
                now_utc = datetime.now(timezone.utc)
                for event in events:
                    t = transform_event(event)
                    if not t or not t.get('espn_id'):
                        continue
                    if espn_map.get(t['espn_id']) is None:
                        continue
                    if t['status'] != 'pending':
                        continue
                    raw_date = event.get('date') or event.get('competitions', [{}])[0].get('date')
                    if raw_date:
                        try:
                            tip = datetime.fromisoformat(raw_date.replace('Z', '+00:00'))
                            if 0 < (tip - now_utc).total_seconds() <= 86400:
                                tournament_ready = True
                                break
                        except Exception:
                            pass

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

                # ── Deep-dive narrative: every ~15 min while games are live,
                #    but ONLY if scores actually changed (delta gate) ──────
                elif live_count > 0:
                    deep_elapsed = (datetime.now(timezone.utc) - last_deep_dive_time).total_seconds()
                    if deep_elapsed >= DEEP_DIVE_INTERVAL_SECS:
                        # Delta gate: check if any live game score changed
                        current_scores = {}
                        for g in db_games.values():
                            if g.get('status') == 'live':
                                teams = g.get('teams', {})
                                current_scores[g['slot_index']] = (
                                    teams.get('score1', 0), teams.get('score2', 0))
                        score_changed = current_scores != last_deep_dive_scores
                        new_live = bool(set(current_scores.keys()) - set(last_deep_dive_scores.keys()))

                        if score_changed or new_live:
                            reason = 'new_game' if new_live else 'score_change'
                            print(f'  → Deep-dive commentary ({reason}, {live_count} live)…')
                            log_event(client, None, 'poller', 'info', 'deep_dive_trigger',
                                      f'Deep-dive commentary triggered ({reason})',
                                      metadata={'live_count': live_count, 'reason': reason})
                            run_sim(sim_script, pool_ids, (
                                '--narrative-model', DEEP_DIVE_MODEL,
                                '--narrative-type', 'deep_dive',
                            ))
                            last_deep_dive_time = datetime.now(timezone.utc)
                            last_hourly_sim_time = datetime.now(timezone.utc)
                            last_deep_dive_scores = current_scores.copy()
                        else:
                            print(f'  → Deep-dive skipped (no score change, {live_count} live)')
                            last_deep_dive_time = datetime.now(timezone.utc)  # reset timer

                # ── Overnight narrative: 3–4 AM ET, attributed to the previous
                #    calendar day so a 3 AM Friday run covers Thursday's games.
                elif OVERNIGHT_HOUR_ET <= hour_et < OVERNIGHT_CUTOFF_ET:
                    game_day = (now_et - timedelta(days=1)).strftime('%Y%m%d')
                    if game_day != overnight_narrative_done_date:
                        print(f'  → Overnight narrative run (game day {game_day})…')
                        log_event(client, None, 'poller', 'info', 'overnight_trigger',
                                  f'Overnight narrative triggered (game day {game_day})',
                                  metadata={'game_day': game_day})
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
                # ── Pre-tournament / between rounds ──────────────────────────
                # Overnight briefing: fire even before first tip-off if games are seeded
                if tournament_ready and OVERNIGHT_HOUR_ET <= hour_et < OVERNIGHT_CUTOFF_ET:
                    game_day = (now_et - timedelta(days=1)).strftime('%Y%m%d')
                    if game_day != overnight_narrative_done_date:
                        print(f'  → Pre-tournament overnight briefing (game day {game_day})…')
                        run_sim(sim_script, pool_ids,
                                ('--narrative-model', NARRATIVE_MODEL,
                                 '--narrative-type', 'overnight'))
                        overnight_narrative_done_date = game_day
                        last_hourly_sim_time = datetime.now(timezone.utc)

                # Round completion trigger
                elif newly_done:
                    rounds_str = ', '.join(sorted(newly_done, key=lambda r: ROUND_ORDER.index(r)))
                    print(f'  ✓ Round(s) complete: {rounds_str} — running simulate.py…')
                    run_sim(sim_script, pool_ids)

        except Exception as poll_err:
            error_msg = str(poll_err)
            print(f'ERROR: {poll_err}')
            log_event(client, None, 'poller', 'error', 'poll_cycle',
                      f'Poll cycle error: {poll_err}', metadata={'error': str(poll_err)})

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

        # ── Check for manual triggers from admin UI ───────────────────────────
        try:
            trigger_resp = client.table('narrative_config') \
                .select('id, config_value') \
                .eq('config_type', 'trigger') \
                .eq('active', True) \
                .execute()
            for trigger in (trigger_resp.data or []):
                nt = (trigger.get('config_value') or {}).get('narrative_type', 'deep_dive')
                model = NARRATIVE_MODEL if nt == 'overnight' else DEEP_DIVE_MODEL
                print(f'  → Manual trigger: {nt}')
                log_event(client, None, 'poller', 'info', 'trigger_manual',
                          f'Manual trigger fired: {nt}',
                          metadata={'narrative_type': nt, 'trigger_id': trigger['id']})
                run_sim(sim_script, pool_ids, ('--narrative-model', model, '--narrative-type', nt))
                client.table('narrative_config') \
                    .update({'active': False}) \
                    .eq('id', trigger['id']) \
                    .execute()
        except Exception as trig_err:
            print(f'  [trigger check] error: {trig_err}')

        # ── Check for generate_reports triggers from admin UI ─────────────────
        try:
            reports_resp = client.table('narrative_config') \
                .select('id, config_value, pool_id') \
                .eq('config_type', 'generate_reports') \
                .eq('active', True) \
                .execute()
            for trigger in (reports_resp.data or []):
                pid = trigger.get('pool_id') or (trigger.get('config_value') or {}).get('pool_id')
                if not pid:
                    continue
                bio_script = _script_dir / 'biography_writer.py'
                print(f'  → Generate reports trigger: pool {pid}')
                try:
                    subprocess.run(
                        [sys.executable, str(bio_script), '--pool-id', pid],
                        check=True,
                    )
                    print(f'  Reports complete: pool {pid}')
                except subprocess.CalledProcessError as e:
                    print(f'  Reports failed for pool {pid}: {e}')
                client.table('narrative_config') \
                    .update({'active': False}) \
                    .eq('id', trigger['id']) \
                    .execute()
        except Exception as rep_err:
            print(f'  [reports trigger] error: {rep_err}')

        # ── Prune old log entries (once per hour, piggybacked on sleep) ───────
        try:
            from datetime import timedelta as _td
            seven_days_ago = (datetime.now(timezone.utc) - _td(days=7)).isoformat()
            client.table('narrative_log').delete().lt('created_at', seven_days_ago).execute()
        except Exception:
            pass

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
