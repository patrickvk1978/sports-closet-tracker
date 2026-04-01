"""
Bracket Biography thesis generator.

Generates Sonnet-polished 2-3 sentence biographies for each player in a pool.
Stores results in sim_results.biography_theses jsonb column.

Usage:
    python api/biography_writer.py --pool-id <UUID>
    python api/biography_writer.py --pool-id <UUID> --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))

BIOGRAPHY_SYSTEM_PROMPT = """You are a sportswriter crafting a 2-3 sentence retrospective biography for a March Madness bracket pool player. Think of it as the opening paragraph of a magazine profile — vivid, specific, with a narrative arc.

## Rules

1. Write exactly 2-3 sentences. No more.
2. Lead with the most interesting or defining aspect of their bracket.
3. Reference specific teams, rounds, and moments — never be generic.
4. Use active voice and strong verbs. No cliches like "at the end of the day" or "when the dust settled."
5. If they won the pool, celebrate it but note the pivotal moment that sealed it.
6. If they lost, identify the tension between what they got right and what broke.
7. Do not use emojis, hashtags, or exclamation marks.
8. Tone: smart, warm, slightly wry — like a good sports column, not a stats report.

Return ONLY the biography text. No JSON, no labels, no explanation."""


def build_player_brief(name, stats):
    """Build a compact brief for the Sonnet call."""
    lines = [f"Player: {name}"]
    lines.append(f"Final rank: #{stats['rank']} of {stats['pool_size']}")
    lines.append(f"Points: {stats['points']} | PPR: {stats['ppr']}")
    lines.append(f"Win probability: {stats['win_prob']:.1f}%")
    lines.append(f"Championship pick: {stats['champ_pick']} ({'alive' if stats['champ_alive'] else 'eliminated'})")
    lines.append(f"Archetype: {stats['archetype']}")

    if stats.get('correct_calls'):
        calls = stats['correct_calls'][:3]
        lines.append("Rarest correct picks: " + "; ".join(
            f"{c['team']} {c['round']} (only {c['correct_count']}/{c['total_players']} had this)"
            for c in calls
        ))

    if stats.get('the_turn'):
        t = stats['the_turn']
        if t.get('is_closest_call'):
            lines.append(f"Closest call: {t['team']} won by {t['margin']} in {t['round']}")
        else:
            lines.append(
                f"The Turn: picked {t['team']} but {t['winner']} won in {t['round']} — "
                f"{t['total_damage']} pts total damage ({t['downstream_slots']} downstream picks lost)"
            )

    if stats.get('round_accuracy'):
        acc = ", ".join(f"{r['round']}:{r['accuracy']}%" for r in stats['round_accuracy'] if r['total'] > 0)
        lines.append(f"Accuracy by round: {acc}")

    return "\n".join(lines)


def compute_archetype(player_picks, all_brackets, games_by_slot, pool_size):
    """Simplified Python version of the JS computeArchetype."""
    if pool_size < 2:
        return "The Bracket Maker"

    # Average pick frequency
    freq_sum = 0
    freq_count = 0
    for slot in range(63):
        pick = player_picks[slot] if slot < len(player_picks) else None
        if not pick:
            continue
        others = sum(1 for b in all_brackets if b[slot] == pick)
        freq_sum += others / pool_size
        freq_count += 1
    avg_freq = freq_sum / freq_count if freq_count > 0 else 0.5

    # Average seed of F4+Champ picks
    late_slots = [60, 61, 62]
    seed_sum = 0
    seed_count = 0
    for slot in late_slots:
        pick = player_picks[slot] if slot < len(player_picks) else None
        if not pick:
            continue
        for g in games_by_slot.values():
            if g.get('team1') == pick and g.get('seed1'):
                seed_sum += g['seed1']
                seed_count += 1
                break
            elif g.get('team2') == pick and g.get('seed2'):
                seed_sum += g['seed2']
                seed_count += 1
                break
    avg_late_seed = seed_sum / seed_count if seed_count > 0 else 8

    # Upset picks
    SLOT_ROUND = {}
    for base in [0, 15, 30, 45]:
        for i in range(8): SLOT_ROUND[base + i] = 'R64'
        for i in range(8, 12): SLOT_ROUND[base + i] = 'R32'
        for i in range(12, 14): SLOT_ROUND[base + i] = 'S16'
        SLOT_ROUND[base + 14] = 'E8'
    SLOT_ROUND[60] = 'F4'
    SLOT_ROUND[61] = 'F4'
    SLOT_ROUND[62] = 'Champ'

    upset_picks = 0
    for slot in range(63):
        if SLOT_ROUND.get(slot) == 'R64':
            continue
        pick = player_picks[slot] if slot < len(player_picks) else None
        if not pick:
            continue
        g = games_by_slot.get(slot)
        if not g or not g.get('seed1') or not g.get('seed2'):
            continue
        picked_seed = g['seed1'] if g['team1'] == pick else g['seed2'] if g['team2'] == pick else None
        other_seed = g['seed2'] if g['team1'] == pick else g['seed1'] if g['team2'] == pick else None
        if picked_seed and other_seed and picked_seed > other_seed:
            upset_picks += 1

    if upset_picks >= 8:
        return "The Chaos Agent"
    if avg_late_seed <= 2.5:
        return "The Chalk Walker"
    if avg_freq <= 0.35:
        return "The Contrarian"
    if avg_freq >= 0.6:
        return "The Hedger"
    return "The Bracket Maker"


def compute_correct_calls(player_picks, all_brackets, games_by_slot, pool_size):
    """Find rarest correct picks."""
    ROUND_POINTS = {'R64': 10, 'R32': 20, 'S16': 40, 'E8': 80, 'F4': 160, 'Champ': 320}
    SLOT_ROUND = {}
    for base in [0, 15, 30, 45]:
        for i in range(8): SLOT_ROUND[base + i] = 'R64'
        for i in range(8, 12): SLOT_ROUND[base + i] = 'R32'
        for i in range(12, 14): SLOT_ROUND[base + i] = 'S16'
        SLOT_ROUND[base + 14] = 'E8'
    SLOT_ROUND[60] = 'F4'
    SLOT_ROUND[61] = 'F4'
    SLOT_ROUND[62] = 'Champ'

    results = []
    for slot in range(63):
        g = games_by_slot.get(slot)
        if not g or g.get('status') != 'final' or not g.get('winner'):
            continue
        pick = player_picks[slot] if slot < len(player_picks) else None
        if pick != g['winner']:
            continue

        correct_count = sum(1 for b in all_brackets if b[slot] == g['winner'])
        rarity = 1 - (correct_count / pool_size)
        point_value = ROUND_POINTS.get(SLOT_ROUND.get(slot, ''), 0)
        impact = rarity * point_value

        results.append({
            'team': g['winner'],
            'round': SLOT_ROUND.get(slot, ''),
            'correct_count': correct_count,
            'total_players': pool_size,
            'rarity': rarity,
            'impact': impact,
        })

    results.sort(key=lambda x: -x['impact'])
    return results[:5]


def compute_the_turn(player_picks, games_by_slot, player_rank):
    """Find wrong pick with most downstream damage."""
    ROUND_POINTS = {'R64': 10, 'R32': 20, 'S16': 40, 'E8': 80, 'F4': 160, 'Champ': 320}
    SLOT_ROUND = {}
    for base in [0, 15, 30, 45]:
        for i in range(8): SLOT_ROUND[base + i] = 'R64'
        for i in range(8, 12): SLOT_ROUND[base + i] = 'R32'
        for i in range(12, 14): SLOT_ROUND[base + i] = 'S16'
        SLOT_ROUND[base + 14] = 'E8'
    SLOT_ROUND[60] = 'F4'
    SLOT_ROUND[61] = 'F4'
    SLOT_ROUND[62] = 'Champ'

    # Build forward tree
    BRACKET_TREE = {}
    for base in [0, 15, 30, 45]:
        for i in range(8): BRACKET_TREE[base + i] = [None, None]
        BRACKET_TREE[base + 8] = [base + 0, base + 1]
        BRACKET_TREE[base + 9] = [base + 2, base + 3]
        BRACKET_TREE[base + 10] = [base + 4, base + 5]
        BRACKET_TREE[base + 11] = [base + 6, base + 7]
        BRACKET_TREE[base + 12] = [base + 8, base + 9]
        BRACKET_TREE[base + 13] = [base + 10, base + 11]
        BRACKET_TREE[base + 14] = [base + 12, base + 13]
    BRACKET_TREE[60] = [14, 29]
    BRACKET_TREE[61] = [44, 59]
    BRACKET_TREE[62] = [60, 61]

    forward = {s: [] for s in range(63)}
    for parent, feeders in BRACKET_TREE.items():
        for feeder in feeders:
            if feeder is not None:
                forward[feeder].append(parent)

    def collect_downstream(slot, team, visited=None):
        if visited is None:
            visited = set()
        results = []
        for parent in forward.get(slot, []):
            if parent in visited:
                continue
            visited.add(parent)
            if slot < len(player_picks) and parent < len(player_picks) and player_picks[parent] == team:
                results.append(parent)
                results.extend(collect_downstream(parent, team, visited))
        return results

    # Closest call for winner
    if player_rank == 1:
        closest = None
        for slot in range(63):
            g = games_by_slot.get(slot)
            if not g or g.get('status') != 'final' or not g.get('winner'):
                continue
            pick = player_picks[slot] if slot < len(player_picks) else None
            if pick != g['winner']:
                continue
            s1, s2 = g.get('score1'), g.get('score2')
            if s1 is None or s2 is None:
                continue
            margin = abs(s1 - s2)
            if not closest or margin < closest['margin']:
                closest = {
                    'team': g['winner'],
                    'margin': margin,
                    'round': SLOT_ROUND.get(slot, ''),
                    'is_closest_call': True,
                    'total_damage': 0,
                    'downstream_slots': 0,
                }
        return closest

    # Standard: worst wrong pick
    worst = None
    for slot in range(63):
        g = games_by_slot.get(slot)
        if not g or g.get('status') != 'final' or not g.get('winner'):
            continue
        pick = player_picks[slot] if slot < len(player_picks) else None
        if not pick or pick == g['winner']:
            continue

        points_lost = ROUND_POINTS.get(SLOT_ROUND.get(slot, ''), 0)
        ds = collect_downstream(slot, pick)
        downstream_damage = sum(ROUND_POINTS.get(SLOT_ROUND.get(s, ''), 0) for s in ds)
        total = points_lost + downstream_damage

        if not worst or total > worst['total_damage']:
            worst = {
                'team': pick,
                'winner': g['winner'],
                'round': SLOT_ROUND.get(slot, ''),
                'total_damage': total,
                'downstream_slots': len(ds),
                'is_closest_call': False,
            }

    return worst


def compute_round_accuracy(player_picks, games_by_slot):
    """Per-round accuracy."""
    ROUND_POINTS = {'R64': 10, 'R32': 20, 'S16': 40, 'E8': 80, 'F4': 160, 'Champ': 320}
    SLOT_ROUND = {}
    for base in [0, 15, 30, 45]:
        for i in range(8): SLOT_ROUND[base + i] = 'R64'
        for i in range(8, 12): SLOT_ROUND[base + i] = 'R32'
        for i in range(12, 14): SLOT_ROUND[base + i] = 'S16'
        SLOT_ROUND[base + 14] = 'E8'
    SLOT_ROUND[60] = 'F4'
    SLOT_ROUND[61] = 'F4'
    SLOT_ROUND[62] = 'Champ'

    rounds = ['R64', 'R32', 'S16', 'E8', 'F4', 'Champ']
    round_games = {r: [] for r in rounds}
    for slot in range(63):
        g = games_by_slot.get(slot)
        if g and g.get('status') == 'final' and g.get('winner'):
            round_games[SLOT_ROUND.get(slot, '')].append((slot, g['winner']))

    results = []
    for r in rounds:
        rg = round_games[r]
        total = len(rg)
        correct = sum(1 for slot, winner in rg if player_picks[slot] == winner) if total > 0 else 0
        accuracy = round((correct / total) * 100) if total > 0 else 0
        results.append({'round': r, 'correct': correct, 'total': total, 'accuracy': accuracy})

    return results


def run(pool_id: str, dry_run: bool = False):
    from supabase import create_client

    url = os.environ.get('SUPABASE_URL', '')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
    api_key = os.environ.get('ANTHROPIC_API_KEY', '')

    if not url or not key:
        print('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required', file=sys.stderr)
        sys.exit(1)
    if not api_key:
        print('ERROR: ANTHROPIC_API_KEY required', file=sys.stderr)
        sys.exit(1)

    client = create_client(url, key)

    # Load pool data
    members = client.table('pool_members').select('user_id, profiles(username)').eq('pool_id', pool_id).execute().data
    brackets = client.table('brackets').select('user_id, picks').eq('pool_id', pool_id).execute().data
    games_raw = client.table('games').select('slot_index, status, winner, teams, score1, score2').execute().data
    sim = client.table('sim_results').select('player_probs, finish_probs').eq('pool_id', pool_id).order('run_at', desc=True).limit(1).execute().data

    if not members or not brackets:
        print('ERROR: No members or brackets found for this pool')
        sys.exit(1)

    # Build lookup structures
    games_by_slot = {}
    for g in games_raw:
        games_by_slot[g['slot_index']] = {
            'status': g.get('status', 'pending'),
            'winner': g.get('winner'),
            'team1': g.get('teams', {}).get('team1'),
            'team2': g.get('teams', {}).get('team2'),
            'seed1': g.get('teams', {}).get('seed1'),
            'seed2': g.get('teams', {}).get('seed2'),
            'score1': g.get('score1'),
            'score2': g.get('score2'),
        }

    brackets_by_user = {b['user_id']: b['picks'] for b in brackets}
    player_probs = (sim[0].get('player_probs') or {}) if sim else {}
    finish_probs = (sim[0].get('finish_probs') or {}) if sim else {}

    # Build player list
    players = []
    for m in members:
        username = m.get('profiles', {}).get('username', f"user_{m['user_id'][:6]}")
        picks = brackets_by_user.get(m['user_id'], [None] * 63)
        players.append({'name': username, 'picks': picks, 'user_id': m['user_id']})

    # Compute scores and ranks
    ROUND_POINTS = {'R64': 10, 'R32': 20, 'S16': 40, 'E8': 80, 'F4': 160, 'Champ': 320}
    SLOT_ROUND = {}
    for base in [0, 15, 30, 45]:
        for i in range(8): SLOT_ROUND[base + i] = 'R64'
        for i in range(8, 12): SLOT_ROUND[base + i] = 'R32'
        for i in range(12, 14): SLOT_ROUND[base + i] = 'S16'
        SLOT_ROUND[base + 14] = 'E8'
    SLOT_ROUND[60] = 'F4'
    SLOT_ROUND[61] = 'F4'
    SLOT_ROUND[62] = 'Champ'

    for p in players:
        score = 0
        ppr = 0
        eliminated = set()
        for g in games_raw:
            if (g.get('status') == 'final' or g.get('winner')) and g.get('winner'):
                t = g.get('teams', {})
                loser = t.get('team2') if t.get('team1') == g['winner'] else t.get('team1')
                if loser:
                    eliminated.add(loser)
                if p['picks'][g['slot_index']] == g['winner']:
                    score += ROUND_POINTS.get(SLOT_ROUND.get(g['slot_index'], ''), 0)
            elif not g.get('winner'):
                pick = p['picks'][g['slot_index']]
                if pick and pick not in eliminated:
                    ppr += ROUND_POINTS.get(SLOT_ROUND.get(g['slot_index'], ''), 0)
        p['points'] = score
        p['ppr'] = ppr
        p['win_prob'] = player_probs.get(p['name'], 0) * 100
        champ_pick = p['picks'][62] if len(p['picks']) > 62 else None
        p['champ_pick'] = champ_pick
        p['champ_alive'] = champ_pick is not None and champ_pick not in eliminated

    players.sort(key=lambda x: -x['points'])
    rank = 1
    for i, p in enumerate(players):
        if i > 0 and p['points'] < players[i - 1]['points']:
            rank = i + 1
        p['rank'] = rank

    pool_size = len(players)
    all_brackets = [p['picks'] for p in players]

    # Check game completion
    final_count = sum(1 for g in games_by_slot.values() if g.get('status') == 'final')
    if final_count < 63:
        print(f'Warning: Only {final_count}/63 games are final. Biographies will be based on current state.')

    # Generate theses
    import anthropic
    anthropic_client = anthropic.Anthropic(api_key=api_key)

    theses = {}
    total_tokens = 0

    for p in players:
        name = p['name']
        print(f'\n  Generating thesis for {name} (#{p["rank"]})...')

        # Compute biography data
        archetype = compute_archetype(p['picks'], all_brackets, games_by_slot, pool_size)
        correct_calls = compute_correct_calls(p['picks'], all_brackets, games_by_slot, pool_size)
        the_turn = compute_the_turn(p['picks'], games_by_slot, p['rank'])
        round_accuracy = compute_round_accuracy(p['picks'], games_by_slot)

        stats = {
            'rank': p['rank'],
            'pool_size': pool_size,
            'points': p['points'],
            'ppr': p['ppr'],
            'win_prob': p['win_prob'],
            'champ_pick': p['champ_pick'],
            'champ_alive': p['champ_alive'],
            'archetype': archetype,
            'correct_calls': correct_calls,
            'the_turn': the_turn,
            'round_accuracy': round_accuracy,
        }

        brief = build_player_brief(name, stats)
        print(f'    Brief:\n    {brief.replace(chr(10), chr(10) + "    ")}')

        if dry_run:
            theses[name] = f'[DRY RUN] Thesis for {name} would be generated here.'
            continue

        t0 = time.time()
        resp = anthropic_client.messages.create(
            model='claude-sonnet-4-20250514',
            max_tokens=200,
            system=[{
                'type': 'text',
                'text': BIOGRAPHY_SYSTEM_PROMPT,
                'cache_control': {'type': 'ephemeral'},
            }],
            messages=[{'role': 'user', 'content': brief}],
        )
        raw = resp.content[0].text.strip()
        latency = round((time.time() - t0) * 1000)
        tokens = getattr(resp.usage, 'input_tokens', 0) + getattr(resp.usage, 'output_tokens', 0)
        total_tokens += tokens

        theses[name] = raw
        print(f'    Thesis ({tokens} tokens, {latency}ms):')
        print(f'    {raw}')

    # Store
    if not dry_run and theses:
        print(f'\n  Storing {len(theses)} theses...')
        client.table('sim_results') \
            .update({'biography_theses': theses}) \
            .eq('pool_id', pool_id) \
            .execute()
        print('  Done.')

    print(f'\n  Total: {len(theses)} players, {total_tokens} tokens')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Generate bracket biography theses')
    parser.add_argument('--pool-id', required=True, help='Pool UUID')
    parser.add_argument('--dry-run', action='store_true', help='Compute stats but skip API calls')
    args = parser.parse_args()

    run(args.pool_id, dry_run=args.dry_run)
