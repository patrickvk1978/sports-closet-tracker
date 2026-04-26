"""
Post-Game Report generator.

Uses Opus to write a four-section post-game report for each player in a pool.
Stores results in sim_results.biography_theses jsonb column.

Sections per player:
  - thesis              (3-4 sentences) — defining bracket story
  - what_you_got_right  (2-3 sentences) — best/rarest correct calls
  - the_turn            (3-4 sentences) — pivotal wrong pick or closest call
  - champion_pick_story (1-2 sentences) — champ pick journey

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
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))

from llm_client import generate_structured_json

# ── Slot/Round helpers ────────────────────────────────────────────────────────

SLOT_ROUND: dict[int, str] = {}
for _base in [0, 15, 30, 45]:
    for _i in range(8):       SLOT_ROUND[_base + _i]      = 'R64'
    for _i in range(8, 12):   SLOT_ROUND[_base + _i]      = 'R32'
    for _i in range(12, 14):  SLOT_ROUND[_base + _i]      = 'S16'
    SLOT_ROUND[_base + 14] = 'E8'
SLOT_ROUND[60] = 'F4'
SLOT_ROUND[61] = 'F4'
SLOT_ROUND[62] = 'Champ'

ROUND_POINTS = {'R64': 10, 'R32': 20, 'S16': 40, 'E8': 80, 'F4': 160, 'Champ': 320}
ROUND_ORDER  = ['R64', 'R32', 'S16', 'E8', 'F4', 'Champ']

# ── System Prompt ─────────────────────────────────────────────────────────────

REPORT_SYSTEM_PROMPT = """You are a sportswriter crafting a post-game report for a March Madness bracket pool participant. Think Sports Illustrated feature — specific, warm, with a clear narrative arc. Not a dry stats report, not a color-commentator roast.

## Your report has four sections

1. **thesis** (3-4 sentences): The defining story of their bracket. Lead with the most interesting aspect. Reference specific teams and rounds. Capture the arc of their entire tournament — what made them unique, what worked, where it fell apart.

2. **what_you_got_right** (2-3 sentences): Their best bracket calls. Focus on the rarest or most impactful correct picks. Be specific about teams and rounds. Don't just list — explain why it mattered and what it says about how they built their bracket.

3. **the_turn** (3-4 sentences): The pivotal wrong pick that shaped their bracket's fate. Describe what happened, who beat them, and the downstream damage it caused. If they won the pool, write about their closest call instead — the game that almost cost them everything.

4. **champion_pick_story** (1-2 sentences): The story of their championship pick's journey. Where did it end, who was the executioner, what was the score? If still alive, what's riding on it.

## Rules

- Use second person ("you", "your") throughout all four sections
- Reference specific team names, round names (R64, R32, S16, E8, F4, Champ), and scores when available
- Do not use emojis, hashtags, or exclamation marks
- Active voice, strong verbs
- Tone: smart sportswriter — warmer than a stats dump, less hyperbolic than a hype reel
- No clichés: do not use "at the end of the day", "when the dust settled", "Cinderella run", or similar
- Do not invent numbers or scores not given in the brief

## Output

Return ONLY a JSON object (no markdown, no explanation):
{"thesis": "...", "what_you_got_right": "...", "the_turn": "...", "champion_pick_story": "..."}
"""

REPORT_RESPONSE_SCHEMA = {
    'type': 'object',
    'properties': {
        'thesis': {'type': 'string'},
        'what_you_got_right': {'type': 'string'},
        'the_turn': {'type': 'string'},
        'champion_pick_story': {'type': 'string'},
    },
    'required': ['thesis', 'what_you_got_right', 'the_turn', 'champion_pick_story'],
    'additionalProperties': False,
}


# ── Computation Functions ─────────────────────────────────────────────────────

def compute_archetype(player_picks, all_brackets, games_by_slot, pool_size):
    """Simplified Python version of the JS computeArchetype."""
    if pool_size < 2:
        return 'The Bracket Maker'

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
        other_seed  = g['seed2'] if g['team1'] == pick else g['seed1'] if g['team2'] == pick else None
        if picked_seed and other_seed and picked_seed > other_seed:
            upset_picks += 1

    # Regionalist check — 3+ of 4 E8 picks from same region (Dick Vitale)
    e8_slots = [14, 29, 44, 59]
    def slot_region(slot):
        if slot < 15: return 'Midwest'
        if slot < 30: return 'West'
        if slot < 45: return 'South'
        return 'East'
    region_counts = {}
    for slot in e8_slots:
        pick = player_picks[slot] if slot < len(player_picks) else None
        if not pick:
            continue
        for g in games_by_slot.values():
            if g.get('team1') == pick or g.get('team2') == pick:
                r = slot_region(slot)
                region_counts[r] = region_counts.get(r, 0) + 1
                break
    max_region = max(region_counts.values(), default=0)

    # Christian Laettner — same team picked to win BOTH Final Four semifinals
    # (slots 60 and 61 are opposite sides; matching them signals extreme all-in on one team)
    pick_60 = player_picks[60] if len(player_picks) > 60 else None
    pick_61 = player_picks[61] if len(player_picks) > 61 else None
    is_laettner = bool(pick_60 and pick_61 and pick_60 == pick_61)

    # Bo Kimble — chalk early, unique late
    late_slots = list(range(48, 63))  # S16 through Champ
    late_unique = sum(
        1 for s in late_slots
        if (player_picks[s] if s < len(player_picks) else None) and
           sum(1 for b in all_brackets if b[s] == player_picks[s]) == 1
    )
    late_total = sum(1 for s in late_slots if s < len(player_picks) and player_picks[s])
    late_unique_rate = late_unique / late_total if late_total > 0 else 0
    is_bo_kimble = avg_freq > 0.45 and late_unique_rate > 0.3

    if max_region >= 3:
        top_region = max(region_counts, key=region_counts.get)
        return f'Dick Vitale (loaded up on {top_region} — passion for your guys, BABY!)'
    if is_laettner:
        return 'Christian Laettner (everything rides on one team — legendary if it hits)'
    if is_bo_kimble:
        return 'Bo Kimble (safe early, swung big late — all heart, all or nothing)'
    if upset_picks >= 8:
        return f'Sister Jean ({upset_picks} upset picks — pure faith, miracles happen)'
    if avg_late_seed <= 2.5:
        return 'Coach K (blue blood royalty — always expects the best teams to win)'
    if avg_freq <= 0.35:
        return 'The Gonzaga Believer (zigged where everyone else zagged — nobody sees what you see)'
    if avg_freq >= 0.6:
        return 'Jim Boeheim (Syracuse zone energy — protect everything, grind it out)'
    return 'Jay Wright (the most complete bracket — no glaring weakness anywhere)'


def compute_correct_calls(player_picks, all_brackets, games_by_slot, pool_size):
    """Find rarest correct picks by impact (rarity × point value)."""
    results = []
    for slot in range(63):
        g = games_by_slot.get(slot)
        if not g or g.get('status') != 'final' or not g.get('winner'):
            continue
        pick = player_picks[slot] if slot < len(player_picks) else None
        if pick != g['winner']:
            continue

        correct_count = sum(1 for b in all_brackets if b[slot] == g['winner'])
        rarity     = 1 - (correct_count / pool_size)
        point_value = ROUND_POINTS.get(SLOT_ROUND.get(slot, ''), 0)
        impact     = rarity * point_value

        results.append({
            'team':          g['winner'],
            'round':         SLOT_ROUND.get(slot, ''),
            'correct_count': correct_count,
            'total_players': pool_size,
            'rarity':        rarity,
            'impact':        impact,
            'point_value':   point_value,
        })

    results.sort(key=lambda x: -x['impact'])
    return results[:5]


def compute_the_turn(player_picks, games_by_slot, player_rank):
    """Find the wrong pick with the most downstream damage (or closest call for winner)."""
    BRACKET_TREE = {}
    for base in [0, 15, 30, 45]:
        for i in range(8):   BRACKET_TREE[base + i] = [None, None]
        BRACKET_TREE[base + 8]  = [base + 0, base + 1]
        BRACKET_TREE[base + 9]  = [base + 2, base + 3]
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
                    'team':           g['winner'],
                    'margin':         margin,
                    'round':          SLOT_ROUND.get(slot, ''),
                    'is_closest_call': True,
                    'total_damage':   0,
                    'downstream_slots': 0,
                    'team1':          g.get('team1'),
                    'team2':          g.get('team2'),
                    'score1':         g.get('score1'),
                    'score2':         g.get('score2'),
                }
        return closest

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
                'team':            pick,
                'winner':          g['winner'],
                'round':           SLOT_ROUND.get(slot, ''),
                'total_damage':    total,
                'points_lost':     points_lost,
                'downstream_damage': downstream_damage,
                'downstream_slots': len(ds),
                'is_closest_call': False,
                'score1':          g.get('score1'),
                'score2':          g.get('score2'),
                'team1':           g.get('team1'),
                'team2':           g.get('team2'),
            }

    return worst


def compute_round_accuracy(player_picks, games_by_slot):
    """Per-round accuracy statistics."""
    round_games = {r: [] for r in ROUND_ORDER}
    for slot in range(63):
        g = games_by_slot.get(slot)
        if g and g.get('status') == 'final' and g.get('winner'):
            round_games[SLOT_ROUND.get(slot, '')].append((slot, g['winner']))

    results = []
    for r in ROUND_ORDER:
        rg    = round_games[r]
        total = len(rg)
        correct  = sum(1 for slot, winner in rg if player_picks[slot] == winner) if total > 0 else 0
        accuracy = round((correct / total) * 100) if total > 0 else 0
        results.append({'round': r, 'correct': correct, 'total': total, 'accuracy': accuracy})
    return results


def compute_champ_pick_journey(player_picks, games_by_slot, all_brackets, pool_size):
    """Trace the championship pick's tournament path — wins, elimination, rivals."""
    champ_pick = player_picks[62] if len(player_picks) > 62 else None
    if not champ_pick:
        return None

    # Count same-champ pickers
    same_champ_count = sum(
        1 for b in all_brackets
        if len(b) > 62 and b[62] == champ_pick
    )

    wins: list[str] = []
    elimination: dict | None = None

    for slot in range(63):
        g = games_by_slot.get(slot)
        if not g or g.get('status') != 'final':
            continue
        t1, t2 = g.get('team1'), g.get('team2')
        if champ_pick not in (t1, t2):
            continue
        winner   = g.get('winner')
        round_lbl = SLOT_ROUND.get(slot, '')
        if winner == champ_pick:
            wins.append(round_lbl)
        else:
            opponent = t2 if t1 == champ_pick else t1
            s1, s2   = g.get('score1'), g.get('score2')
            if winner == t1:
                winner_score, loser_score = s1, s2
            else:
                winner_score, loser_score = s2, s1
            elimination = {
                'round':         round_lbl,
                'eliminated_by': opponent,
                'winner_score':  winner_score,
                'loser_score':   loser_score,
            }

    furthest = max(wins, key=lambda r: ROUND_ORDER.index(r)) if wins else None

    return {
        'champ_pick':       champ_pick,
        'same_champ_count': same_champ_count,
        'pool_size':        pool_size,
        'wins':             wins,
        'furthest_win':     furthest,
        'elimination':      elimination,
        'still_alive':      elimination is None,
    }


# ── Brief Builder ─────────────────────────────────────────────────────────────

def build_player_brief(name, rank, pool_size, points, champ_pick, champ_alive,
                       archetype, correct_calls, the_turn, round_accuracy, champ_journey):
    """Build the brief that Opus will use to write the report."""
    lines = [f'Player: {name}']
    lines.append(f'Final rank: #{rank} of {pool_size}')
    lines.append(f'Points: {points}')
    lines.append(f'Archetype: {archetype}')
    lines.append(f'Championship pick: {champ_pick} ({"alive" if champ_alive else "eliminated"})')
    lines.append('')

    # Champ journey
    if champ_journey:
        cj = champ_journey
        lines.append('Champion pick journey:')
        lines.append(f'  Team: {cj["champ_pick"]}')
        lines.append(f'  Pool consensus: {cj["same_champ_count"]} of {cj["pool_size"]} had this champ')
        if cj['wins']:
            lines.append(f'  Rounds won: {", ".join(cj["wins"])}')
            lines.append(f'  Furthest: {cj["furthest_win"]}')
        if cj['elimination']:
            e = cj['elimination']
            score_str = ''
            if e.get('winner_score') and e.get('loser_score'):
                score_str = f' ({e["eliminated_by"]} {e["winner_score"]}–{e["loser_score"]})'
            lines.append(f'  Eliminated in: {e["round"]} by {e["eliminated_by"]}{score_str}')
        else:
            lines.append('  Status: still alive')
        lines.append('')

    # Rarest correct calls
    if correct_calls:
        lines.append('Best correct picks (by rarity × point value):')
        for c in correct_calls[:4]:
            lines.append(
                f'  - {c["team"]} in {c["round"]} (+{c["point_value"]} pts, '
                f'only {c["correct_count"]}/{c["total_players"]} had this)'
            )
        lines.append('')

    # The turn
    if the_turn:
        t = the_turn
        lines.append('Pivotal moment:')
        if t.get('is_closest_call'):
            score_str = f' ({t["team1"]} {t["score1"]}–{t["team2"]} {t["score2"]})'
            lines.append(f'  Closest call: {t["team"]} survived in {t["round"]} by {t["margin"]} pts{score_str}')
        else:
            s1, s2 = t.get('score1'), t.get('score2')
            score_str = f' ({t["team1"]} {s1}–{t["team2"]} {s2})' if s1 and s2 else ''
            lines.append(
                f'  Worst wrong pick: {t["team"]} in {t["round"]}{score_str} — '
                f'{t["winner"]} won'
            )
            lines.append(
                f'  Damage: {t["total_damage"]} pts total '
                f'({t["points_lost"]} here + {t["downstream_damage"]} downstream, '
                f'{t["downstream_slots"]} picks died with it)'
            )
        lines.append('')

    # Round accuracy
    acc_parts = [
        f'{r["round"]}: {r["correct"]}/{r["total"]} ({r["accuracy"]}%)'
        for r in round_accuracy if r['total'] > 0
    ]
    if acc_parts:
        lines.append('Round accuracy: ' + ' | '.join(acc_parts))

    return '\n'.join(lines)


# ── Runner ────────────────────────────────────────────────────────────────────

def run(pool_id: str, dry_run: bool = False):
    from supabase import create_client

    url     = os.environ.get('SUPABASE_URL', '')
    key     = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
    api_key = os.environ.get('OPENAI_API_KEY', '') or os.environ.get('ANTHROPIC_API_KEY', '')

    if not url or not key:
        print('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required', file=sys.stderr)
        sys.exit(1)
    if not api_key:
        print('ERROR: OPENAI_API_KEY or ANTHROPIC_API_KEY required', file=sys.stderr)
        sys.exit(1)

    client = create_client(url, key)

    # Load pool data
    members  = client.table('pool_members').select('user_id, profiles(username)').eq('pool_id', pool_id).execute().data
    brackets = client.table('brackets').select('user_id, picks').eq('pool_id', pool_id).execute().data
    games_raw = client.table('games').select('slot_index, status, winner, teams').execute().data
    sim = client.table('sim_results').select('player_probs').eq('pool_id', pool_id).order('run_at', desc=True).limit(1).execute().data

    if not members or not brackets:
        print('ERROR: No members or brackets found for this pool')
        sys.exit(1)

    # Build lookup structures
    games_by_slot: dict[int, dict] = {}
    for g in games_raw:
        games_by_slot[g['slot_index']] = {
            'status': g.get('status', 'pending'),
            'winner': g.get('winner'),
            'team1':  g.get('teams', {}).get('team1'),
            'team2':  g.get('teams', {}).get('team2'),
            'seed1':  g.get('teams', {}).get('seed1'),
            'seed2':  g.get('teams', {}).get('seed2'),
            'score1': g.get('teams', {}).get('score1'),
            'score2': g.get('teams', {}).get('score2'),
        }

    brackets_by_user = {b['user_id']: b['picks'] for b in brackets}
    player_probs     = (sim[0].get('player_probs') or {}) if sim else {}

    # Build player list with scores
    eliminated: set[str] = set()
    for g in games_raw:
        if g.get('winner'):
            t = g.get('teams', {})
            loser = t.get('team2') if t.get('team1') == g['winner'] else t.get('team1')
            if loser:
                eliminated.add(loser)

    players = []
    for m in members:
        username = m.get('profiles', {}).get('username', f"user_{m['user_id'][:6]}")
        picks    = brackets_by_user.get(m['user_id'], [None] * 63)
        score    = 0
        for g in games_raw:
            if g.get('winner') and picks[g['slot_index']] == g['winner']:
                score += ROUND_POINTS.get(SLOT_ROUND.get(g['slot_index'], ''), 0)
        champ_pick = picks[62] if len(picks) > 62 else None
        players.append({
            'name':        username,
            'picks':       picks,
            'points':      score,
            'champ_pick':  champ_pick,
            'champ_alive': champ_pick is not None and champ_pick not in eliminated,
        })

    players.sort(key=lambda x: -x['points'])
    rank = 1
    for i, p in enumerate(players):
        if i > 0 and p['points'] < players[i - 1]['points']:
            rank = i + 1
        p['rank'] = rank

    pool_size   = len(players)
    all_picks   = [p['picks'] for p in players]
    final_count = sum(1 for g in games_by_slot.values() if g.get('status') == 'final')
    if final_count < 63:
        print(f'Warning: {final_count}/63 games are final — reports based on current state.')

    reports: dict[str, dict | str] = {}
    total_tokens = 0

    for p in players:
        name = p['name']
        print(f'\n  Generating report for {name} (#{p["rank"]})...')

        archetype     = compute_archetype(p['picks'], all_picks, games_by_slot, pool_size)
        correct_calls = compute_correct_calls(p['picks'], all_picks, games_by_slot, pool_size)
        the_turn      = compute_the_turn(p['picks'], games_by_slot, p['rank'])
        round_acc     = compute_round_accuracy(p['picks'], games_by_slot)
        champ_journey = compute_champ_pick_journey(p['picks'], games_by_slot, all_picks, pool_size)

        brief = build_player_brief(
            name          = name,
            rank          = p['rank'],
            pool_size     = pool_size,
            points        = p['points'],
            champ_pick    = p['champ_pick'],
            champ_alive   = p['champ_alive'],
            archetype     = archetype,
            correct_calls = correct_calls,
            the_turn      = the_turn,
            round_accuracy= round_acc,
            champ_journey = champ_journey,
        )

        if dry_run:
            print(f'    [DRY RUN] Brief:\n    {brief.replace(chr(10), chr(10) + "    ")}')
            reports[name] = {
                'thesis':             f'[DRY RUN] Thesis for {name}.',
                'what_you_got_right': f'[DRY RUN] What {name} got right.',
                'the_turn':           f'[DRY RUN] The turn for {name}.',
                'champion_pick_story': f'[DRY RUN] Champ story for {name}.',
            }
            continue

        t0 = time.time()
        try:
            result = generate_structured_json(
                model='gpt-5.5',
                instructions=REPORT_SYSTEM_PROMPT,
                input_text=brief,
                json_schema=REPORT_RESPONSE_SCHEMA,
                schema_name='biography_writer_report',
                max_output_tokens=512,
            )
            latency   = round((time.time() - t0) * 1000)
            in_tok    = result['usage'].get('input_tokens', 0)
            out_tok   = result['usage'].get('output_tokens', 0)
            tokens    = in_tok + out_tok
            total_tokens += tokens
            parsed = result['parsed']
            reports[name] = {
                'thesis':             parsed.get('thesis', ''),
                'what_you_got_right': parsed.get('what_you_got_right', ''),
                'the_turn':           parsed.get('the_turn', ''),
                'champion_pick_story': parsed.get('champion_pick_story', ''),
            }
            print(f'    ({tokens} tokens, {latency}ms)')
            print(f'    Thesis: {reports[name]["thesis"][:100]}...')

        except Exception as e:
            print(f'    ERROR: {e}')

    # Store results
    if not dry_run and reports:
        reports['_meta'] = {
            'run_at':       datetime.now(timezone.utc).isoformat(),
            'player_count': len([k for k in reports if k != '_meta']),
        }
        print(f'\n  Storing reports for {len(reports) - 1} players...')
        client.table('sim_results') \
            .update({'biography_theses': reports}) \
            .eq('pool_id', pool_id) \
            .execute()
        print('  Done.')

    print(f'\n  Total: {len([k for k in reports if k != "_meta"])} players, {total_tokens} tokens')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Generate post-game reports')
    parser.add_argument('--pool-id', required=True, help='Pool UUID')
    parser.add_argument('--dry-run', action='store_true', help='Compute stats but skip API calls')
    args = parser.parse_args()

    run(args.pool_id, dry_run=args.dry_run)
