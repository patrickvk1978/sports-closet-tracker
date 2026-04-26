"""
March 29 v1 → v2 replay.

Fetches 12 selected narrative_log entries from the real DB,
reconstructs v2 pipeline inputs from the stored prompt + metadata,
runs each through the v2 pipeline, and prints v1 vs v2 output side by side.

Usage:
    python3 api/replay_march29.py
    python3 api/replay_march29.py --id 501      # single entry
    python3 api/replay_march29.py --dry-run      # planner only, skip writer
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))

# ── Selected log IDs (12 of 35) ───────────────────────────────────────────────

REPLAY_IDS = [
    480,   # 20:06 deep_dive  — Iowa-Illinois: first check-in
    501,   # 20:30 game_end   — Iowa-Illinois ENDS
    512,   # 21:01 deep_dive  — Purdue-Arizona: first check-in
    599,   # 23:05 game_end   — Purdue-Arizona ENDS
    610,   # 23:07 alert      — immediately after
    622,   # 03:01 overnight  — morning briefing
    636,   # 13:51 game_end   — Sunday first game end
    639,   # 14:32 deep_dive  — Tennessee-Michigan: first check-in
    726,   # 16:38 game_end   — Tennessee-Michigan ENDS
    737,   # 17:07 deep_dive  — UConn-Duke: first check-in
    835,   # 19:23 game_end   — UConn-Duke ENDS (the frame-drift game)
    846,   # 19:24 alert      — immediately after
]

POOL_ID = '22c24818-cf1d-4d31-8679-5d7fe45caf69'
VALID_PLAYERS = [
    'BobLu', 'Golder Rose', 'Mattyd555', 'PVK', 'RUXNN4', 'SeanC',
    'bq', 'danhudder', 'dmoreality', 'heinous', 'tcasey2533', 'tesslevy',
]
PRIZE_PLACES = [1]
POOL_SIZE = 12


# ── Prompt parser ──────────────────────────────────────────────────────────────

def parse_prompt(prompt: str) -> dict:
    """
    Extract structured data from a v1 prompt string.
    Returns dict with keys: enriched_stats, tournament_context, leverage_games, just_finished
    """
    enriched_stats = {}
    leverage_games = []
    just_finished = ''

    # ── Tournament context ─────────────────────────────────────────────────

    day_number = 12
    current_round = 'E8'
    n_final = 60
    n_today_upcoming = 0
    live_games = []
    today_upcoming = []

    m = re.search(r'Today:\s*Day\s*(\d+)\s*\|\s*Current round:\s*(\S+)', prompt)
    if m:
        day_number = int(m.group(1))
        current_round = m.group(2)

    m = re.search(r'Games completed:\s*(\d+)\s*\|\s*Today remaining:\s*(\d+)', prompt)
    if m:
        n_final = int(m.group(1))
        n_today_upcoming = int(m.group(2))

    live_section = re.search(r'Live right now:\n(.*?)(?:\n-\s|\nPool|\nHighest|$)', prompt, re.DOTALL)
    if live_section:
        for line in live_section.group(1).splitlines():
            line = line.strip().lstrip('- ').strip()
            if line:
                live_games.append(line)

    upcoming_section = re.search(r"Today's upcoming:\n(.*?)(?:\n-\s[A-Z]|\nPool|\nHighest|Live right|$)", prompt, re.DOTALL)
    if upcoming_section:
        for line in upcoming_section.group(1).splitlines():
            line = line.strip().lstrip('- ').strip()
            if line:
                today_upcoming.append(line)

    tournament_context = {
        'day_number': day_number,
        'current_round': current_round,
        'n_final': n_final,
        'n_today_upcoming': n_today_upcoming,
        'live_games': live_games,
        'today_upcoming': today_upcoming,
        'yesterday_finals': [],
        'upsets': [],
        'is_day_one': False,
    }

    # ── Player stat blocks ─────────────────────────────────────────────────

    # Find pool size from first rank reference
    pool_size_match = re.search(r'Rank:\s*\d+/(\d+)', prompt)
    ps = int(pool_size_match.group(1)) if pool_size_match else POOL_SIZE

    # Split on player block pattern "- {name}:\n"
    player_blocks = re.split(r'\n- ([^\n:]+):\n', prompt)

    # player_blocks[0] = preamble, then alternating [name, block, name, block, ...]
    i = 1
    while i < len(player_blocks) - 1:
        name = player_blocks[i].strip()
        block = player_blocks[i + 1]
        i += 2

        # Only process known players
        if name not in VALID_PLAYERS:
            continue

        # Rank + points + ppr + win_prob + delta
        rank = ps
        points = 0
        ppr = 0
        win_prob = 0.0
        win_prob_delta = 0.0
        any_prize = 0.0

        m = re.search(r'Rank:\s*(\d+)/\d+\s*\|\s*Points:\s*(\d+)\s*\|\s*PPR[^:]*:\s*(\d+)\s*\|\s*Win%:\s*([\d.]+)%\s*\(delta\s*([+-]?[\d.]+)%\)', block)
        if m:
            rank = int(m.group(1))
            points = int(m.group(2))
            ppr = int(m.group(3))
            win_prob = float(m.group(4))
            win_prob_delta = float(m.group(5))

        m = re.search(r'Any prize:\s*([\d.]+)%', block)
        if m:
            any_prize = float(m.group(1))

        # Finish place probs
        finish_place_probs = {}
        m = re.search(r'Finish odds:\s*([^\n]+)', block)
        if m:
            for pm in re.finditer(r'(\d+)(?:st|nd|rd|th):([\d.]+)%', m.group(1)):
                finish_place_probs[int(pm.group(1))] = float(pm.group(2))

        # Champ pick
        champ_pick = None
        champ_alive = False
        m = re.search(r'Champ pick:\s*(.+?)\s*\((alive|ELIMINATED)\)', block)
        if m:
            champ_pick = m.group(1).strip()
            champ_alive = m.group(2) == 'alive'

        # Personal leverage (top games with swing >= 3%)
        personal_leverage = []
        lev_section = re.search(r'Key leverage:\s*([^\n]+)', block)
        if lev_section:
            lev_text = lev_section.group(1)
            for lm in re.finditer(
                r'([^(]+?)\s*\(±([\d.]+)%,\s*root for\s*([^,)]+?)(?:,\s*([^)]+))?\)',
                lev_text
            ):
                swing = float(lm.group(2))
                if swing >= 3.0:
                    personal_leverage.append({
                        'matchup': lm.group(1).strip(),
                        'swing': swing,
                        'root_for': lm.group(3).strip(),
                        'game_time': (lm.group(4) or '').strip(),
                    })

        enriched_stats[name] = {
            'rank': rank,
            'points': points,
            'ppr': ppr,
            'win_prob': win_prob,
            'win_prob_delta': win_prob_delta,
            'any_prize_prob': any_prize,
            'no_prize_prob': round(100 - any_prize, 1),
            'champ_pick': champ_pick,
            'champ_alive': champ_alive,
            'trajectory': 'rising' if win_prob_delta > 0 else ('falling' if win_prob_delta < 0 else 'flat'),
            'personal_leverage': personal_leverage,
            'finish_place_probs': finish_place_probs,
            'correct_by_round': {},
            'eliminated_by_round': {},
            'alive_by_round': {},
            'region_health': {},
            'unique_picks': [],
            'best_upside': {'label': '', 'delta': 0},
            'worst_threat': {'label': '', 'delta': 0},
        }

    # ── Leverage games ─────────────────────────────────────────────────────

    lev_section = re.search(
        r'Highest-leverage games:\n(.*?)(?:\nRecent feed|\nTRIGGER|$)',
        prompt, re.DOTALL
    )
    if lev_section:
        current_game = None
        for line in lev_section.group(1).splitlines():
            line = line.strip()
            if not line:
                continue
            # Game header line: "- Team1 vs Team2 (X% pool swing, ...)"
            gm = re.match(r'-\s*(.+?)\s*vs\s*(.+?)\s*\(([\d.]+)%\s*pool swing,\s*([\d.]+)%.*?(?:,\s*(.+?))?\)', line)
            if gm:
                current_game = {
                    'team1': gm.group(1).strip(),
                    'team2': gm.group(2).strip(),
                    'matchup': f"{gm.group(1).strip()} vs {gm.group(2).strip()}",
                    'leverage': float(gm.group(3)),
                    'pickPct1': float(gm.group(4)),
                    'status': 'live' if live_games else 'scheduled',
                    'gameTime': (gm.group(5) or '').strip(),
                    'playerImpacts': [],
                }
                leverage_games.append(current_game)
            # Player impact line: "  player needs team (±X%)"
            elif current_game:
                pm = re.match(r'(\w[\w\s]+?)\s+needs\s+(.+?)\s+\(±([\d.]+)%\)', line)
                if pm:
                    current_game['playerImpacts'].append({
                        'player': pm.group(1).strip(),
                        'rootFor': pm.group(2).strip(),
                        'swing': float(pm.group(3)),
                    })

    # ── just_finished — infer from trigger line ────────────────────────────

    m = re.search(r'TRIGGER:.*?(?:just finished|game over)[:\s]+([^\n]+)', prompt, re.IGNORECASE)
    if m:
        just_finished = m.group(1).strip()

    return {
        'enriched_stats': enriched_stats,
        'tournament_context': tournament_context,
        'leverage_games': leverage_games,
        'just_finished': just_finished,
    }


def parse_v1_response(response_str: str) -> list[dict]:
    """Parse the stored v1 JSON response into a list of entries."""
    try:
        entries = json.loads(response_str)
        if isinstance(entries, list):
            return entries
    except Exception:
        pass
    return []


# ── Main replay ────────────────────────────────────────────────────────────────

def run_replay(log_ids: list[int], dry_run: bool = False):
    from supabase import create_client
    from narrative_v2.pipeline import run_narrative_v2

    url = os.environ.get('SUPABASE_URL', '')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
    if not url or not key:
        print('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required', file=sys.stderr)
        sys.exit(1)

    client = create_client(url, key)

    # Fetch all 12 entries at once
    resp = client.table('narrative_log') \
        .select('id, created_at, message, metadata') \
        .in_('id', log_ids) \
        .order('created_at') \
        .execute()

    rows = resp.data or []
    print(f'Fetched {len(rows)} log entries\n')

    summary = []

    for row in rows:
        meta = row['metadata'] or {}
        log_id = row['id']
        narrative_type = meta.get('narrative_type', 'game_end')
        prompt = meta.get('prompt', '')
        v1_response_str = meta.get('response', '[]')
        time_et = row['created_at'][11:16]

        print(f'\n{"="*72}')
        print(f'LOG {log_id} | {time_et} ET | {narrative_type.upper()} | {row["message"]}')
        print('='*72)

        if not prompt:
            print('  [skip] No prompt stored.')
            continue

        # Parse inputs from prompt
        parsed = parse_prompt(prompt)
        enriched_stats = parsed['enriched_stats']
        tournament_context = parsed['tournament_context']
        leverage_games = parsed['leverage_games']
        just_finished = parsed['just_finished']

        if not enriched_stats:
            print('  [skip] Could not parse player stats from prompt.')
            continue

        print(f'  Parsed: {len(enriched_stats)} players, {len(leverage_games)} leverage games')
        print(f'  Live: {tournament_context["live_games"] or "none"}')
        if just_finished:
            print(f'  Just finished: {just_finished}')

        # ── v1 output ──────────────────────────────────────────────────────
        v1_entries = parse_v1_response(v1_response_str)
        print(f'\n  V1 OUTPUT ({len(v1_entries)} entries):')
        for e in v1_entries:
            words = len(e.get('content', '').split())
            print(f'    [{e.get("persona","?")} → {e.get("player_name","?")}] ({words}w)')
            print(f'    {e.get("content","")}')

        # ── v2 pipeline ────────────────────────────────────────────────────
        print(f'\n  V2 OUTPUT (running pipeline...)')
        v2_entries, usage = run_narrative_v2(
            enriched_stats=enriched_stats,
            prev_enriched_stats=None,  # no prev state stored
            tournament_context=tournament_context,
            leverage_games=leverage_games,
            narrative_type=narrative_type,
            just_finished=just_finished,
            pool_size=POOL_SIZE,
            prize_places=PRIZE_PLACES,
            valid_player_names=VALID_PLAYERS,
            supabase_client=None,
            pool_id=None,
            dry_run=True,
        )

        if not v2_entries:
            reason = usage.get('suppression_reason', 'unknown')
            print(f'    [SUPPRESSED] {reason}')
            print(f'    Planner: {usage["planner_input_tokens"]}+{usage["planner_output_tokens"]} tokens, {usage["total_latency_ms"]}ms')
        else:
            total_tok = (usage["planner_input_tokens"] + usage["planner_output_tokens"] +
                         usage["writer_input_tokens"] + usage["writer_output_tokens"])
            print(f'    {len(v2_entries)} entries | {total_tok} tokens | {usage["total_latency_ms"]}ms')
            for e in v2_entries:
                words = len(e['content'].split())
                print(f'    [{e["persona"]} → {e["player_name"]}] ({words}w)')
                print(f'    {e["content"]}')

        summary.append({
            'id': log_id,
            'time': time_et,
            'type': narrative_type,
            'v1_count': len(v1_entries),
            'v2_count': len(v2_entries),
            'suppressed': len(v2_entries) == 0,
            'suppression_reason': usage.get('suppression_reason', ''),
            'planner_tokens': usage['planner_input_tokens'] + usage['planner_output_tokens'],
            'writer_tokens': usage['writer_input_tokens'] + usage['writer_output_tokens'],
            'latency_ms': usage['total_latency_ms'],
        })

    # ── Summary table ──────────────────────────────────────────────────────
    print(f'\n\n{"="*72}')
    print('SUMMARY: v1 vs v2')
    print('='*72)
    print('%-6s %-6s %-12s %-8s %-8s %-10s %s' % (
        'ID', 'Time', 'Type', 'v1 cnt', 'v2 cnt', 'Tokens', 'Notes'))
    print('-'*72)
    total_planner = total_writer = 0
    for r in summary:
        note = f'SUPPRESSED: {r["suppression_reason"][:40]}' if r['suppressed'] else ''
        tok = r['planner_tokens'] + r['writer_tokens']
        total_planner += r['planner_tokens']
        total_writer += r['writer_tokens']
        print('%-6s %-6s %-12s %-8s %-8s %-10s %s' % (
            str(r['id']), r['time'], r['type'],
            str(r['v1_count']), str(r['v2_count']),
            str(tok), note))
    print('-'*72)
    print(f'Total: planner={total_planner} tokens, writer={total_writer} tokens')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--id', type=int, default=0,
                        help='Replay only this log ID. Default: all 12.')
    parser.add_argument('--dry-run', action='store_true',
                        help='Planner only — skip writer calls.')
    args = parser.parse_args()

    if not (os.environ.get('OPENAI_API_KEY') or os.environ.get('ANTHROPIC_API_KEY')):
        print('ERROR: OPENAI_API_KEY or ANTHROPIC_API_KEY not set', file=sys.stderr)
        sys.exit(1)

    ids = [args.id] if args.id else REPLAY_IDS
    run_replay(ids, dry_run=args.dry_run)
