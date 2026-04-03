"""
Game Map — Layer 1 of the v3 narrative pipeline.

Builds a deterministic, per-game editorial planning document from analytics.
Every editorial decision about games (importance, coverage budget, who's on
which side, story type) is made here. No LLM.

Inputs:
  leverage_games    — from simulate.py calculate_leverage()
  games_by_slot     — dict of slot → game dict (status, teams, winner, gameNote, gameTime)
  enriched_stats    — from simulate.py build_enriched_player_stats()
  narrative_type    — 'game_end' | 'overnight' | 'deep_dive' | 'alert'
  just_finished     — semicolon-separated string of just-finished results
  recent_feed       — list of recent feed entries (for coverage tracking)
  players           — list of player dicts (for pool size)

Output:
  {
    'games': [game_map_entry, ...],      # sorted: live first, then upcoming, then tomorrow
    'trigger_game_id': int | None,       # slot id of the game that fired this cycle
    'cycle_time': str,                   # ISO timestamp
  }
"""

from __future__ import annotations

import re
from datetime import datetime, timezone


# ── Constants ─────────────────────────────────────────────────────────────────

IMPORTANCE_THRESHOLDS = {
    'CRITICAL': 40.0,
    'HIGH':     20.0,
    'MEDIUM':    8.0,
}

STANCE_RATIO = 3.0   # |if_loss| > STANCE_RATIO * |if_win| → PROTECTIVE
DECISIVE_MIN = 5.0   # both |if_win| and |if_loss| > this → DECISIVE
MINOR_MAX    = 3.0   # swing < this → MINOR

# Coverage budgets (total posts per game per day by importance)
COVERAGE_BUDGETS = {
    'CRITICAL': 5,
    'HIGH':     4,
    'MEDIUM':   2,
    'LOW':      1,
}


# ── Game Phase Parsing ────────────────────────────────────────────────────────

def parse_game_phase(game_note: str, status: str) -> str:
    """
    Derive game phase from ESPN gameNote string.

    gameNote examples: "Final", "5:59 2H", "Halftime", "1:30 OT", "2H"
    Returns: "early_1h" | "late_1h" | "halftime" | "early_2h" | "late_2h" | "crunch" | "ot" | "final" | "pending"
    """
    if not game_note and status != 'live':
        return 'pending'

    note = (game_note or '').strip().upper()

    if note in ('FINAL', 'F'):
        return 'final'
    if 'HALFTIME' in note or note == 'HT':
        return 'halftime'
    if 'OT' in note:
        return 'ot'

    # Pattern: "M:SS 1H" or "M:SS 2H"
    match = re.search(r'(\d+):(\d+)\s*(1H|2H)', note)
    if match:
        mins = int(match.group(1))
        half = match.group(3)
        total_secs = mins * 60 + int(match.group(2))
        if half == '1H':
            return 'late_1h' if total_secs <= 600 else 'early_1h'
        else:  # 2H
            if total_secs <= 240:
                return 'crunch'
            elif total_secs <= 600:
                return 'late_2h'
            else:
                return 'early_2h'

    # Just "2H" with no clock — treat as early_2h
    if '2H' in note:
        return 'early_2h'
    if '1H' in note:
        return 'early_1h'

    if status == 'live':
        return 'early_1h'  # fallback for live with unparseable note

    return 'pending'


# ── Stance Classification ─────────────────────────────────────────────────────

def classify_stance(if_win: float, if_loss: float, swing: float) -> str:
    """
    Classify a player's stake in a game outcome.

    if_win: prob change (%) if their preferred team wins (usually positive)
    if_loss: prob change (%) if their preferred team loses (usually negative)
    swing: abs spread (always positive)
    """
    if swing < MINOR_MAX:
        return 'MINOR'

    abs_win  = abs(if_win)
    abs_loss = abs(if_loss)

    # DECISIVE: both outcomes are big
    if abs_win >= DECISIVE_MIN and abs_loss >= DECISIVE_MIN:
        return 'DECISIVE'

    # PROTECTIVE: loss hurts much more than win helps
    if abs_loss >= STANCE_RATIO * max(abs_win, 0.1):
        return 'PROTECTIVE'

    # OPPORTUNISTIC: win helps much more than loss hurts
    if abs_win >= STANCE_RATIO * max(abs_loss, 0.1):
        return 'OPPORTUNISTIC'

    return 'SYMMETRIC'


def directional_context(stance: str, if_win: float, if_loss: float, root_for: str) -> str:
    """
    Build a one-line directional context string for the writer.
    Encodes what winning vs losing actually means narratively.
    """
    win_str  = f'{if_win:+.1f}%'
    loss_str = f'{if_loss:+.1f}%'

    if stance == 'PROTECTIVE':
        return (f'Win = {win_str} (just holds position). '
                f'Loss = {loss_str} (devastating). Must root for {root_for}.')
    elif stance == 'OPPORTUNISTIC':
        return (f'Win = {win_str} (huge opportunity). '
                f'Loss = {loss_str} (barely a scratch). Rooting for {root_for}.')
    elif stance == 'DECISIVE':
        return (f'Win = {win_str}. Loss = {loss_str}. Both outcomes are massive. '
                f'Everything rides on {root_for}.')
    elif stance == 'SYMMETRIC':
        return f'Win = {win_str}, loss = {loss_str}. Balanced leverage on {root_for}.'
    else:  # MINOR
        return f'Low-impact game (swing < {MINOR_MAX}%). Background context only.'


# ── Trigger Game Detection ────────────────────────────────────────────────────

def detect_trigger_game(leverage_games: list, narrative_type: str,
                         just_finished: str, games_by_slot: dict) -> int | None:
    """
    Identify which game fired this narrative cycle.

    - game_end:   parse just_finished to match a game slot
    - deep_dive / alert: highest-leverage live game
    - overnight:  no trigger game
    """
    if narrative_type == 'overnight':
        return None

    if narrative_type == 'game_end' and just_finished:
        # just_finished is a semicolon-separated string of game result descriptions
        # Match against game matchup strings in leverage_games
        jf_lower = just_finished.lower()
        for g in leverage_games:
            t1 = (g.get('team1') or '').lower()
            t2 = (g.get('team2') or '').lower()
            if t1 and t2 and (t1 in jf_lower or t2 in jf_lower):
                return g['id']
        # Fallback: any game that just went to 'final'
        for g in leverage_games:
            slot = g['id']
            game = games_by_slot.get(slot, {})
            if game.get('winner') and game.get('status') == 'final':
                return slot

    # For deep_dive / alert / game_end without just_finished: highest-leverage live game
    live_games = [g for g in leverage_games if g.get('status') == 'live']
    if live_games:
        return max(live_games, key=lambda g: g.get('leverage', 0))['id']

    # Fallback: highest-leverage game overall
    if leverage_games:
        return max(leverage_games, key=lambda g: g.get('leverage', 0))['id']

    return None


# ── Coverage Tracking ─────────────────────────────────────────────────────────

def load_coverage_history(recent_feed: list, games: list) -> dict:
    """
    From recent feed entries, compute per-game coverage stats.
    Returns { game_id: { times_today: int, last_covered_at: datetime|None,
                          last_covered_score: str } }
    """
    # Build a set of team names → game_id for matching
    team_to_game = {}
    for g in games:
        if g.get('team1'):
            team_to_game[g['team1'].lower()] = g['id']
        if g.get('team2'):
            team_to_game[g['team2'].lower()] = g['id']

    history = {g['id']: {'times_today': 0, 'last_covered_at': None,
                          'last_covered_score': ''} for g in games}

    for entry in (recent_feed or []):
        content = (entry.get('content') or '').lower()
        created = entry.get('created_at')
        if isinstance(created, str):
            try:
                created = datetime.fromisoformat(created.replace('Z', '+00:00'))
            except ValueError:
                created = None

        for team_name, game_id in team_to_game.items():
            if team_name in content:
                h = history[game_id]
                h['times_today'] += 1
                if created and (h['last_covered_at'] is None or created > h['last_covered_at']):
                    h['last_covered_at'] = created
                break  # count entry once per game

    return history


# ── Story Type Classification ─────────────────────────────────────────────────

def classify_story_type(sides: dict, consensus_pct: float,
                         game_phase: str, aggregate_swing: float,
                         ranked_players: list | None = None) -> str:
    """
    Classify the primary narrative angle for this game.
    First match wins.
    """
    t1_players = sides.get('team1', {}).get('players', [])
    t2_players = sides.get('team2', {}).get('players', [])

    all_staked = t1_players + t2_players

    # Check for champ stakes
    champ_t1 = [p for p in t1_players if p.get('champ_at_stake')]
    champ_t2 = [p for p in t2_players if p.get('champ_at_stake')]

    # elimination_game: at least one champ pick will die
    if (champ_t1 or champ_t2) and game_phase in ('early_2h', 'late_2h', 'crunch', 'final', 'ot'):
        return 'elimination_game'

    # defining_moment: DECISIVE stance with big swing
    if any(p.get('stance') == 'DECISIVE' and p.get('swing', 0) >= 20 for p in all_staked):
        return 'defining_moment'

    # must_win: PROTECTIVE stance with large downside
    if any(p.get('stance') == 'PROTECTIVE' and abs(p.get('if_loss', 0)) >= 15 for p in all_staked):
        return 'must_win'

    # champ_showdown: multiple champ picks on opposite sides
    if champ_t1 and champ_t2:
        return 'champ_showdown'

    # pool_divider: top players on opposite sides
    if ranked_players and t1_players and t2_players:
        top_names = {p['name'] for p in ranked_players[:3]}
        t1_names  = {p['name'] for p in t1_players}
        t2_names  = {p['name'] for p in t2_players}
        if top_names & t1_names and top_names & t2_names:
            return 'pool_divider'

    # consensus: >75% of pool on same side
    if consensus_pct >= 75 or consensus_pct <= 25:
        return 'consensus'

    # upset_watch: lower seed leading in late game
    # (We don't have seed info here — leave for game note parsing enhancement)

    # low_impact
    if aggregate_swing < 5:
        return 'low_impact'

    return 'pool_divider'  # default for split pools


# ── Build Sides ───────────────────────────────────────────────────────────────

def build_sides(game: dict, enriched_stats: dict) -> dict:
    """
    For a game, compute per-player directional impact and assign each player to a side.

    Returns:
    {
      'team1': { 'team': str, 'players': [...] },
      'team2': { 'team': str, 'players': [...] },
      'neutral': [str],
    }
    """
    team1 = game.get('team1', '')
    team2 = game.get('team2', '')
    impacts = game.get('playerImpacts', [])

    t1_players = []
    t2_players = []
    neutral    = []

    for pi in impacts:
        name    = pi['player']
        stats   = enriched_stats.get(name, {})
        wp      = stats.get('win_prob', 0)         # current win prob %
        if_t1   = pi.get('ifTeam1', wp)            # conditional if team1 wins
        if_t2   = pi.get('ifTeam2', wp)            # conditional if team2 wins
        swing   = pi.get('swing', 0)
        root_for = pi.get('rootFor', team1)

        if root_for == team1:
            if_win  = round(if_t1 - wp, 1)
            if_loss = round(if_t2 - wp, 1)
        else:
            if_win  = round(if_t2 - wp, 1)
            if_loss = round(if_t1 - wp, 1)

        stance = classify_stance(if_win, if_loss, swing)

        # Determine reason for stake
        champ = stats.get('champ_pick', '')
        champ_alive = stats.get('champ_alive', False)
        champ_at_stake = champ_alive and champ in (team1, team2)

        if champ_at_stake:
            reason = 'champ'
        elif swing < MINOR_MAX:
            reason = 'minor'
        elif stats.get('any_prize_prob', 0) > 0 and stats.get('win_prob', 0) < 1:
            reason = 'prize_race'
        else:
            reason = 'path'

        entry = {
            'name':          name,
            'if_win':        if_win,
            'if_loss':       if_loss,
            'swing':         round(swing, 1),
            'stance':        stance,
            'root_for':      root_for,
            'reason':        reason,
            'champ_at_stake': champ_at_stake,
            'directional':   directional_context(stance, if_win, if_loss, root_for),
        }

        if swing < 1.0:
            neutral.append(name)
        elif root_for == team1:
            t1_players.append(entry)
        else:
            t2_players.append(entry)

    # Sort each side by swing descending
    t1_players.sort(key=lambda p: -p['swing'])
    t2_players.sort(key=lambda p: -p['swing'])

    return {
        'team1': {'team': team1, 'players': t1_players},
        'team2': {'team': team2, 'players': t2_players},
        'neutral': neutral,
    }


# ── Conflict Detection ────────────────────────────────────────────────────────

def detect_conflicts(sides: dict, enriched_stats: dict,
                      ranked_players: list) -> list:
    """
    Find head-to-head player conflicts — players on opposite sides of a game
    who have meaningful stakes and competitive proximity.
    """
    t1_players = sides.get('team1', {}).get('players', [])
    t2_players = sides.get('team2', {}).get('players', [])

    rank_map = {p['name']: i + 1 for i, p in enumerate(ranked_players)}

    conflicts = []
    for p1 in t1_players:
        for p2 in t2_players:
            combined = p1['swing'] + p2['swing']
            if combined < 8:
                continue  # not interesting enough

            r1 = rank_map.get(p1['name'], 99)
            r2 = rank_map.get(p2['name'], 99)

            if p1.get('champ_at_stake') and p2.get('champ_at_stake'):
                ctype = 'champ_vs_champ'
            elif min(r1, r2) == 1:
                ctype = 'leader_vs_challenger'
            else:
                ctype = 'rival'

            conflicts.append({
                'player_a': p1['name'],
                'player_b': p2['name'],
                'a_side':   sides['team1']['team'],
                'b_side':   sides['team2']['team'],
                'combined_swing': round(combined, 1),
                'type': ctype,
            })

    # Sort by combined swing
    conflicts.sort(key=lambda c: -c['combined_swing'])
    return conflicts[:3]  # top 3 conflicts per game


# ── Main Build Function ───────────────────────────────────────────────────────

def build_game_map(
    leverage_games:  list,
    games_by_slot:   dict,
    enriched_stats:  dict,
    narrative_type:  str,
    just_finished:   str,
    recent_feed:     list,
    players:         list,
    cycle_time:      datetime | None = None,
) -> dict:
    """
    Build the full game map for this cycle.

    Returns:
    {
      'games':          [game_map_entry, ...],
      'trigger_game_id': int | None,
      'cycle_time':     str,
    }
    """
    cycle_time = cycle_time or datetime.now(timezone.utc)

    # Ranked players (by current win prob, then points)
    ranked_players = sorted(
        [{'name': name, **stats} for name, stats in enriched_stats.items()],
        key=lambda p: (-p.get('win_prob', 0), -p.get('points', 0)),
    )

    # Coverage history per game
    coverage_history = load_coverage_history(recent_feed, leverage_games)

    # Trigger game
    trigger_id = detect_trigger_game(
        leverage_games, narrative_type, just_finished, games_by_slot,
    )

    game_entries = []

    for g in leverage_games:
        slot    = g['id']
        game_db = games_by_slot.get(slot, {})
        teams   = game_db.get('teams') or {}
        status  = game_db.get('status', 'pending')

        # Normalize status
        if game_db.get('winner'):
            status = 'final'
        elif status == 'live':
            status = 'live'
        elif status in ('pending', ''):
            status = 'upcoming'
        # "tomorrow" classification is handled in display only

        game_note = teams.get('gameNote') or g.get('gameNote') or ''
        game_time = teams.get('gameTime') or g.get('gameTime') or ''
        game_phase = parse_game_phase(game_note, status)

        # Score string
        score = None
        if status in ('live', 'final') and (teams.get('score1') is not None):
            s1 = teams.get('score1', '')
            s2 = teams.get('score2', '')
            clock = f' ({game_note})' if game_note and status == 'live' else ''
            score = f"{s1}-{s2}{clock}"

        # Compute sides with directional impact
        sides = build_sides(g, enriched_stats)

        # Aggregate swing (mean of all player swings, avoids double-counting)
        all_swings = [p['swing'] for p in sides['team1']['players'] + sides['team2']['players']]
        aggregate_swing = round(sum(all_swings) / 2, 1) if all_swings else 0.0

        # Pool importance
        champ_picks = sum(
            1 for p in sides['team1']['players'] + sides['team2']['players']
            if p.get('champ_at_stake')
        )
        if aggregate_swing >= IMPORTANCE_THRESHOLDS['CRITICAL'] or (champ_picks >= 1 and ranked_players and
                any(p.get('champ_at_stake') for p in sides['team1']['players'] + sides['team2']['players']
                    if p['name'] == ranked_players[0]['name'])):
            importance = 'CRITICAL'
        elif aggregate_swing >= IMPORTANCE_THRESHOLDS['HIGH'] or champ_picks >= 2:
            importance = 'HIGH'
        elif aggregate_swing >= IMPORTANCE_THRESHOLDS['MEDIUM'] or any(
            p['swing'] >= 15 for p in sides['team1']['players'] + sides['team2']['players']
        ):
            importance = 'MEDIUM'
        else:
            importance = 'LOW'

        # Coverage budget remaining
        hist = coverage_history.get(slot, {'times_today': 0, 'last_covered_at': None,
                                           'last_covered_score': ''})
        budget_total = COVERAGE_BUDGETS[importance]
        budget_remaining = max(0, budget_total - hist['times_today'])

        # Last covered time delta in minutes
        last_covered_mins = None
        if hist['last_covered_at']:
            delta = cycle_time - hist['last_covered_at'].replace(tzinfo=timezone.utc) \
                    if hist['last_covered_at'].tzinfo is None \
                    else cycle_time - hist['last_covered_at']
            last_covered_mins = int(delta.total_seconds() / 60)

        # Consensus
        pick_pct1 = g.get('pickPct1', 50)
        consensus_team = g.get('team1', '') if pick_pct1 >= 50 else g.get('team2', '')
        consensus_pct  = max(pick_pct1, 100 - pick_pct1)

        # Story type
        story_type = classify_story_type(
            sides, consensus_pct, game_phase, aggregate_swing, ranked_players,
        )

        # Conflicts
        conflicts = detect_conflicts(sides, enriched_stats, ranked_players)

        # Headline for planner context
        t1 = g.get('team1', '')
        t2 = g.get('team2', '')
        rnd = g.get('round', '')
        if status == 'live':
            headline = f"{t1} vs {t2} | {rnd} | LIVE {score or ''} — {story_type.replace('_', ' ').upper()}"
        elif status == 'final':
            winner = game_db.get('winner', '?')
            headline = f"{t1} vs {t2} | {rnd} | FINAL — {winner} wins. {story_type.replace('_', ' ').upper()}"
        else:
            headline = f"{t1} vs {t2} | {rnd} | {game_time or 'upcoming'} — {story_type.replace('_', ' ').upper()}"

        game_entries.append({
            'game_id':            slot,
            'matchup':            f"{t1} vs {t2}",
            'team1':              t1,
            'team2':              t2,
            'round':              rnd,
            'status':             status,
            'is_trigger':         slot == trigger_id,
            'score':              score,
            'game_note':          game_note,
            'game_time':          game_time,
            'game_phase':         game_phase,
            'winner':             game_db.get('winner'),

            # Importance
            'pool_importance':    importance,
            'aggregate_swing':    aggregate_swing,
            'pool_consensus_pct': consensus_pct,
            'pool_consensus_team': consensus_team,

            # Coverage
            'coverage_budget':     budget_remaining,
            'coverage_budget_total': budget_total,
            'times_covered_today': hist['times_today'],
            'last_covered_at':     hist['last_covered_at'],
            'last_covered_mins':   last_covered_mins,
            'last_covered_score':  hist['last_covered_score'],

            # Sides
            'sides':               sides,
            'conflicts':           conflicts,

            # Narrative
            'story_type':          story_type,
            'headline':            headline,
        })

    # Sort: live first, then final, then upcoming
    order = {'live': 0, 'final': 1, 'upcoming': 2}
    game_entries.sort(key=lambda g: (order.get(g['status'], 3), -g['aggregate_swing']))

    return {
        'games':           game_entries,
        'trigger_game_id': trigger_id,
        'cycle_time':      cycle_time.isoformat(),
    }


def get_game(game_map: dict, game_id: int) -> dict | None:
    """Look up a game entry by slot id."""
    for g in game_map.get('games', []):
        if g['game_id'] == game_id:
            return g
    return None
