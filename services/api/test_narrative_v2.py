"""
Test harness for v2 narrative pipeline.

Runs 10 synthetic scenarios against the live planner + writer.
No database required — passes None for supabase_client.
Prints full output for each scenario.

Usage:
    python3 api/test_narrative_v2.py
    python3 api/test_narrative_v2.py --scenario 3       # run only scenario 3
    python3 api/test_narrative_v2.py --planner-only     # skip writer (faster)
"""

from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from narrative_v2.pipeline import run_narrative_v2

# ── Shared helpers ─────────────────────────────────────────────────────────────

def player(name, rank, points, ppr, win_prob, win_prob_delta,
           prize, champ, champ_alive,
           lev=None, prev_wp=None):
    """Build a synthetic enriched_stats entry."""
    return {
        'rank': rank,
        'points': points,
        'ppr': ppr,
        'win_prob': win_prob,
        'win_prob_delta': win_prob_delta,
        'any_prize_prob': prize,
        'no_prize_prob': 100 - prize,
        'champ_pick': champ,
        'champ_alive': champ_alive,
        'trajectory': 'rising' if win_prob_delta > 0 else ('falling' if win_prob_delta < 0 else 'flat'),
        'personal_leverage': lev or [],
        'finish_place_probs': {},
        'correct_by_round': {},
        'eliminated_by_round': {},
        'alive_by_round': {},
        'region_health': {},
        'unique_picks': [],
        'best_upside': {'label': '', 'delta': 0},
        'worst_threat': {'label': '', 'delta': 0},
        'ppr': ppr,
    }


def ctx(live=None, upcoming=None, n_final=60, n_today=0, rnd='F4'):
    """Build a synthetic tournament_context."""
    return {
        'day_number': 12,
        'current_round': rnd,
        'n_final': n_final,
        'n_today_upcoming': n_today,
        'live_games': live or [],
        'today_upcoming': upcoming or [],
        'yesterday_finals': [],
        'upsets': [],
        'is_day_one': False,
    }


def run(label, scenario_fn, **kwargs):
    """Run one scenario and print results."""
    print(f'\n{"="*70}')
    print(f'SCENARIO: {label}')
    print('='*70)

    enriched, prev_enriched, tournament_context, leverage_games, \
        narrative_type, just_finished, pool_size, prize_places, players = scenario_fn()

    entries, usage = run_narrative_v2(
        enriched_stats=enriched,
        prev_enriched_stats=prev_enriched,
        tournament_context=tournament_context,
        leverage_games=leverage_games,
        narrative_type=narrative_type,
        just_finished=just_finished,
        pool_size=pool_size,
        prize_places=prize_places,
        valid_player_names=players,
        supabase_client=None,
        pool_id=None,
        planner_model=kwargs.get('planner_model', 'gpt-5.5'),
        writer_model=kwargs.get('writer_model', 'gpt-5.5'),
        dry_run=True,
    )

    print(f'\nResult: {len(entries)} entries posted')
    if not entries:
        print(f'Suppressed. Usage: planner={usage["planner_input_tokens"]}+{usage["planner_output_tokens"]} tokens, {usage["total_latency_ms"]}ms')
        if usage.get('suppression_reason'):
            print(f'Reason: {usage["suppression_reason"]}')
    else:
        total_tokens = usage["planner_input_tokens"] + usage["planner_output_tokens"] + \
                       usage["writer_input_tokens"] + usage["writer_output_tokens"]
        print(f'Usage: {total_tokens} total tokens, {usage["total_latency_ms"]}ms')
        for e in entries:
            words = len(e["content"].split())
            print(f'\n  [{e["persona"]} → {e["player_name"]}] ({words}w)')
            print(f'  {e["content"]}')

    return entries, usage


# ── Scenarios ──────────────────────────────────────────────────────────────────

def scenario_1_champ_eliminated():
    """Champion pick just got eliminated — biggest narrative event."""
    players = ['Alice', 'Bob', 'Carol', 'Dave']
    enriched = {
        'Alice': player('Alice', 1, 800, 480, 45.0, -22.0, 75, 'Duke', False,
                        prev_wp=67.0),
        'Bob':   player('Bob',   2, 780, 480, 30.0, +5.0,  60, 'Arizona', True),
        'Carol': player('Carol', 3, 720, 480, 20.0, +8.0,  45, 'Arizona', True),
        'Dave':  player('Dave',  4, 650, 480,  5.0, +9.0,  20, 'Michigan', True),
    }
    prev_enriched = {
        'Alice': player('Alice', 1, 800, 480, 67.0, 0, 85, 'Duke', True),
        'Bob':   player('Bob',   2, 780, 480, 25.0, 0, 55, 'Arizona', True),
        'Carol': player('Carol', 3, 720, 480, 12.0, 0, 38, 'Arizona', True),
        'Dave':  player('Dave',  4, 650, 480, -4.0, 0, 11, 'Michigan', True),
    }
    return (enriched, prev_enriched,
            ctx(n_final=60), [],
            'game_end',
            'Arizona Wildcats def. Duke Blue Devils 78-72',
            4, [1, 2], players)


def scenario_2_leader_change():
    """New pool leader emerges after a game."""
    players = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve']
    enriched = {
        'Alice': player('Alice', 2, 840, 320, 22.0, -8.0, 55, 'Michigan', True),
        'Bob':   player('Bob',   1, 860, 320, 38.0, +15.0, 70, 'Arizona', True),
        'Carol': player('Carol', 3, 780, 320, 18.0, -2.0, 42, 'UConn', True),
        'Dave':  player('Dave',  4, 700, 320, 12.0, -5.0, 30, 'Purdue', True),
        'Eve':   player('Eve',   5, 600, 320,  8.0, -1.0, 20, 'Duke', False),
    }
    prev_enriched = {
        'Alice': player('Alice', 1, 840, 320, 30.0, 0, 62, 'Michigan', True),
        'Bob':   player('Bob',   2, 860, 320, 23.0, 0, 55, 'Arizona', True),
        'Carol': player('Carol', 3, 780, 320, 20.0, 0, 44, 'UConn', True),
        'Dave':  player('Dave',  4, 700, 320, 17.0, 0, 35, 'Purdue', True),
        'Eve':   player('Eve',   5, 600, 320,  9.0, 0, 21, 'Duke', False),
    }
    return (enriched, prev_enriched,
            ctx(n_final=60), [],
            'game_end',
            'Arizona Wildcats def. Michigan Wolverines 81-74',
            5, [1, 2, 3], players)


def scenario_3_live_rooting():
    """Live game with high leverage — rooting direction for multiple players."""
    lev_alice = [{'matchup': 'Arizona vs Illinois', 'swing': 28.5,
                  'root_for': 'Arizona', 'game_time': 'halftime, ARI 38-30'}]
    lev_bob   = [{'matchup': 'Arizona vs Illinois', 'swing': 18.2,
                  'root_for': 'Illinois', 'game_time': 'halftime, ARI 38-30'}]
    players = ['Alice', 'Bob', 'Carol', 'Dave']
    enriched = {
        'Alice': player('Alice', 1, 720, 640, 42.0, 0, 75, 'Arizona', True, lev=lev_alice),
        'Bob':   player('Bob',   2, 700, 640, 28.0, 0, 60, 'Illinois', True, lev=lev_bob),
        'Carol': player('Carol', 3, 680, 640, 20.0, 0, 45, 'UConn', True),
        'Dave':  player('Dave',  4, 600, 640, 10.0, 0, 22, 'Purdue', True),
    }
    leverage_games = [{
        'team1': 'Arizona', 'team2': 'Illinois',
        'matchup': 'Arizona vs Illinois',
        'leverage': 35.0,
        'pickPct1': 45,
        'status': 'live',
        'gameTime': 'Halftime, ARI 38-30',
        'playerImpacts': [
            {'player': 'Alice', 'rootFor': 'Arizona', 'swing': 28.5},
            {'player': 'Bob',   'rootFor': 'Illinois', 'swing': 18.2},
        ]
    }]
    return (enriched, enriched,
            ctx(live=['Arizona vs Illinois — Halftime, ARI leads 38-30']),
            leverage_games,
            'deep_dive',
            '',
            4, [1, 2], players)


def scenario_4_player_eliminated():
    """Player just went to 0% — elimination event."""
    players = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank']
    enriched = {
        'Alice': player('Alice', 1, 900, 320, 48.0, +3.0, 80, 'Michigan', True),
        'Bob':   player('Bob',   2, 850, 320, 35.0, +2.0, 65, 'Arizona', True),
        'Carol': player('Carol', 3, 780, 320, 17.0, +5.0, 45, 'UConn', True),
        'Dave':  player('Dave',  4, 700, 320,  0.0, -18.0, 0, 'Duke', False,
                        prev_wp=18.0),
        'Eve':   player('Eve',   5, 650, 320,  0.0,  0.0,  0, 'Iowa St', False),
        'Frank': player('Frank', 6, 580, 320,  0.0,  0.0,  0, 'Nebraska', False),
    }
    prev_enriched = {
        'Alice': player('Alice', 1, 900, 320, 45.0, 0, 78, 'Michigan', True),
        'Bob':   player('Bob',   2, 850, 320, 33.0, 0, 63, 'Arizona', True),
        'Carol': player('Carol', 3, 780, 320, 12.0, 0, 40, 'UConn', True),
        'Dave':  player('Dave',  4, 700, 320, 18.0, 0, 32, 'Duke', False),
        'Eve':   player('Eve',   5, 650, 320,  0.0, 0,  0, 'Iowa St', False),
        'Frank': player('Frank', 6, 580, 320,  0.0, 0,  0, 'Nebraska', False),
    }
    return (enriched, prev_enriched,
            ctx(n_final=60), [],
            'game_end',
            'Michigan Wolverines def. Duke Blue Devils 88-71',
            6, [1, 2, 3], players)


def scenario_5_overnight_briefing():
    """Overnight cycle — morning briefing before today's games."""
    players = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve']
    lev_alice = [{'matchup': 'Michigan vs UConn', 'swing': 22.0,
                  'root_for': 'Michigan', 'game_time': '7:00 PM ET'}]
    lev_bob   = [{'matchup': 'Michigan vs UConn', 'swing': 14.0,
                  'root_for': 'UConn', 'game_time': '7:00 PM ET'}]
    enriched = {
        'Alice': player('Alice', 1, 760, 640, 38.0, 0, 72, 'Michigan', True, lev=lev_alice),
        'Bob':   player('Bob',   2, 740, 640, 28.0, 0, 60, 'UConn', True, lev=lev_bob),
        'Carol': player('Carol', 3, 700, 640, 22.0, 0, 50, 'Arizona', True),
        'Dave':  player('Dave',  4, 650, 640, 12.0, 0, 28, 'Purdue', True),
        'Eve':   player('Eve',   5, 500, 640,  0.0, 0,  0, 'Duke', False),
    }
    return (enriched, None,
            ctx(upcoming=['Michigan vs UConn — 7:00 PM ET',
                          'Arizona vs Illinois — 9:30 PM ET'],
                n_today=2, n_final=58),
            [],
            'overnight',
            '',
            5, [1, 2], players)


def scenario_6_prize_locked():
    """Prize position just locked in — a player guaranteed top-3."""
    players = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace']
    enriched = {
        'Alice': player('Alice', 1, 1100, 160, 55.0, 0, 100, 'Michigan', True),
        'Bob':   player('Bob',   2, 1020, 160, 30.0, 0, 100, 'Arizona', True),
        'Carol': player('Carol', 3,  940, 160, 15.0, +8.0, 100, 'UConn', True),
        'Dave':  player('Dave',  4,  820, 160,  0.0, -15.0,  0, 'Duke', False),
        'Eve':   player('Eve',   5,  750, 160,  0.0,  0.0,   0, 'Iowa St', False),
        'Frank': player('Frank', 6,  700, 160,  0.0,  0.0,   0, 'Nebraska', False),
        'Grace': player('Grace', 7,  650, 160,  0.0,  0.0,   0, 'Purdue', False),
    }
    prev_enriched = {
        'Alice': player('Alice', 1, 1100, 160, 55.0, 0, 90, 'Michigan', True),
        'Bob':   player('Bob',   2, 1020, 160, 30.0, 0, 82, 'Arizona', True),
        'Carol': player('Carol', 3,  940, 160,  7.0, 0, 75, 'UConn', True),
        'Dave':  player('Dave',  4,  820, 160, 15.0, 0, 40, 'Duke', False),
        'Eve':   player('Eve',   5,  750, 160,  0.0, 0,  0, 'Iowa St', False),
        'Frank': player('Frank', 6,  700, 160,  0.0, 0,  0, 'Nebraska', False),
        'Grace': player('Grace', 7,  650, 160,  0.0, 0,  0, 'Purdue', False),
    }
    enriched['Carol']['finish_place_probs'] = {'3': 100}
    enriched['Carol']['any_prize_prob'] = 100
    return (enriched, prev_enriched,
            ctx(n_final=62), [],
            'game_end',
            'UConn Huskies def. Duke Blue Devils 73-72',
            7, [1, 2, 3], players)


def scenario_7_twin_cluster():
    """Two players are identical — cluster should avoid mirror commentary."""
    players = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank']
    enriched = {
        'Alice': player('Alice', 1, 900, 320, 36.0, +4.0, 70, 'Michigan', True),
        'Bob':   player('Bob',   2, 810, 320, 21.5, +2.0, 48, 'Arizona', True),
        'Carol': player('Carol', 3, 810, 320, 21.5, +2.0, 48, 'Arizona', True),  # identical to Bob
        'Dave':  player('Dave',  4, 780, 320, 15.0, -1.0, 35, 'UConn', True),
        'Eve':   player('Eve',   5, 650, 320,  6.0, -3.0, 14, 'Purdue', True),
        'Frank': player('Frank', 6, 500, 320,  0.0,  0.0,  0, 'Duke', False),
    }
    prev_enriched = {
        'Alice': player('Alice', 1, 900, 320, 32.0, 0, 65, 'Michigan', True),
        'Bob':   player('Bob',   2, 810, 320, 19.5, 0, 45, 'Arizona', True),
        'Carol': player('Carol', 3, 810, 320, 19.5, 0, 45, 'Arizona', True),
        'Dave':  player('Dave',  4, 780, 320, 16.0, 0, 36, 'UConn', True),
        'Eve':   player('Eve',   5, 650, 320,  9.0, 0, 18, 'Purdue', True),
        'Frank': player('Frank', 6, 500, 320,  0.0, 0,  0, 'Duke', False),
    }
    return (enriched, prev_enriched,
            ctx(n_final=60), [],
            'game_end',
            'Michigan Wolverines def. Illinois Fighting Illini 91-78',
            6, [1, 2, 3], players)


def scenario_8_alert_win_prob_surge():
    """Alert trigger — player surged 15% mid-game."""
    lev = [{'matchup': 'Arizona vs Purdue', 'swing': 35.0,
             'root_for': 'Arizona', 'game_time': 'Final'}]
    players = ['Alice', 'Bob', 'Carol', 'Dave']
    enriched = {
        'Alice': player('Alice', 2, 720, 320, 52.0, +18.0, 85, 'Arizona', True, lev=lev),
        'Bob':   player('Bob',   1, 750, 320, 30.0, -12.0, 55, 'Purdue', True),
        'Carol': player('Carol', 3, 680, 320, 15.0,  +2.0, 35, 'Michigan', True),
        'Dave':  player('Dave',  4, 600, 320,  3.0,  -8.0, 10, 'UConn', True),
    }
    prev_enriched = {
        'Alice': player('Alice', 2, 720, 320, 34.0, 0, 62, 'Arizona', True),
        'Bob':   player('Bob',   1, 750, 320, 42.0, 0, 72, 'Purdue', True),
        'Carol': player('Carol', 3, 680, 320, 13.0, 0, 33, 'Michigan', True),
        'Dave':  player('Dave',  4, 600, 320, 11.0, 0, 18, 'UConn', True),
    }
    return (enriched, prev_enriched,
            ctx(n_final=61), [],
            'alert',
            'Arizona Wildcats def. Purdue Boilermakers 79-68',
            4, [1, 2], players)


def scenario_9_all_positions_locked():
    """All positions settled — planner should suppress."""
    players = ['Alice', 'Bob', 'Carol']
    enriched = {
        'Alice': player('Alice', 1, 1200, 0, 100.0, 0, 100, 'Michigan', True),
        'Bob':   player('Bob',   2,  900, 0,   0.0, 0, 100, 'Duke', False),
        'Carol': player('Carol', 3,  800, 0,   0.0, 0, 100, 'Arizona', False),
    }
    enriched['Alice']['finish_place_probs'] = {'1': 100}
    enriched['Bob']['finish_place_probs'] = {'2': 100}
    enriched['Carol']['finish_place_probs'] = {'3': 100}
    return (enriched, enriched,
            ctx(n_final=63), [],
            'game_end',
            '',
            3, [1, 2, 3], players)


def scenario_10_contention_entered():
    """Player just crossed into contention (win prob crossed 10%)."""
    players = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace', 'Hank']
    enriched = {
        'Alice': player('Alice', 1, 950, 480, 30.0, +3.0, 65, 'Michigan', True),
        'Bob':   player('Bob',   2, 890, 480, 22.0, +2.0, 55, 'Arizona', True),
        'Carol': player('Carol', 3, 820, 480, 18.0, +1.0, 45, 'UConn', True),
        'Dave':  player('Dave',  4, 760, 480, 13.0, +7.0, 35, 'Illinois', True),  # just entered
        'Eve':   player('Eve',   5, 700, 480,  8.0, -5.0, 20, 'Purdue', True),   # just exited
        'Frank': player('Frank', 6, 640, 480,  5.0, -2.0, 12, 'Tennessee', True),
        'Grace': player('Grace', 7, 580, 480,  3.0, -3.0,  8, 'Duke', False),
        'Hank':  player('Hank',  8, 500, 480,  1.0, -3.0,  3, 'Nebraska', False),
    }
    prev_enriched = {
        'Alice': player('Alice', 1, 950, 480, 27.0, 0, 62, 'Michigan', True),
        'Bob':   player('Bob',   2, 890, 480, 20.0, 0, 53, 'Arizona', True),
        'Carol': player('Carol', 3, 820, 480, 17.0, 0, 44, 'UConn', True),
        'Dave':  player('Dave',  4, 760, 480,  6.0, 0, 28, 'Illinois', True),  # was below 10%
        'Eve':   player('Eve',   5, 700, 480, 13.0, 0, 30, 'Purdue', True),   # was above 5%
        'Frank': player('Frank', 6, 640, 480,  7.0, 0, 14, 'Tennessee', True),
        'Grace': player('Grace', 7, 580, 480,  6.0, 0, 10, 'Duke', False),
        'Hank':  player('Hank',  8, 500, 480,  4.0, 0,  6, 'Nebraska', False),
    }
    return (enriched, prev_enriched,
            ctx(n_final=60), [],
            'game_end',
            'Illinois Fighting Illini def. Tennessee Volunteers 82-75',
            8, [1, 2, 3], players)


# ── Main ───────────────────────────────────────────────────────────────────────

SCENARIOS = [
    ('1. Champion pick eliminated',         scenario_1_champ_eliminated),
    ('2. Leader change',                    scenario_2_leader_change),
    ('3. Live game — rooting direction',    scenario_3_live_rooting),
    ('4. Player fully eliminated (0%)',     scenario_4_player_eliminated),
    ('5. Overnight briefing',               scenario_5_overnight_briefing),
    ('6. Prize position locked',            scenario_6_prize_locked),
    ('7. Twin cluster — avoid mirrors',     scenario_7_twin_cluster),
    ('8. Alert — win prob surge',           scenario_8_alert_win_prob_surge),
    ('9. All positions locked — suppress',  scenario_9_all_positions_locked),
    ('10. Player enters contention',        scenario_10_contention_entered),
]

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--scenario', type=int, default=0,
                        help='Run only this scenario number (1-10). Default: run all.')
    parser.add_argument('--planner-only', action='store_true',
                        help='Skip writer calls (faster, cheaper)')
    args = parser.parse_args()

    writer_model = None if args.planner_only else 'gpt-5.5'

    if not (os.environ.get('OPENAI_API_KEY') or os.environ.get('ANTHROPIC_API_KEY')):
        print('ERROR: OPENAI_API_KEY or ANTHROPIC_API_KEY not set', file=sys.stderr)
        sys.exit(1)

    to_run = [(label, fn) for label, fn in SCENARIOS
              if args.scenario == 0 or int(label.split('.')[0]) == args.scenario]

    if not to_run:
        print(f'No scenario {args.scenario} found.')
        sys.exit(1)

    results = []
    for label, fn in to_run:
        entries, usage = run(label, fn,
                             planner_model='gpt-5.5',
                             writer_model=writer_model or 'gpt-5.5')
        results.append({
            'scenario': label,
            'posted': len(entries) > 0,
            'entry_count': len(entries),
            'planner_tokens': usage['planner_input_tokens'] + usage['planner_output_tokens'],
            'writer_tokens': usage['writer_input_tokens'] + usage['writer_output_tokens'],
            'latency_ms': usage['total_latency_ms'],
        })

    print(f'\n{"="*70}')
    print('SUMMARY')
    print('='*70)
    for r in results:
        status = f'{r["entry_count"]} entries' if r['posted'] else 'SUPPRESSED'
        print(f'  {r["scenario"][:40]:<42} {status:<15} '
              f'planner:{r["planner_tokens"]:>4}tok  '
              f'writer:{r["writer_tokens"]:>4}tok  '
              f'{r["latency_ms"]:>5}ms')
