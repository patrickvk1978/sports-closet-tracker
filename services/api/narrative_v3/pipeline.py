"""
v3 narrative pipeline orchestrator.

game_map → player_map → planner → writer → validator → feed entries
"""

from __future__ import annotations

import time
from datetime import datetime, timezone

from .game_map   import build_game_map
from .player_map import build_player_map
from .planner    import run_planner
from .writer     import run_writer
from .validator  import validate_entries


def run_narrative_v3(
    enriched_stats:   dict,
    prev_stats:       dict | None,
    leverage_games:   list,
    games_by_slot:    dict,
    narrative_type:   str,
    just_finished:    str,
    pool_size:        int,
    prize_places:     list[int],
    valid_player_names: list[str],
    players:          list,
    recent_feed:      list | None = None,
    supabase_client=None,
    pool_id:          str | None = None,
    writer_model:     str = 'gpt-5.5',
    planner_model:    str = 'gpt-5.5',
    dry_run:          bool = False,
) -> tuple[list[dict], dict]:
    """
    Run the full v3 narrative pipeline.

    Returns (feed_entries, usage_summary).
    feed_entries: [{ player_name, entry_type, persona, content, metadata }]
    """
    t0         = time.time()
    cycle_time = datetime.now(timezone.utc)
    recent_feed = recent_feed or []

    usage = {
        'planner_input_tokens':  0,
        'planner_output_tokens': 0,
        'writer_input_tokens':   0,
        'writer_output_tokens':  0,
        'entries_assigned':      0,
        'entries_written':       0,
        'entries_accepted':      0,
        'entries_rejected':      0,
        'total_latency_ms':      0,
    }

    # ── 1. Game Map ───────────────────────────────────────────────────────────
    print('  [v3] Building game map...')
    game_map = build_game_map(
        leverage_games  = leverage_games,
        games_by_slot   = games_by_slot,
        enriched_stats  = enriched_stats,
        narrative_type  = narrative_type,
        just_finished   = just_finished,
        recent_feed     = recent_feed,
        players         = players,
        cycle_time      = cycle_time,
    )
    trigger_id = game_map.get('trigger_game_id')
    live_count = sum(1 for g in game_map['games'] if g['status'] == 'live')
    print(f'  [v3] Game map: {len(game_map["games"])} games, trigger={trigger_id}, live={live_count}')
    for g in game_map['games'][:5]:
        marker = '★' if g['is_trigger'] else ' '
        print(f'    {marker} {g["matchup"]} | {g["status"]} | {g["pool_importance"]} | {g["story_type"]}')

    # ── 2. Player Map ─────────────────────────────────────────────────────────
    print('  [v3] Building player map...')
    player_map = build_player_map(
        game_map       = game_map,
        enriched_stats = enriched_stats,
        prev_stats     = prev_stats,
        narrative_type = narrative_type,
        recent_feed    = recent_feed,
        players        = players,
        prize_places   = prize_places,
        cycle_time     = cycle_time,
    )
    cover_entries = [p for p in player_map['players'] if p['coverage_decision'] == 'COVER']
    skip_entries  = [p for p in player_map['players'] if p['coverage_decision'] == 'SKIP']
    print(f'  [v3] Player map: {len(cover_entries)} COVER, {len(skip_entries)} SKIP, '
          f'{len(player_map["clusters"])} clusters')
    for p in player_map['players']:
        marker = '✓' if p['coverage_decision'] == 'COVER' else '✗'
        print(f'    {marker} {p["name"]} | {p["objective"]} | '
              f'{p.get("assignment", {}).get("angle", p.get("skip_reason", "")) if p["assignment"] else p.get("skip_reason", "")}')

    # Extract assignments from covered players
    assignments = [
        p['assignment'] for p in player_map['players']
        if p['coverage_decision'] == 'COVER' and p.get('assignment')
    ]
    usage['entries_assigned'] = len(assignments)

    if not assignments:
        print('  [v3] No assignments — nothing to post this cycle')
        usage['total_latency_ms'] = round((time.time() - t0) * 1000)
        return [], usage

    # ── 3. Planner ────────────────────────────────────────────────────────────
    print(f'  [v3] Running planner ({planner_model}) for {len(assignments)} assignments...')
    plan_result = run_planner(
        assignments    = assignments,
        game_map       = game_map,
        recent_feed    = recent_feed,
        narrative_type = narrative_type,
        cycle_time     = game_map['cycle_time'],
        model          = planner_model,
        supabase_client= supabase_client,
        pool_id        = pool_id,
    )
    enriched_assignments = plan_result['assignments']
    usage['planner_input_tokens']  = plan_result['usage'].get('input_tokens', 0)
    usage['planner_output_tokens'] = plan_result['usage'].get('output_tokens', 0)
    if plan_result.get('cycle_note'):
        print(f'  [v3] Cycle note: {plan_result["cycle_note"]}')

    # ── 4. Writer ─────────────────────────────────────────────────────────────
    print(f'  [v3] Running writer ({writer_model})...')
    written = run_writer(
        assignments    = enriched_assignments,
        model          = writer_model,
        supabase_client= supabase_client,
        pool_id        = pool_id,
    )
    usage['entries_written']       = len(written)
    usage['writer_input_tokens']   = sum(r['usage'].get('input_tokens', 0)  for r in written)
    usage['writer_output_tokens']  = sum(r['usage'].get('output_tokens', 0) for r in written)

    # ── 5. Validator ──────────────────────────────────────────────────────────
    accepted, rejected = validate_entries(
        entries            = written,
        valid_player_names = valid_player_names,
        narrative_type     = narrative_type,
    )
    usage['entries_accepted'] = len(accepted)
    usage['entries_rejected'] = len(rejected)

    if rejected:
        print(f'  [v3] Validator rejected {len(rejected)}:')
        for r in rejected:
            print(f'    ✗ {r.get("player_name","?")} — {r.get("rejection_reasons",[])}')

    print(f'  [v3] {len(accepted)} entries passed validation')

    # ── 6. Format for insert ──────────────────────────────────────────────────
    feed_entries = []
    for entry in accepted:
        feed_entries.append({
            'player_name': entry['player_name'],
            'entry_type':  narrative_type,
            'persona':     entry['persona'],
            'content':     entry['content'],
            'metadata': {
                'angle':       entry.get('angle', ''),
                'stance':      entry.get('stance', ''),
                'frame':       entry.get('established_frame', ''),
                'frame_action': entry.get('frame_action', ''),
            },
        })

    usage['total_latency_ms'] = round((time.time() - t0) * 1000)
    print(f'  [v3] Pipeline complete: {len(feed_entries)} entries in {usage["total_latency_ms"]}ms')

    return feed_entries, usage
