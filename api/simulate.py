#!/usr/bin/env python3
"""
Sports Closet Tournament Tracker — Monte Carlo Win Probability Simulator
Phase 3

Usage:
  python api/simulate.py --pool-id <UUID> [--iterations 20000] [--dry-run]

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

def score_additional(picks, sim_outcomes, games_by_slot, round_points=None):
    """Count points from future (non-final) games in one simulation outcome."""
    rp = round_points or ROUND_POINTS
    total = 0
    for slot, winner in sim_outcomes.items():
        if not winner:
            continue
        if (games_by_slot.get(slot) or {}).get('status') == 'final':
            continue
        pick = picks[slot] if slot < len(picks) else None
        if pick and pick == winner:
            total += rp.get(SLOT_ROUND.get(slot, 'R64'), 0)
    return total


# ─── Main simulation loop ──────────────────────────────────────────────────────

def run_simulation(players, games_by_slot, team_seeds, bpi_ratings,
                   iterations=20_000, round_points=None):
    """
    Run Monte Carlo simulation.

    players: list of { username, picks (list[str|None]), current_points (int) }
    Returns: (player_probs dict, win_counts dict, all_outcomes list, sim_winners list)

    sim_winners[i] = list of pool-winning player names for iteration i
    all_outcomes[i] = { slot: winning_team } for iteration i
    """
    win_counts  = {p['username']: 0.0 for p in players}
    all_outcomes = []
    sim_winners  = []  # per-iteration pool winner(s) for leverage bucketing

    for _ in range(iterations):
        sim = simulate_tournament(games_by_slot, team_seeds, bpi_ratings)
        all_outcomes.append(sim)

        scores = {
            p['username']: p['current_points'] + score_additional(p['picks'], sim, games_by_slot, round_points)
            for p in players
        }
        if not scores:
            sim_winners.append([])
            continue

        max_score = max(scores.values())
        winners   = [name for name, s in scores.items() if s == max_score]
        share     = 1.0 / len(winners)
        for name in winners:
            win_counts[name] += share
        sim_winners.append(winners)

    player_probs = {name: count / iterations for name, count in win_counts.items()}
    return player_probs, win_counts, all_outcomes, sim_winners


# ─── Leverage calculation ──────────────────────────────────────────────────────

def calculate_leverage(players, games_by_slot, all_outcomes, sim_winners):
    """
    For each pending/live game with known teams, split the base simulation
    outcomes into two buckets (team1 won vs team2 won) and compute each
    player's conditional win probability from the same simulation run.

    This is zero-sum by construction: all player deltas for a given game
    outcome sum to zero against the base probabilities.

    Returns:
      leverage_games  — all games with computed impacts, sorted by leverage
      player_leverage — { player_name: [top-5 games sorted by personal swing] }
    """
    all_game_data = []
    n_players     = len(players)
    n_sims        = len(all_outcomes)
    if n_players == 0 or n_sims == 0:
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

        # Split simulations into two buckets based on who won this slot
        wins_if_t1 = {p['username']: 0.0 for p in players}
        wins_if_t2 = {p['username']: 0.0 for p in players}
        count_t1 = 0
        count_t2 = 0

        for i, sim in enumerate(all_outcomes):
            winner_of_slot = sim.get(slot)
            if winner_of_slot == team1:
                count_t1 += 1
                share = 1.0 / len(sim_winners[i]) if sim_winners[i] else 0
                for name in sim_winners[i]:
                    wins_if_t1[name] += share
            elif winner_of_slot == team2:
                count_t2 += 1
                share = 1.0 / len(sim_winners[i]) if sim_winners[i] else 0
                for name in sim_winners[i]:
                    wins_if_t2[name] += share

        # Skip games where one bucket has too few simulations (< 50)
        if count_t1 < 50 or count_t2 < 50:
            continue

        # Per-player conditional probabilities
        player_impacts = []
        max_swing = 0.0
        for p in players:
            name = p['username']
            p1   = (wins_if_t1[name] / count_t1) * 100
            p2   = (wins_if_t2[name] / count_t2) * 100
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
            'matchup':       f"{team1} vs {team2}",
            'team1':         team1,
            'team2':         team2,
            'status':        game.get('status', 'pending'),
            'score1':        (game.get('teams') or {}).get('score1'),
            'score2':        (game.get('teams') or {}).get('score2'),
            'gameNote':      (game.get('teams') or {}).get('gameNote'),
            'leverage':      round(max_swing, 1),
            'pickPct1':      pct1,
            'pickPct2':      100 - pct1,
            'playerImpacts': sorted(player_impacts, key=lambda x: -x['swing']),
        })

    # Pool-wide: all games with computed impacts (sorted by leverage)
    leverage_games = sorted(all_game_data, key=lambda g: (0 if g['status'] == 'live' else 1, -g['leverage']))

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
    Returns (players, games_by_slot, team_seeds, round_points).
    """
    # Pool scoring config
    pool_resp = client.table('pools').select('scoring_config').eq('id', pool_id).execute()
    pool_row  = (pool_resp.data or [{}])[0]
    round_points = pool_row.get('scoring_config') or ROUND_POINTS

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

    # Build players list — calculate scores directly from games + picks
    # (no dependency on scores table, which is not populated)
    players = []
    for bracket in brackets_raw:
        uid      = bracket['user_id']
        username = member_map.get(uid, uid)
        picks    = bracket.get('picks') or []
        picks    = (picks + [None] * 63)[:63] if isinstance(picks, list) else [None] * 63

        # Calculate current points from final games
        points = 0
        for slot, game in games_by_slot.items():
            if (game.get('status') == 'final' and game.get('winner')
                    and slot < len(picks) and picks[slot] == game['winner']):
                points += round_points.get(SLOT_ROUND.get(slot, ''), 0)

        players.append({
            'username':       username,
            'picks':          picks,
            'current_points': points,
        })

    return players, games_by_slot, team_seeds, round_points


def load_prev_sim_data(client, pool_id):
    """Load previous player_probs, narratives, and narrative_day from sim_results
    for delta tracking and narrative preservation across hourly (no-narrative) runs."""
    try:
        resp = (client.table('sim_results')
                .select('player_probs, narratives, narrative_day')
                .eq('pool_id', pool_id)
                .execute())
        if resp.data:
            row = resp.data[0]
            return (
                row.get('player_probs') or {},
                row.get('narratives') or {},
                row.get('narrative_day') or 0,
            )
    except Exception:
        pass
    return {}, {}, 0


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
        # Upset threshold scales with round: later rounds have tighter seeds
        rnd = SLOT_ROUND.get(slot, '')
        upset_threshold = 3 if rnd in ('S16', 'E8', 'F4', 'Champ') else 5
        winner_seed = seed1 if winner == t1 else seed2
        loser_seed  = seed2 if winner == t1 else seed1
        is_upset = (seed_diff >= upset_threshold
                    and winner_seed is not None and loser_seed is not None
                    and winner_seed > loser_seed)
        entry = {
            'result':    f"{winner} def. {loser}{(' ' + score) if score else ''}",
            'round':     rnd,
            'upset':     is_upset,
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
        # Empty gameTime means slot not yet linked to ESPN — skip it
        is_today = game_time and not any(game_time.startswith(d) for d in
                           ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'))
        if is_today:
            today_upcoming.append(f"{t1} vs {t2}" + (f" ({game_time})" if game_time else ''))

    # Collect live games with enriched ESPN context
    live_games = []
    for slot in sorted(games_by_slot.keys()):
        g = games_by_slot[slot]
        if g.get('status') != 'live':
            continue
        teams = g.get('teams') or {}
        t1, t2 = teams.get('team1', 'TBD'), teams.get('team2', 'TBD')
        s1, s2 = teams.get('score1', 0), teams.get('score2', 0)
        seed1, seed2 = teams.get('seed1'), teams.get('seed2')
        note = teams.get('gameNote', '')
        rnd = SLOT_ROUND.get(slot, '')

        # ESPN win probability (stored as home/team2 probability)
        wp_home = g.get('win_prob_home')
        wp_note = ''
        if wp_home is not None:
            wp_t1 = round((1.0 - wp_home) * 100)
            wp_t2 = round(wp_home * 100)
            wp_note = f", ESPN win prob: {t1} {wp_t1}% / {t2} {wp_t2}%"

        seed_note = ''
        if seed1 and seed2:
            seed_note = f" [#{seed1} vs #{seed2}]"

        line = (f"{t1} {s1} - {t2} {s2} ({note}){seed_note}"
                f" | {ROUND_DISPLAY.get(rnd, rnd)}{wp_note}")
        live_games.append(line)

    return {
        'day_number':       day_number,
        'current_round':    ROUND_DISPLAY.get(current_round, current_round),
        'n_final':          len(all_finals),
        'n_today_upcoming': len(today_upcoming),
        'upsets':           upsets,
        'yesterday_finals': yesterday_finals[-12:],
        'today_upcoming':   today_upcoming[:8],
        'is_day_one':       day_number == 1,
        'live_games':       live_games,
    }


def build_enriched_player_stats(players, games_by_slot, player_probs, prev_probs,
                                 leverage_games, outcome_deltas, round_points=None):
    """
    Build enriched per-player stats for narrative prompts.

    Returns { player_name: { ...stats } } with:
      - rank, points, ppr, win_prob, win_prob_delta, trajectory
      - picks_correct / picks_eliminated / picks_alive by round
      - region_health: per-region count of alive picks in S16+
      - unique_picks: picks no other player shares (differentiators)
      - shared_picks: picks that N other players also have (crowded)
      - top_outcome_deltas: best upside + biggest threat from dependency data
      - personal_leverage: top 3 games by personal swing
      - max_remaining_upside: theoretical max future points
      - champ_pick, champ_alive
    """
    rp = round_points or ROUND_POINTS

    # Eliminated teams
    eliminated = set()
    for g in games_by_slot.values():
        if g.get('status') == 'final' and g.get('winner'):
            teams = g.get('teams') or {}
            loser = teams.get('team2') if g['winner'] == teams.get('team1') else teams.get('team1')
            if loser:
                eliminated.add(loser)

    # Rank by points (standard competition: 1,1,3)
    sorted_by_pts = sorted(players, key=lambda p: -p['current_points'])
    rank_map = {}
    for i, p in enumerate(sorted_by_pts):
        if i == 0 or p['current_points'] < sorted_by_pts[i - 1]['current_points']:
            rank_map[p['username']] = i + 1
        else:
            rank_map[p['username']] = rank_map[sorted_by_pts[i - 1]['username']]

    pool_size = len(players)

    # Count pick frequency across all players (for unique/shared detection)
    pick_freq = {}  # { (slot, team): count }
    for p in players:
        for slot, pick in enumerate(p['picks']):
            if pick:
                pick_freq[(slot, pick)] = pick_freq.get((slot, pick), 0) + 1

    # Build outcome delta lookup
    delta_lookup = {}  # { (team, outcome): { player: delta } }
    for entry in (outcome_deltas or []):
        delta_lookup[(entry['team'], entry['outcome'])] = entry.get('deltas', {})

    # Leverage lookup for per-player top games
    lev_by_player = {}
    for g in (leverage_games or []):
        for pi in g.get('playerImpacts', []):
            lev_by_player.setdefault(pi['player'], []).append({
                'matchup': f"{g['team1']} vs {g['team2']}",
                'round': g.get('round', ''),
                'swing': pi['swing'],
                'root_for': pi['rootFor'],
                'status': g.get('status', 'pending'),
                'game_note': g.get('gameNote', ''),
            })

    REGION_NAMES = {0: 'Midwest', 15: 'West', 30: 'South', 45: 'East'}

    stats = {}
    for player in players:
        name  = player['username']
        picks = player['picks']
        pts   = player['current_points']

        # Per-round pick breakdown
        correct_by_round = {}
        eliminated_by_round = {}
        alive_by_round = {}
        for slot, pick in enumerate(picks):
            if not pick:
                continue
            rnd = SLOT_ROUND.get(slot, 'R64')
            game = games_by_slot.get(slot)
            if game and game.get('status') == 'final':
                if game.get('winner') == pick:
                    correct_by_round[rnd] = correct_by_round.get(rnd, 0) + 1
                else:
                    eliminated_by_round[rnd] = eliminated_by_round.get(rnd, 0) + 1
            elif pick not in eliminated:
                alive_by_round[rnd] = alive_by_round.get(rnd, 0) + 1

        # PPR: max future points still achievable
        ppr = 0
        for slot, pick in enumerate(picks):
            if not pick or pick in eliminated:
                continue
            game = games_by_slot.get(slot)
            if game and game.get('status') != 'final' and not game.get('winner'):
                ppr += rp.get(SLOT_ROUND.get(slot, 'R64'), 0)

        # Region health: alive picks in S16+ slots per region
        region_health = {}
        for base, rname in REGION_NAMES.items():
            alive = 0
            for offset in (12, 13, 14):  # S16 (2) + E8 (1) slots
                slot = base + offset
                pick = picks[slot] if slot < len(picks) else None
                if pick and pick not in eliminated:
                    alive += 1
            region_health[rname] = alive

        # Unique picks (only this player has it) — focus on S16+ rounds
        unique = []
        shared = []
        for slot, pick in enumerate(picks):
            if not pick or pick in eliminated:
                continue
            rnd = SLOT_ROUND.get(slot, 'R64')
            if rnd in ('R64', 'R32'):
                continue  # too many R64/R32 picks to list
            freq = pick_freq.get((slot, pick), 0)
            if freq == 1:
                unique.append(f"{pick} ({rnd})")
            elif freq >= pool_size * 0.6:
                shared.append(f"{pick} ({rnd}, {freq}/{pool_size} share)")

        # Top outcome deltas (biggest upside + biggest threat)
        best_upside = {'delta': 0, 'label': ''}
        worst_threat = {'delta': 0, 'label': ''}
        for (team, outcome), deltas in delta_lookup.items():
            d = deltas.get(name, 0)
            outcome_label = f"{team} {'Final Four' if outcome == 'F4' else 'Title'}"
            if d > best_upside['delta']:
                best_upside = {'delta': d, 'label': outcome_label}
            if d < worst_threat['delta']:
                worst_threat = {'delta': d, 'label': outcome_label}

        # Personal top leverage games
        plev = sorted(lev_by_player.get(name, []), key=lambda x: -x['swing'])[:3]

        # Win prob + trajectory
        wp = round((player_probs.get(name, 0)) * 100, 1)
        prev_wp = round((prev_probs.get(name, 0)) * 100, 1)
        wp_delta = round(wp - prev_wp, 1)
        if wp_delta > 2:
            trajectory = 'rising'
        elif wp_delta < -2:
            trajectory = 'falling'
        else:
            trajectory = 'stable'

        # Champion pick
        champ_pick = picks[62] if len(picks) > 62 else None
        champ_alive = champ_pick is not None and champ_pick not in eliminated

        stats[name] = {
            'rank': rank_map.get(name, '?'),
            'points': pts,
            'ppr': ppr,
            'win_prob': wp,
            'win_prob_delta': wp_delta,
            'trajectory': trajectory,
            'correct_by_round': correct_by_round,
            'eliminated_by_round': eliminated_by_round,
            'alive_by_round': alive_by_round,
            'region_health': region_health,
            'unique_picks': unique[:5],
            'shared_picks': shared[:3],
            'best_upside': best_upside,
            'worst_threat': worst_threat,
            'personal_leverage': plev,
            'max_remaining_upside': ppr,
            'champ_pick': champ_pick,
            'champ_alive': champ_alive,
        }

    return stats


# ─── Narrative feed generation ────────────────────────────────────────────────

def generate_feed_entries(player_probs, prev_probs, best_paths, players,
                          games_by_slot, leverage_games=None,
                          model='claude-haiku-4-5-20251001',
                          narrative_type='game_end',
                          just_finished='',
                          enriched_stats=None,
                          outcome_deltas=None,
                          round_points=None):
    """
    Generate narrative feed entries for the live broadcast booth system.

    Three personas:
      - stat_nerd (📊): data-driven analysis, leverages enriched stats
      - color_commentator (🎙️): live play-by-play energy, game reactions
      - barkley (🔥): Charles Barkley energy — funny, blunt, hot takes

    Persona assignments by entry type:
      - overnight: stat_nerd + barkley (morning briefing)
      - deep_dive: stat_nerd + barkley alternating (studio show during live games)
      - game_end: color_commentator (immediate reactions)
      - alert: color_commentator (breaking news)

    Returns list of dicts ready to insert into narrative_feed table:
      [{ player_name, entry_type, persona, content, leverage_pct }, ...]

    Also returns legacy narratives dict for backward compatibility with sim_results.
    """
    api_key = os.environ.get('ANTHROPIC_API_KEY', '')
    if not api_key:
        print('  Skipping narratives (no ANTHROPIC_API_KEY)')
        return [], {}

    try:
        import anthropic
    except ImportError:
        print('  Skipping narratives (anthropic package not installed)')
        return [], {}

    pool_size = len(players)
    ctx = build_tournament_context(games_by_slot)

    # ── Tournament context ────────────────────────────────────────────────────

    upset_lines     = '\n'.join(f"  - {u['result']} ({u['round']})" for u in ctx['upsets']) \
                      or '  None yet'
    yesterday_lines = '\n'.join(f"  - {r['result']}" for r in ctx['yesterday_finals']) \
                      or ('  No games yet (Day 1)' if ctx['is_day_one'] else '  No results')
    today_lines     = '\n'.join(f"  - {g}" for g in ctx['today_upcoming']) \
                      or '  No games scheduled today'
    live_lines      = '\n'.join(f"  - {g}" for g in ctx.get('live_games', [])) \
                      or '  No games live right now'

    # ── Enriched per-player stat blocks ───────────────────────────────────────

    enriched = enriched_stats or {}
    player_stat_blocks = []
    for name in sorted(enriched.keys(), key=lambda n: enriched[n].get('rank', 99)):
        s = enriched[name]
        correct_str = ', '.join(f"{r}:{s['correct_by_round'].get(r, 0)}"
                                for r in ('R64','R32','S16','E8','F4','Champ')
                                if s['correct_by_round'].get(r, 0) > 0)
        elim_str = ', '.join(f"{r}:{s['eliminated_by_round'].get(r, 0)}"
                             for r in ('R64','R32','S16','E8','F4','Champ')
                             if s['eliminated_by_round'].get(r, 0) > 0)
        alive_str = ', '.join(f"{r}:{s['alive_by_round'].get(r, 0)}"
                              for r in ('R64','R32','S16','E8','F4','Champ')
                              if s['alive_by_round'].get(r, 0) > 0)
        region_str = ', '.join(f"{r}:{c}" for r, c in s['region_health'].items() if c > 0)
        unique_str = '; '.join(s['unique_picks'][:3]) if s['unique_picks'] else 'none'
        lev_str = ' | '.join(
            f"{g['matchup']} (±{g['swing']}%, root for {g['root_for']})"
            for g in s['personal_leverage']
        ) or 'none'

        upside = s['best_upside']
        threat = s['worst_threat']
        upside_str = f"{upside['label']} (+{round(upside['delta']*100,1)}%)" if upside['delta'] else 'none'
        threat_str = f"{threat['label']} ({round(threat['delta']*100,1)}%)" if threat['delta'] else 'none'

        path_bullets = best_paths.get(name, best_paths.get('_default', []))
        path_text = '; '.join(b['text'] for b in path_bullets[:3]) if path_bullets else 'N/A'

        block = (
            f"- {name}:\n"
            f"    Rank: {s['rank']}/{pool_size} | Points: {s['points']} | "
            f"PPR (points possible remaining): {s['ppr']} | "
            f"Win%: {s['win_prob']}% (delta {'+' if s['win_prob_delta'] > 0 else ''}{s['win_prob_delta']}%) | "
            f"Trajectory: {s['trajectory']}\n"
            f"    Picks correct: {correct_str or 'none'} | Eliminated: {elim_str or 'none'} | "
            f"Still alive: {alive_str or 'none'}\n"
            f"    Region health (S16+ alive): {region_str or 'all regions dead'}\n"
            f"    Unique picks (only this player): {unique_str}\n"
            f"    Champ pick: {s['champ_pick'] or 'none'} ({'alive' if s['champ_alive'] else 'ELIMINATED'})\n"
            f"    Best upside: {upside_str} | Biggest threat: {threat_str}\n"
            f"    Key leverage: {lev_str}\n"
            f"    Needs: {path_text}"
        )
        player_stat_blocks.append(block)

    player_block = '\n'.join(player_stat_blocks)

    # ── Leverage games ────────────────────────────────────────────────────────

    top_leverage = (leverage_games or [])[:5]
    leverage_parts = []
    for g in top_leverage:
        header = (f"  - {g['team1']} vs {g['team2']} "
                  f"({g['leverage']}% pool swing, "
                  f"{round(g['pickPct1'])}% of pool on {g['team1'].split()[-1]})")
        impacts = g.get('playerImpacts', [])[:3]
        impact_strs = [
            f"    {pi['player']} needs {pi['rootFor'].split()[-1]} (±{pi['swing']}%)"
            for pi in impacts if pi['swing'] >= 1.0
        ]
        leverage_parts.append(header + ('\n' + '\n'.join(impact_strs) if impact_strs else ''))
    leverage_lines = '\n'.join(leverage_parts) or '  None calculated yet'

    # ── Shared context header ─────────────────────────────────────────────────

    context_block = f"""You are the voice of a March Madness bracket pool live feed — a broadcast booth
with THREE personas who take turns. The feed is personalized: each player entry is
written in SECOND PERSON ("your bracket", "you need", "your champion"), as if
talking directly to that player.

THE THREE PERSONAS:
- stat_nerd (📊): Sharp, data-driven analyst. Cites exact numbers — win%, PPR, leverage swings,
  conditional probabilities. Concise and clinical. Think Nate Silver at a bar.
- color_commentator (🎙️): Live play-by-play energy. Urgency, immediacy, reacting to what just
  happened. Clear and punchy. Think professional broadcast booth.
- barkley (🔥): Charles Barkley energy — funny, blunt, tough but fair. Hot takes, trash talk,
  tells it like it is. "That bracket is turrible." Roasts struggling brackets, hypes underdogs,
  makes bold predictions. Entertaining but never mean-spirited.

CRITICAL TERMINOLOGY:
- "Score" / "Points" = current ranking points earned from correct picks. This determines rank/standings.
- "PPR" (Points Possible Remaining) = maximum future points still earnable. High PPR = upside potential.
- "Win %" / "Win probability" = simulated chance of winning the entire pool. NOT used for current ranking.
  A player can be 3rd in points but 1st in win% if their remaining picks are strong.
- NEVER confuse these. When saying "1st place" always mean points rank. When saying "best odds" mean win%.

Tournament context:
- Today: Day {ctx['day_number']} | Current round: {ctx['current_round']}
- Games completed: {ctx['n_final']} | Today remaining: {ctx['n_today_upcoming']}
- Notable upsets:
{upset_lines}
- Yesterday's results:
{yesterday_lines}
- Today's upcoming:
{today_lines}
- Live right now:
{live_lines}

Pool ({pool_size} entries) — enriched player stats:
{player_block}

Highest-leverage games:
{leverage_lines}"""

    # ── Prompt variants ───────────────────────────────────────────────────────

    if narrative_type == 'overnight':
        tasks_block = f"""Morning briefing. Two personas tag-team: stat_nerd sets the table, barkley adds flavor.

Generate a JSON array. For EACH player, produce TWO entries (one stat_nerd, one barkley).
Also produce TWO "_pool" entries (one stat_nerd, one barkley).

stat_nerd entries:
- Max 60 words. Lead with yesterday's impact, then set up today.
- Reference specific stats: rank change, PPR, win% movement, which picks got hurt.
- Tone: sharp morning newsletter — concise, data-rich.

barkley entries:
- Max 50 words. React to their situation with personality.
- Hot takes, predictions, roasts for bad picks, hype for good ones.
- Playful trash talk is encouraged. "That bracket is turrible" energy.
- Keep it fun — tough but fair, never genuinely mean.

Rules for both:
- Second person ("Your bracket…", "You need…")
- NEVER confuse score (ranking points) with win probability

Return JSON array:
[
  {{"player_name": "playerName", "entry_type": "overnight", "persona": "stat_nerd", "content": "..."}},
  {{"player_name": "playerName", "entry_type": "overnight", "persona": "barkley", "content": "..."}},
  ...
  {{"player_name": "_pool", "entry_type": "overnight", "persona": "stat_nerd", "content": "..."}},
  {{"player_name": "_pool", "entry_type": "overnight", "persona": "barkley", "content": "..."}}
]
No markdown, no explanation — just the JSON array."""

    elif narrative_type == 'deep_dive':
        tasks_block = f"""Studio show deep-dive during live action. stat_nerd and barkley go back and forth.

Generate a JSON array of 4-6 entries total (mix of pool-wide "_pool" and individual player entries).
Pick the 2-3 players with the most at stake right now. Alternate personas.

stat_nerd entries:
- Cite specific numbers: win%, PPR, leverage swing, conditional probabilities
- What do the live scores mean for the pool standings if they hold?
- Reference ESPN win probabilities if available in the live game data

barkley entries:
- React to what's happening with personality and humor
- Call out who should be sweating, who's getting lucky, who's bracket is falling apart
- Bold predictions: "If this score holds, [player] is DONE"
- Playful roasts and hype — keep the energy flowing

Rules for both:
- Max 50 words per entry
- Second person for player entries
- Focus on what's happening NOW in live games

Return JSON array:
[
  {{"player_name": "_pool", "entry_type": "deep_dive", "persona": "barkley", "content": "..."}},
  {{"player_name": "playerName", "entry_type": "deep_dive", "persona": "stat_nerd", "content": "..."}},
  {{"player_name": "playerName", "entry_type": "deep_dive", "persona": "barkley", "content": "..."}},
  ...
]
No markdown, no explanation — just the JSON array."""

    elif narrative_type == 'alert':
        # Alert entries are generated for specific high-leverage moments
        tasks_block = f"""BREAKING: A high-leverage moment has been detected. color_commentator delivers the alerts.

Generate a JSON array of 2-4 entries: one pool-wide alert + alerts for the 1-3 most affected players.

Rules:
- All entries use persona "color_commentator" — this is live breaking news
- Max 35 words per entry
- URGENT tone — this is a turning point, treat it like a breaking score alert
- Cite the leverage swing percentage in the content
- Include leverage_pct field with the numeric swing value
- Second person for player entries

Return JSON array:
[
  {{"player_name": "_pool", "entry_type": "alert", "persona": "color_commentator", "content": "...", "leverage_pct": 25.0}},
  {{"player_name": "playerName", "entry_type": "alert", "persona": "color_commentator", "content": "...", "leverage_pct": 18.5}},
  ...
]
No markdown, no explanation — just the JSON array."""

    else:  # game_end
        just_finished_line = f"\nGame(s) just finished: {just_finished}\n" if just_finished else ''
        tasks_block = f"""{just_finished_line}Game just ended. color_commentator delivers the immediate reactions.

Generate a JSON array: for each player one entry + one "_pool" entry.
All entries use persona "color_commentator" — this is live play-by-play reaction.

Rules:
- Max 45 words per entry
- Second person for player entries ("That result just boosted your win% to…")
- React to the game(s) that just ended — did it help or hurt?
- Reference specific stats where impactful: win% delta, points gained/lost
- If games are still live, flag what's at stake next
- Urgency and energy — this just happened, react to it
- NEVER confuse score (ranking points) with win probability

Return JSON array:
[
  {{"player_name": "_pool", "entry_type": "game_end", "persona": "color_commentator", "content": "..."}},
  {{"player_name": "playerName", "entry_type": "game_end", "persona": "color_commentator", "content": "..."}},
  ...
]
No markdown, no explanation — just the JSON array."""

    prompt = context_block + '\n\n' + tasks_block

    try:
        client = anthropic.Anthropic(api_key=api_key)
        resp = client.messages.create(
            model=model,
            max_tokens=4096,
            messages=[{'role': 'user', 'content': prompt}],
        )
        raw = resp.content[0].text.strip()
        # Strip markdown code fences if model ignores the instruction
        if raw.startswith('```'):
            raw = raw.split('\n', 1)[-1].rsplit('```', 1)[0].strip()
        entries = json.loads(raw)

        if not isinstance(entries, list):
            # Legacy format fallback: old-style {player: text} dict
            entries = [
                {'player_name': k, 'entry_type': narrative_type,
                 'persona': 'stat_nerd', 'content': v}
                for k, v in entries.items()
            ]

        n_player = sum(1 for e in entries if e.get('player_name') != '_pool')
        n_pool   = sum(1 for e in entries if e.get('player_name') == '_pool')
        print(f'  Generated {narrative_type} feed: {n_player} player + {n_pool} pool entries')

        # Build legacy narratives dict for backward compat with sim_results
        legacy = {}
        for e in entries:
            pn = e.get('player_name', '')
            if pn and pn not in legacy:  # first entry per player wins for legacy
                legacy[pn] = e.get('content', '')

        return entries, legacy

    except Exception as e:
        print(f'  Narrative generation failed: {e}')
        return [], {}


def insert_feed_entries(client, pool_id, entries):
    """Insert feed entries into the narrative_feed table."""
    if not entries:
        return
    rows = []
    for e in entries:
        row = {
            'pool_id':      pool_id,
            'player_name':  e.get('player_name', '_pool'),
            'entry_type':   e.get('entry_type', 'game_end'),
            'persona':      e.get('persona', 'stat_nerd'),
            'content':      e.get('content', ''),
        }
        if e.get('leverage_pct') is not None:
            row['leverage_pct'] = e['leverage_pct']
        rows.append(row)
    try:
        client.table('narrative_feed').insert(rows).execute()
        print(f'  Inserted {len(rows)} feed entries into narrative_feed')
    except Exception as err:
        print(f'  Failed to insert feed entries: {err}')


# ─── Legacy wrapper (backward compat for old poller calls) ────────────────────

def generate_narratives(player_probs, prev_probs, best_paths, players,
                        games_by_slot, leverage_games=None,
                        model='claude-haiku-4-5-20251001',
                        prev_narratives=None,
                        narrative_type='game_end',
                        just_finished='',
                        prev_narrative_day=0):
    """Legacy wrapper — calls new feed system and returns old-style dict."""
    _, legacy = generate_feed_entries(
        player_probs, prev_probs, best_paths, players,
        games_by_slot, leverage_games=leverage_games,
        model=model, narrative_type=narrative_type,
        just_finished=just_finished,
    )
    return legacy or {}


def calculate_outcome_deltas(players, all_outcomes, sim_winners, player_probs,
                             min_bucket=50):
    """
    For each remaining team, compute per-player win-probability delta if that
    team reaches F4 (slots 60 or 61) or wins the Championship (slot 62).

    Delta = conditional_win_rate - baseline_win_rate.
    Only included when the bucket has >= min_bucket simulations.

    Returns a list of dicts:
      [{"team": str, "outcome": "F4"|"Champ", "deltas": {player_name: float}}, ...]
    """
    n_sims = len(all_outcomes)
    if n_sims == 0 or not players:
        return []

    player_names = [p['username'] for p in players]

    # Collect all teams that appear in F4/Champ slots across sims
    remaining_teams = set()
    for sim in all_outcomes:
        for slot in (60, 61, 62):
            t = sim.get(slot)
            if t:
                remaining_teams.add(t)

    # Build per-iteration winner sets for fast lookup
    # sim_winner_sets[i] = set of player names who won iteration i (fractional share)
    # We store fractional shares: {player: share} per iteration
    iter_shares = []
    for winners in sim_winners:
        if winners:
            share = 1.0 / len(winners)
            iter_shares.append({w: share for w in winners})
        else:
            iter_shares.append({})

    results = []

    for team in sorted(remaining_teams):
        for outcome_type, slots in (('F4', (60, 61)), ('Champ', (62,))):
            # Bucket: iterations where team reached this outcome
            bucket_indices = [
                i for i, sim in enumerate(all_outcomes)
                if any(sim.get(s) == team for s in slots)
            ]
            if len(bucket_indices) < min_bucket:
                continue

            n_bucket = len(bucket_indices)
            deltas = {}
            for name in player_names:
                base = player_probs.get(name, 0.0)
                cond = sum(iter_shares[i].get(name, 0.0) for i in bucket_indices) / n_bucket
                deltas[name] = round(cond - base, 4)

            results.append({'team': team, 'outcome': outcome_type, 'deltas': deltas})

    return results


def upsert_sim_results(client, pool_id, player_probs, leverage_games,
                       player_leverage, best_paths, prev_player_probs,
                       narratives, iterations, dry_run, narrative_day=0,
                       outcome_deltas=None):
    payload = {
        'pool_id':             pool_id,
        'iterations':          iterations,
        'player_probs':        player_probs,
        'leverage_games':      leverage_games,
        'player_leverage':     player_leverage,
        'best_paths':          best_paths,
        'prev_player_probs':   prev_player_probs,
        'narratives':          narratives,
        'narrative_day':       narrative_day,
        'outcome_deltas':      outcome_deltas or [],
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
    parser.add_argument('--iterations', type=int, default=20_000)
    parser.add_argument('--dry-run',        action='store_true')
    parser.add_argument('--no-narratives',  action='store_true',
                        help='Skip narrative generation; preserve existing narratives in DB')
    parser.add_argument('--narrative-model', default='claude-haiku-4-5-20251001',
                        help='Claude model for narrative generation (e.g. claude-opus-4-6)')
    parser.add_argument('--narrative-type', default='game_end',
                        choices=['overnight', 'game_end', 'deep_dive', 'alert'],
                        help='Type of narrative to generate')
    parser.add_argument('--just-finished', default='',
                        help='Semicolon-separated list of just-finished game results')
    args = parser.parse_args()

    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        print('ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in api/.env', file=sys.stderr)
        sys.exit(1)

    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    bpi_ratings = load_ratings()

    print(f'Loading pool data for pool {args.pool_id}…')
    players, games_by_slot, team_seeds, pool_round_points = load_pool_data(client, args.pool_id)

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
    prev_probs, existing_narratives, prev_narrative_day = load_prev_sim_data(client, args.pool_id)
    if prev_probs:
        print(f'  Loaded previous win probs for {len(prev_probs)} player(s)')
    else:
        print('  No previous sim results (first run — deltas will be suppressed)')

    print(f'\nRunning {args.iterations:,} simulations…')
    player_probs, _, all_outcomes, sim_winners = run_simulation(
        players, games_by_slot, team_seeds, bpi_ratings,
        iterations=args.iterations, round_points=pool_round_points
    )

    print('\nWin probabilities:')
    for name, prob in sorted(player_probs.items(), key=lambda x: -x[1]):
        bar = '█' * max(1, int(prob * 40))
        prev_pct = prev_probs.get(name, 0) * 100
        delta = prob * 100 - prev_pct
        delta_str = f' ({("+" if delta > 0 else "")}{delta:.1f})' if prev_probs else ''
        print(f'  {name:<20} {prob * 100:5.1f}%{delta_str}  {bar}')

    print(f'\nCalculating leverage (bucket-split from {args.iterations:,} base sims)…')
    leverage_games, player_leverage = calculate_leverage(
        players, games_by_slot, all_outcomes, sim_winners
    )
    print(f'  {len(leverage_games)} game(s) with leverage data')
    print(f'  Per-player top games computed for {len(player_leverage)} player(s)')

    print('\nCalculating outcome deltas (F4 / Championship dependency)…')
    outcome_deltas = calculate_outcome_deltas(players, all_outcomes, sim_winners, player_probs)
    print(f'  {len(outcome_deltas)} outcome columns computed')

    best_paths = derive_best_paths(players, games_by_slot, all_outcomes, player_probs)

    # Build enriched stats for narrative prompts
    enriched_stats = build_enriched_player_stats(
        players, games_by_slot, player_probs, prev_probs,
        leverage_games, outcome_deltas, pool_round_points,
    )

    if args.no_narratives:
        print('\nSkipping narrative generation (--no-narratives); preserving existing.')
        narratives = existing_narratives
    else:
        print(f'\nGenerating AI narratives (model: {args.narrative_model}, type: {args.narrative_type})…')
        feed_entries, narratives = generate_feed_entries(
            player_probs, prev_probs, best_paths, players, games_by_slot,
            leverage_games=leverage_games,
            model=args.narrative_model,
            narrative_type=args.narrative_type,
            just_finished=args.just_finished,
            enriched_stats=enriched_stats,
            outcome_deltas=outcome_deltas,
            round_points=pool_round_points,
        )
        # Insert into narrative_feed table (append-only)
        if feed_entries and not args.dry_run:
            insert_feed_entries(client, args.pool_id, feed_entries)
        # Fall back to existing if generation failed
        if not narratives:
            narratives = existing_narratives

    current_day = (date.today() - TOURNAMENT_START_ET).days + 1
    upsert_sim_results(
        client, args.pool_id, player_probs, leverage_games, player_leverage,
        best_paths, prev_player_probs=prev_probs, narratives=narratives,
        iterations=args.iterations, dry_run=args.dry_run,
        narrative_day=current_day, outcome_deltas=outcome_deltas,
    )
    print('\nDone.')


if __name__ == '__main__':
    main()
