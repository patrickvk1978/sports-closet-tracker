#!/usr/bin/env python3
"""
Sports Closet Tournament Tracker — Monte Carlo Win Probability Simulator
Phase 3

Usage:
  python api/simulate.py --pool-id <UUID> [--iterations 10000] [--dry-run]

Requirements:
  pip install -r api/requirements.txt
  cp api/.env.example api/.env   # fill in SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY

Win probability model (Version 1):
  p_final = sigmoid(w_seed * logit(p_seed) + w_rating * (bpi_A - bpi_B) / SCALE)

  Weights are determined by historical sample size for the seed matchup:
    n >= 20 : w_seed=0.55, w_rating=0.45
    n  8-19 : w_seed=0.55, w_rating=0.45
    n  4-7  : w_seed=0.275, w_rating=0.725  (sparse — shrink toward rating)
    n  < 4  : w_seed=0.0,  w_rating=1.0     (unseen — rating only)
    no BPI  : seed-only or 50/50

  Version 2 (one-line upgrade): add w_market * logit(p_market) to the score.
"""

import argparse
import json
import math
import os
import random
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ET = ZoneInfo('America/New_York')

from dotenv import load_dotenv
from supabase import create_client

# ─── Load environment ──────────────────────────────────────────────────────────

_script_dir = Path(__file__).parent
load_dotenv(_script_dir / '.env')
load_dotenv(_script_dir.parent / '.env')

SUPABASE_URL              = os.environ.get('SUPABASE_URL', '')
SUPABASE_SERVICE_ROLE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')

# ─── Bracket topology ─────────────────────────────────────────────────────────
#
# BRACKET_TREE maps each slot to its two feeder slots.
# R64 leaves have feeders (None, None) — teams come directly from the games table.
#
# Slot layout:
#   Midwest: 0–14  · West: 15–29  · South: 30–44  · East: 45–59
#   F4 SF1 (Midwest/West):  60
#   F4 SF2 (South/East):    61
#   Championship:            62

def _build_bracket_tree():
    tree = {}
    for base in (0, 15, 30, 45):
        for i in range(8):
            tree[base + i] = (None, None)
        tree[base + 8]  = (base + 0,  base + 1)
        tree[base + 9]  = (base + 2,  base + 3)
        tree[base + 10] = (base + 4,  base + 5)
        tree[base + 11] = (base + 6,  base + 7)
        tree[base + 12] = (base + 8,  base + 9)
        tree[base + 13] = (base + 10, base + 11)
        tree[base + 14] = (base + 12, base + 13)
    tree[60] = (14, 29)
    tree[61] = (44, 59)
    tree[62] = (60, 61)
    return tree

BRACKET_TREE = _build_bracket_tree()

# ─── Round metadata ────────────────────────────────────────────────────────────

SLOT_ROUND = {}
for _base in (0, 15, 30, 45):
    for _i in range(8):  SLOT_ROUND[_base + _i]      = 'R64'
    for _i in range(4):  SLOT_ROUND[_base + 8 + _i]  = 'R32'
    for _i in range(2):  SLOT_ROUND[_base + 12 + _i] = 'S16'
    SLOT_ROUND[_base + 14] = 'E8'
SLOT_ROUND[60] = 'F4'
SLOT_ROUND[61] = 'F4'
SLOT_ROUND[62] = 'Champ'

ROUND_POINTS = {'R64': 10, 'R32': 20, 'S16': 40, 'E8': 80, 'F4': 160, 'Champ': 320}
LEVERAGE_THRESHOLD = 5   # min max-swing % to surface a game

# ─── Seed-round win rate table ────────────────────────────────────────────────
#
# Key: (round, lower_seed, higher_seed)  — lower number = better team
# Value: { 'rate': P(lower_seed wins), 'n': historical sample size }
#
# R64: ~40 years × 4 games/matchup = solid data
# R32: approximate — verify against BracketOdds (bracketodds.com) before tournament
# S16+: not included — BPI dominates via shrinkage when n is small
#
# Shrinkage rules (applied in compute_win_prob_blended):
#   n >= 20 → trust seed history normally (w_seed=0.55)
#   n  8-19 → normal blend
#   n  4-7  → halve seed weight (w_seed=0.275)
#   n  < 4  → ignore seed history, use BPI only

SEED_ROUND_RATES = {
    # ── Round of 64 ────────────────────────────────────────────────────────────
    ('R64',  1, 16): {'rate': 0.993, 'n': 159},
    ('R64',  2, 15): {'rate': 0.945, 'n': 159},
    ('R64',  3, 14): {'rate': 0.850, 'n': 159},
    ('R64',  4, 13): {'rate': 0.793, 'n': 159},
    ('R64',  5, 12): {'rate': 0.647, 'n': 159},
    ('R64',  6, 11): {'rate': 0.622, 'n': 159},
    ('R64',  7, 10): {'rate': 0.613, 'n': 159},
    ('R64',  8,  9): {'rate': 0.509, 'n': 159},

    # ── Round of 32 ─────────────────────────────────────────────────────────────
    # Approximate historical rates — cross-check against BracketOdds before use.
    # Only matchups that occur with meaningful frequency are listed.
    # Rare upsets (e.g. 16 vs 9 in R32) have n < 4 and fall back to BPI.
    ('R32',  1,  8): {'rate': 0.764, 'n': 118},
    ('R32',  1,  9): {'rate': 0.797, 'n': 41},
    ('R32',  2,  7): {'rate': 0.711, 'n': 112},
    ('R32',  2, 10): {'rate': 0.756, 'n': 41},
    ('R32',  3,  6): {'rate': 0.644, 'n': 108},
    ('R32',  3, 11): {'rate': 0.763, 'n': 38},
    ('R32',  4,  5): {'rate': 0.561, 'n': 96},
    ('R32',  4, 12): {'rate': 0.725, 'n': 44},
    # Upset-generated matchups — small n, weight shifts heavily to BPI
    ('R32',  1, 16): {'rate': 0.900, 'n': 1},   # 16-seed upset in R64 (rare)
    ('R32',  2, 15): {'rate': 0.870, 'n': 3},
    ('R32',  5, 13): {'rate': 0.650, 'n': 12},
    ('R32',  6, 14): {'rate': 0.760, 'n': 8},
    ('R32',  7, 15): {'rate': 0.560, 'n': 6},

    # ── Sweet 16 and beyond ────────────────────────────────────────────────────
    # Not included — BPI dominates for these rounds due to high matchup variety
    # and smaller sample sizes. Add entries here if you want seed history blended in.
}

# ─── Win probability model ────────────────────────────────────────────────────

SCALE = 10   # AdjEM / BPI scale factor (10 = a 10-pt BPI gap ≈ 1.0 log-odds unit)


def _logit(p):
    p = max(0.001, min(0.999, p))
    return math.log(p / (1 - p))


def _sigmoid(x):
    return 1.0 / (1.0 + math.exp(-x))


def compute_win_prob_blended(seed1, seed2, bpi1, bpi2, round_name, win_prob_home=None):
    """
    P(team1 wins) for a matchup.

    team1 / seed1 / bpi1 = away team in our schema
    team2 / seed2 / bpi2 = home team

    win_prob_home: ESPN live probability that home/team2 wins (float 0-1, or None)

    Version 2 upgrade: add `+ w_market * _logit(p_market)` to the score line.
    """
    # Live game with ESPN probability — use it directly
    if win_prob_home is not None:
        return max(0.02, min(0.98, 1.0 - win_prob_home))

    has_bpi = bpi1 is not None and bpi2 is not None
    bpi_diff = (bpi1 or 0.0) - (bpi2 or 0.0)

    # Look up seed-based historical rate
    p_seed = 0.5
    n_seed = 0
    if seed1 and seed2 and seed1 != seed2:
        low, high = min(seed1, seed2), max(seed1, seed2)
        data = SEED_ROUND_RATES.get((round_name, low, high))
        if data:
            n_seed = data['n']
            rate_for_low = data['rate']           # P(lower_seed / better team wins)
            p_seed = rate_for_low if seed1 < seed2 else (1.0 - rate_for_low)

    # Determine blend weights based on historical sample size (shrinkage)
    if n_seed >= 20:
        w_seed, w_rating = 0.55, 0.45
    elif n_seed >= 8:
        w_seed, w_rating = 0.55, 0.45
    elif n_seed >= 4:
        w_seed, w_rating = 0.275, 0.725   # sparse — halve seed weight
    else:
        w_seed, w_rating = 0.0, 1.0       # unseen matchup — rating only

    if not has_bpi:
        # No BPI available: fall back to seed rate, or 50/50 if no seed data either
        if n_seed >= 4:
            return max(0.02, min(0.98, p_seed))
        return 0.5

    score = w_seed * _logit(p_seed) + w_rating * (bpi_diff / SCALE)
    # ── Version 2 line (add market odds when available): ──────────────────────
    # score += w_market * _logit(p_market)
    # ─────────────────────────────────────────────────────────────────────────

    return max(0.02, min(0.98, _sigmoid(score)))


# ─── Single tournament simulation ─────────────────────────────────────────────

def simulate_tournament(games_by_slot, team_seeds, bpi_ratings, forced_outcomes=None):
    """
    Simulate one full tournament.

    Win probabilities are computed on-the-fly as teams advance, using the
    blended seed + BPI model. This means late-round matchups automatically
    use the actual teams that advanced rather than pre-assigned seeds.

    forced_outcomes: { slot_index: team_name } — forces specific game results.
    Used for conditional leverage simulations.

    Returns { slot_index: winning_team_name }.
    """
    forced = forced_outcomes or {}
    memo   = {}

    def resolve(slot):
        if slot in memo:
            return memo[slot]

        # Forced outcome (leverage conditional sims)
        if slot in forced:
            memo[slot] = forced[slot]
            return forced[slot]

        game    = games_by_slot.get(slot)
        feeders = BRACKET_TREE[slot]

        # Game already decided
        if game and game.get('status') == 'final' and game.get('winner'):
            memo[slot] = game['winner']
            return memo[slot]

        # Determine the two competing teams
        if feeders == (None, None):
            teams = (game or {}).get('teams') or {}
            team1 = teams.get('team1') or 'TBD'
            team2 = teams.get('team2') or 'TBD'
        else:
            team1 = resolve(feeders[0])
            team2 = resolve(feeders[1])

        if not team1 or not team2 or 'TBD' in (team1, team2):
            memo[slot] = None
            return None

        # Compute win probability using blended model
        prob = compute_win_prob_blended(
            seed1        = team_seeds.get(team1),
            seed2        = team_seeds.get(team2),
            bpi1         = bpi_ratings.get(team1) if bpi_ratings else None,
            bpi2         = bpi_ratings.get(team2) if bpi_ratings else None,
            round_name   = SLOT_ROUND.get(slot, 'R64'),
            win_prob_home= (game or {}).get('win_prob_home'),
        )

        winner      = team1 if random.random() < prob else team2
        memo[slot]  = winner
        return winner

    for s in range(63):
        resolve(s)
    return memo


# ─── Scoring ──────────────────────────────────────────────────────────────────

def score_additional(picks, sim_outcomes, games_by_slot):
    """Count points from future (non-final) games in one simulation outcome."""
    total = 0
    for slot, winner in sim_outcomes.items():
        if not winner:
            continue
        if (games_by_slot.get(slot) or {}).get('status') == 'final':
            continue
        pick = picks[slot] if slot < len(picks) else None
        if pick and pick == winner:
            total += ROUND_POINTS.get(SLOT_ROUND.get(slot, 'R64'), 0)
    return total


# ─── Main simulation loop ──────────────────────────────────────────────────────

def run_simulation(players, games_by_slot, team_seeds, bpi_ratings,
                   iterations=10_000, forced_outcomes=None):
    """
    Run Monte Carlo simulation.

    players: list of { username, picks (list[str|None]), current_points (int) }
    Returns: (player_probs dict, win_counts dict, all_outcomes list)
    """
    win_counts  = {p['username']: 0.0 for p in players}
    all_outcomes = []

    for _ in range(iterations):
        sim = simulate_tournament(games_by_slot, team_seeds, bpi_ratings, forced_outcomes)
        all_outcomes.append(sim)

        scores = {
            p['username']: p['current_points'] + score_additional(p['picks'], sim, games_by_slot)
            for p in players
        }
        if not scores:
            continue

        max_score = max(scores.values())
        winners   = [name for name, s in scores.items() if s == max_score]
        share     = 1.0 / len(winners)
        for name in winners:
            win_counts[name] += share

    player_probs = {name: count / iterations for name, count in win_counts.items()}
    return player_probs, win_counts, all_outcomes


# ─── Leverage calculation ──────────────────────────────────────────────────────

def calculate_leverage(players, games_by_slot, team_seeds, bpi_ratings,
                       base_probs, conditional_iters=2_000):
    """
    For each pending/live game with known teams, run conditional simulations
    (force team1 wins, force team2 wins) to measure per-player swing.

    Returns:
      leverage_games  — pool-wide list (max swing >= LEVERAGE_THRESHOLD), for the Overview tab
      player_leverage — { player_name: [top-5 games sorted by that player's personal swing] }
    """
    all_game_data = []
    n_players     = len(players)
    if n_players == 0:
        return [], {}

    pending_slots = sorted([
        slot for slot, game in games_by_slot.items()
        if (game or {}).get('status') in ('pending', 'live')
    ])

    for slot in pending_slots:
        game  = games_by_slot[slot]
        teams = (game or {}).get('teams') or {}
        team1 = teams.get('team1') or 'TBD'
        team2 = teams.get('team2') or 'TBD'

        if team1 == 'TBD' or team2 == 'TBD':
            continue

        # Conditional simulations — force each team to win slot
        result_if_t1, _, _ = run_simulation(
            players, games_by_slot, team_seeds, bpi_ratings,
            iterations=conditional_iters, forced_outcomes={slot: team1}
        )
        result_if_t2, _, _ = run_simulation(
            players, games_by_slot, team_seeds, bpi_ratings,
            iterations=conditional_iters, forced_outcomes={slot: team2}
        )

        # Per-player swings
        player_impacts = []
        max_swing = 0.0
        for p in players:
            name  = p['username']
            p1    = result_if_t1.get(name, 0.0) * 100
            p2    = result_if_t2.get(name, 0.0) * 100
            swing = abs(p1 - p2)
            max_swing = max(max_swing, swing)
            player_impacts.append({
                'player':  name,
                'ifTeam1': round(p1, 1),
                'ifTeam2': round(p2, 1),
                'swing':   round(swing, 1),
                'rootFor': team1 if p1 >= p2 else team2,
            })

        n    = n_players or 1
        pct1 = round(
            sum(1 for p in players
                if (p['picks'][slot] if slot < len(p['picks']) else None) == team1)
            / n * 100
        )

        all_game_data.append({
            'id':            slot,
            'round':         SLOT_ROUND.get(slot, 'R64'),
            'matchup':       f"{team1.split()[-1]} vs {team2.split()[-1]}",
            'team1':         team1,
            'team2':         team2,
            'status':        game.get('status', 'pending'),
            'score1':        (game.get('teams') or {}).get('score1'),
            'score2':        (game.get('teams') or {}).get('score2'),
            'gameNote':      (game.get('teams') or {}).get('gameNote'),
            'leverage':      round(max_swing),
            'pickPct1':      pct1,
            'pickPct2':      100 - pct1,
            'playerImpacts': sorted(player_impacts, key=lambda x: -x['swing']),
        })

    # Pool-wide: games where any player has a meaningful swing
    leverage_games = [g for g in all_game_data if g['leverage'] >= LEVERAGE_THRESHOLD]
    leverage_games.sort(key=lambda g: (0 if g['status'] == 'live' else 1, -g['leverage']))

    # Per-player: top 5 games ranked by each player's own personal swing
    player_leverage = {}
    for p in players:
        name = p['username']
        scored = []
        for g in all_game_data:
            impact = next((pi for pi in g['playerImpacts'] if pi['player'] == name), None)
            if impact:
                scored.append((impact['swing'], g))
        scored.sort(key=lambda x: (-x[0], 0 if x[1]['status'] == 'live' else 1))
        player_leverage[name] = [g for _, g in scored[:5]]

    return leverage_games, player_leverage


# ─── Best path derivation ──────────────────────────────────────────────────────

def derive_best_paths(players, games_by_slot, all_outcomes, player_probs):
    """
    For each player, derive the key upcoming picks they still need to win.
    Returns best_paths dict in BEST_PATH mock shape, with '_default' key.
    """
    best_paths = {
        '_default': [
            {'text': 'Your champion keeps winning', 'type': 'good'},
            {'text': 'Top seed eliminated in your region', 'type': 'neutral'},
            {'text': "Pool leader's picks go cold", 'type': 'neutral'},
        ]
    }

    KEY_SLOTS_ORDERED = [62, 60, 61, 14, 29, 44, 59]
    KEY_ROUND_NAMES   = {
        62: 'wins the Championship',
        60: 'reaches the Final Four',
        61: 'reaches the Final Four',
        14: 'wins the Midwest',
        29: 'wins the West',
        44: 'wins the South',
        59: 'wins the East',
    }

    for player in players:
        name   = player['username']
        picks  = player['picks']
        bullets = []

        for slot in KEY_SLOTS_ORDERED:
            if slot >= len(picks):
                continue
            pick = picks[slot]
            if not pick:
                continue
            game   = games_by_slot.get(slot)
            winner = (game or {}).get('winner')
            if winner and winner != pick:
                continue  # already eliminated

            if (game or {}).get('status') == 'final':
                continue  # already resolved

            btype = 'critical' if slot == 62 else 'important' if slot in (60, 61) else 'helpful'
            bullets.append({'text': f"{pick} {KEY_ROUND_NAMES[slot]}", 'type': btype})
            if len(bullets) >= 4:
                break

        if not bullets:
            prob = player_probs.get(name, 0)
            bullets = [
                {'text': 'Maintain your lead through the weekend', 'type': 'neutral'}
                if prob > 0.15
                else {'text': 'Need some upsets to go your way', 'type': 'neutral'}
            ]

        best_paths[name] = bullets

    return best_paths


# ─── Ratings loader ────────────────────────────────────────────────────────────

def load_ratings():
    """
    Load BPI ratings from api/ratings.json.
    Returns { team_name: bpi_value } or empty dict if file not found.
    Generate ratings.json by running: python api/parse_bpi.py
    """
    ratings_path = _script_dir / 'ratings.json'
    if not ratings_path.exists():
        print('NOTE: api/ratings.json not found — win prob will use seed history only.')
        print('      Run: python api/parse_bpi.py  (after pasting ESPN BPI into api/bpi_raw.txt)')
        return {}
    with open(ratings_path, encoding='utf-8') as f:
        ratings = json.load(f)
    print(f'Loaded BPI ratings for {len(ratings)} teams from ratings.json.')
    return ratings


# ─── Database helpers ──────────────────────────────────────────────────────────

def load_pool_data(client, pool_id):
    """
    Load all data needed for simulation.
    Returns (players, games_by_slot, team_seeds).
    """
    # Games
    resp         = client.table('games').select('*').execute()
    games_raw    = resp.data or []
    games_by_slot = {g['slot_index']: g for g in games_raw}

    # Build team_seeds from R64 game data (slots 0-7, 15-22, 30-37, 45-52)
    team_seeds = {}
    for slot, game in games_by_slot.items():
        if BRACKET_TREE.get(slot) == (None, None):          # R64 leaf
            t = (game or {}).get('teams') or {}
            if t.get('team1') and t.get('seed1'):
                team_seeds[t['team1']] = t['seed1']
            if t.get('team2') and t.get('seed2'):
                team_seeds[t['team2']] = t['seed2']

    # Pool members — query directly (service role bypasses RLS; avoids auth.uid() issue in RPC)
    members_resp = client.table('pool_members').select('user_id').eq('pool_id', pool_id).execute()
    user_ids     = [m['user_id'] for m in (members_resp.data or [])]
    profiles_resp = client.table('profiles').select('id, username').in_('id', user_ids).execute()
    member_map   = {p['id']: p['username'] for p in (profiles_resp.data or [])}

    # Brackets
    resp         = client.table('brackets').select('*').eq('pool_id', pool_id).execute()
    brackets_raw = resp.data or []

    # Current scores
    resp       = client.table('scores').select('bracket_id, points').execute()
    scores_map = {s['bracket_id']: s['points'] for s in (resp.data or [])}

    # Build players list
    players = []
    for bracket in brackets_raw:
        uid      = bracket['user_id']
        username = member_map.get(uid, uid)
        picks    = bracket.get('picks') or []
        picks    = (picks + [None] * 63)[:63] if isinstance(picks, list) else [None] * 63
        players.append({
            'username':       username,
            'picks':          picks,
            'current_points': scores_map.get(bracket['id'], 0),
        })

    return players, games_by_slot, team_seeds


def load_prev_sim_data(client, pool_id):
    """Load previous player_probs and narratives from sim_results for delta tracking
    and narrative preservation across hourly (no-narrative) runs."""
    try:
        resp = (client.table('sim_results')
                .select('player_probs, narratives')
                .eq('pool_id', pool_id)
                .execute())
        if resp.data:
            row = resp.data[0]
            return row.get('player_probs') or {}, row.get('narratives') or {}
    except Exception:
        pass
    return {}, {}


TOURNAMENT_START_ET = date(2026, 3, 19)  # Day 1 = Selection Sunday / dashboard launch


def build_tournament_context(games_by_slot):
    """
    Summarise the current tournament state for the Claude prompt.
    Returns a dict with day number, yesterday's results, today's upcoming games,
    notable upsets, and current round.
    """
    ROUND_DISPLAY = {
        'R64': 'Round of 64', 'R32': 'Round of 32', 'S16': 'Sweet 16',
        'E8': 'Elite Eight', 'F4': 'Final Four', 'Champ': 'Championship',
    }

    now_et     = datetime.now(ET)
    today_et   = now_et.date()
    yesterday_et = today_et - timedelta(days=1)
    day_number = (today_et - TOURNAMENT_START_ET).days + 1

    # Determine current round (deepest round with any non-pending game)
    current_round = 'R64'
    for rnd in ['Champ', 'F4', 'E8', 'S16', 'R32', 'R64']:
        slots = [s for s, r in SLOT_ROUND.items() if r == rnd]
        if any(games_by_slot.get(s, {}).get('status') in ('live', 'final') for s in slots):
            current_round = rnd
            break

    # Collect completed games — split into yesterday vs older; flag upsets
    yesterday_finals = []
    all_finals       = []
    for slot in sorted(games_by_slot.keys()):
        g = games_by_slot[slot]
        if g.get('status') != 'final' or not g.get('winner'):
            continue
        teams  = g.get('teams') or {}
        t1, t2 = teams.get('team1', ''), teams.get('team2', '')
        s1, s2 = teams.get('score1'), teams.get('score2')
        winner = g['winner']
        loser  = t2 if winner == t1 else t1
        score  = f"{max(s1, s2)}-{min(s1, s2)}" if s1 is not None and s2 is not None else ''
        seed1, seed2 = teams.get('seed1'), teams.get('seed2')
        seed_diff = abs((seed1 or 0) - (seed2 or 0)) if seed1 and seed2 else 0
        entry = {
            'result':    f"{winner} def. {loser}{(' ' + score) if score else ''}",
            'round':     SLOT_ROUND.get(slot, ''),
            'upset':     seed_diff >= 5,
            'seed_diff': seed_diff,
        }
        all_finals.append(entry)

        # Attribute to yesterday if updated_at falls on yesterday ET
        updated_raw = g.get('updated_at', '')
        if updated_raw:
            try:
                updated_et = datetime.fromisoformat(
                    updated_raw.replace('Z', '+00:00')
                ).astimezone(ET).date()
                if updated_et == yesterday_et:
                    yesterday_finals.append(entry)
            except Exception:
                pass

    upsets = sorted([f for f in all_finals if f['upset']], key=lambda x: -x['seed_diff'])[:4]

    # Today's upcoming games: gameTime with no day prefix = today
    # (poller omits the day name when game_date == today ET)
    today_upcoming = []
    for slot in sorted(games_by_slot.keys()):
        g = games_by_slot[slot]
        if g.get('status') != 'pending':
            continue
        teams     = g.get('teams') or {}
        t1, t2    = teams.get('team1', 'TBD'), teams.get('team2', 'TBD')
        game_time = teams.get('gameTime', '')
        if t1 == 'TBD' or t2 == 'TBD':
            continue
        # gameTime without a leading day abbreviation (Mon/Tue/…) = today
        is_today = not any(game_time.startswith(d) for d in
                           ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'))
        if is_today:
            today_upcoming.append(f"{t1} vs {t2}" + (f" ({game_time})" if game_time else ''))

    return {
        'day_number':       day_number,
        'current_round':    ROUND_DISPLAY.get(current_round, current_round),
        'n_final':          len(all_finals),
        'n_today_upcoming': len(today_upcoming),
        'upsets':           upsets,
        'yesterday_finals': yesterday_finals[-12:],
        'today_upcoming':   today_upcoming[:8],
        'is_day_one':       day_number == 1,
    }


def generate_narratives(player_probs, prev_probs, best_paths, players,
                        games_by_slot, model='claude-haiku-4-5-20251001'):
    """
    Generate per-player narratives (second person, 40 words) and a pool-wide
    day-opener summary (second person plural, 75 words), keyed as "_pool".
    model: override to claude-opus-4-6 for end-of-day quality runs.
    Gracefully returns {} if anthropic is not installed or API key is missing.
    """
    api_key = os.environ.get('ANTHROPIC_API_KEY', '')
    if not api_key:
        print('  Skipping narratives (no ANTHROPIC_API_KEY)')
        return {}

    try:
        import anthropic
    except ImportError:
        print('  Skipping narratives (anthropic package not installed)')
        return {}

    pool_size  = len(players)
    points_map = {p['username']: p['current_points'] for p in players}
    rank_map   = {
        p['username']: i + 1
        for i, p in enumerate(sorted(players, key=lambda x: -x['current_points']))
    }

    # Tournament context
    ctx = build_tournament_context(games_by_slot)

    upset_lines     = '\n'.join(f"  - {u['result']} ({u['round']})" for u in ctx['upsets']) \
                      or '  None yet'
    yesterday_lines = '\n'.join(f"  - {r['result']}" for r in ctx['yesterday_finals']) \
                      or ('  No games yet (Day 1)' if ctx['is_day_one'] else '  No results')
    today_lines     = '\n'.join(f"  - {g}" for g in ctx['today_upcoming']) \
                      or '  No games scheduled today'

    # Per-player context block
    player_lines = []
    for name, prob in sorted(player_probs.items(), key=lambda x: -x[1]):
        pct      = round(prob * 100, 1)
        prev_pct = round(prev_probs.get(name, 0) * 100, 1)
        delta    = round(pct - prev_pct, 1)
        delta_str = f"+{delta}" if delta > 0 else str(delta)
        rank     = rank_map.get(name, '?')
        points   = points_map.get(name, 0)

        path_bullets = best_paths.get(name, best_paths.get('_default', []))
        path_text    = '; '.join(b['text'] for b in path_bullets[:2]) if path_bullets else 'N/A'

        player_lines.append(
            f"- {name}: rank {rank}/{pool_size}, {points} pts, "
            f"{pct}% win prob (delta {delta_str}%), needs: {path_text}"
        )

    player_block = '\n'.join(player_lines)

    prompt = f"""You are writing content for a March Madness bracket pool dashboard.

Tournament context:
- Today: Day {ctx['day_number']} of the tournament | Current round: {ctx['current_round']}
- Games completed total: {ctx['n_final']} | Today's games remaining: {ctx['n_today_upcoming']}
- Notable upsets so far:
{upset_lines}
- Yesterday's results:
{yesterday_lines}
- Today's upcoming games:
{today_lines}

Pool ({pool_size} players):
{player_block}

Tasks:

1. For each player write ONE update in second person (max 40 words), addressed directly \
to that player ("you're sitting in 3rd...", "your Duke pick..."). \
Be specific about their teams and situation. Informal tone, like a knowledgeable friend.

2. Write one pool-wide day-opener (key: "_pool", max 75 words). \
MUST start with "Welcome to Day {ctx['day_number']}" or a natural variation. \
Use second person plural. Briefly reflect on anything notable from yesterday \
(skip if Day 1), then highlight the most interesting games ahead today. \
Engaging and specific — like a morning show host kicking off the day.

Return valid JSON only: {{"playerName": "sentence", ..., "_pool": "pool summary"}}
No markdown, no explanation — just the JSON object."""

    try:
        client = anthropic.Anthropic(api_key=api_key)
        resp = client.messages.create(
            model=model,
            max_tokens=2048,
            messages=[{'role': 'user', 'content': prompt}],
        )
        raw = resp.content[0].text.strip()
        # Strip markdown code fences if model ignores the instruction
        if raw.startswith('```'):
            raw = raw.split('\n', 1)[-1].rsplit('```', 1)[0].strip()
        narratives = json.loads(raw)
        n_players  = len(narratives) - (1 if '_pool' in narratives else 0)
        pool_ok    = '✓' if '_pool' in narratives else '✗'
        print(f'  Generated narratives for {n_players} player(s), pool summary {pool_ok}')
        return narratives
    except Exception as e:
        print(f'  Narrative generation failed: {e}')
        return {}


def upsert_sim_results(client, pool_id, player_probs, leverage_games,
                       player_leverage, best_paths, prev_player_probs,
                       narratives, iterations, dry_run):
    payload = {
        'pool_id':             pool_id,
        'iterations':          iterations,
        'player_probs':        player_probs,
        'leverage_games':      leverage_games,
        'player_leverage':     player_leverage,
        'best_paths':          best_paths,
        'prev_player_probs':   prev_player_probs,
        'narratives':          narratives,
    }
    if dry_run:
        print('\n[DRY RUN] Would upsert to sim_results:')
        print(json.dumps(payload, indent=2, default=str))
        return
    client.table('sim_results').upsert(payload, on_conflict='pool_id').execute()
    print('Sim results written to Supabase.')


# ─── Entry point ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Run Monte Carlo win probability simulation.')
    parser.add_argument('--pool-id',    required=True)
    parser.add_argument('--iterations', type=int, default=10_000)
    parser.add_argument('--cond-iters', type=int, default=2_000)
    parser.add_argument('--dry-run',        action='store_true')
    parser.add_argument('--no-narratives',  action='store_true',
                        help='Skip narrative generation; preserve existing narratives in DB')
    parser.add_argument('--narrative-model', default='claude-haiku-4-5-20251001',
                        help='Claude model for narrative generation (e.g. claude-opus-4-6)')
    args = parser.parse_args()

    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        print('ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in api/.env', file=sys.stderr)
        sys.exit(1)

    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    bpi_ratings = load_ratings()

    print(f'Loading pool data for pool {args.pool_id}…')
    players, games_by_slot, team_seeds = load_pool_data(client, args.pool_id)

    if not players:
        print('ERROR: No brackets found for this pool.', file=sys.stderr)
        sys.exit(1)

    n_final = sum(1 for g in games_by_slot.values() if g.get('status') == 'final')
    n_live  = sum(1 for g in games_by_slot.values() if g.get('status') == 'live')
    n_pend  = sum(1 for g in games_by_slot.values() if g.get('status') == 'pending')
    n_rated = sum(1 for p in players
                  if any(bpi_ratings.get(t) is not None
                         for t in (p['picks'] or []) if t))
    print(f'  {len(players)} brackets · '
          f'{n_final} final / {n_live} live / {n_pend} pending · '
          f'{len(team_seeds)} seeds known · '
          f'{len(bpi_ratings)} BPI ratings loaded')

    # Warn about tournament teams missing BPI ratings
    all_teams = {t for g in games_by_slot.values()
                 for t in [(g.get('teams') or {}).get('team1'),
                            (g.get('teams') or {}).get('team2')] if t}
    missing = [t for t in sorted(all_teams) if t not in bpi_ratings]
    if missing:
        print(f'\n  NOTE: {len(missing)} tournament team(s) have no BPI rating '
              f'(will use seed-only model):')
        for t in missing:
            print(f'    - {t}')

    # Load previous sim data for delta tracking and narrative preservation
    prev_probs, existing_narratives = load_prev_sim_data(client, args.pool_id)
    if prev_probs:
        print(f'  Loaded previous win probs for {len(prev_probs)} player(s)')
    else:
        print('  No previous sim results (first run — deltas will be suppressed)')

    print(f'\nRunning {args.iterations:,} simulations…')
    player_probs, _, all_outcomes = run_simulation(
        players, games_by_slot, team_seeds, bpi_ratings, iterations=args.iterations
    )

    print('\nWin probabilities:')
    for name, prob in sorted(player_probs.items(), key=lambda x: -x[1]):
        bar = '█' * max(1, int(prob * 40))
        prev_pct = prev_probs.get(name, 0) * 100
        delta = prob * 100 - prev_pct
        delta_str = f' ({("+" if delta > 0 else "")}{delta:.1f})' if prev_probs else ''
        print(f'  {name:<20} {prob * 100:5.1f}%{delta_str}  {bar}')

    print(f'\nCalculating leverage ({args.cond_iters:,} conditional iters per game)…')
    leverage_games, player_leverage = calculate_leverage(
        players, games_by_slot, team_seeds, bpi_ratings,
        player_probs, conditional_iters=args.cond_iters
    )
    print(f'  {len(leverage_games)} game(s) above {LEVERAGE_THRESHOLD}% pool-wide threshold')
    print(f'  Per-player top games computed for {len(player_leverage)} player(s)')

    best_paths = derive_best_paths(players, games_by_slot, all_outcomes, player_probs)

    if args.no_narratives:
        print('\nSkipping narrative generation (--no-narratives); preserving existing.')
        narratives = existing_narratives
    else:
        print(f'\nGenerating AI narratives (model: {args.narrative_model})…')
        narratives = generate_narratives(
            player_probs, prev_probs, best_paths, players, games_by_slot,
            model=args.narrative_model
        )

    upsert_sim_results(
        client, args.pool_id, player_probs, leverage_games, player_leverage,
        best_paths, prev_player_probs=prev_probs, narratives=narratives,
        iterations=args.iterations, dry_run=args.dry_run
    )
    print('\nDone.')


if __name__ == '__main__':
    main()
