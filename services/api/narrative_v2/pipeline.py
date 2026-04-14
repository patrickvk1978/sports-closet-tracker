"""
v2 narrative pipeline orchestrator.

Wires together all six layers:
    state (enriched_stats from simulate.py)
  → delta engine (candidate events)
  → storyline store (load, auto-resolve, clusters)
  → prep (planner packet)
  → planner (Opus — should_post + assignments)
  → writer (Sonnet — prose per assignment)
  → validator (hard-reject checks)
  → post-cycle updates (storyline upserts, cluster writes, feed insert)

Single entry point: run_narrative_v2()
"""

from __future__ import annotations

import time

from .delta_engine import compute_candidate_events
from .clusters import detect_clusters
from .storylines import (
    load_active_storylines,
    load_clusters,
    auto_resolve_storylines,
    upsert_storylines,
    upsert_clusters,
    bulk_resolve,
    bulk_mark_stale,
)
from .prep import build_planner_packet, build_recent_feed_entries
from .planner import run_planner
from .writer import run_writer
from .validator import validate_entries


def run_narrative_v2(
    enriched_stats: dict,
    prev_enriched_stats: dict | None,
    tournament_context: dict,
    leverage_games: list,
    narrative_type: str,
    just_finished: str,
    pool_size: int,
    prize_places: list[int],
    valid_player_names: list[str],
    supabase_client=None,
    pool_id: str | None = None,
    planner_model: str = 'claude-opus-4-6',
    writer_model: str = 'claude-sonnet-4-20250514',
    dry_run: bool = False,
) -> tuple[list[dict], dict]:
    """
    Run the full v2 narrative pipeline.

    Returns:
        (feed_entries, usage_summary)

        feed_entries: list of dicts ready for insert_feed_entries()
            [{ player_name, entry_type, persona, content }]

        usage_summary: dict with token counts and timing
    """
    t0 = time.time()
    usage = {
        'planner_input_tokens': 0,
        'planner_output_tokens': 0,
        'planner_cache_read_tokens': 0,
        'writer_input_tokens': 0,
        'writer_output_tokens': 0,
        'entries_planned': 0,
        'entries_written': 0,
        'entries_accepted': 0,
        'entries_rejected': 0,
        'suppression_reason': '',
        'total_latency_ms': 0,
    }

    # ── 1. Delta engine: compute candidate events ─────────────────────────

    print('  [v2] Computing candidate events...')
    candidate_events = compute_candidate_events(
        enriched_stats=enriched_stats,
        prev_enriched_stats=prev_enriched_stats,
        tournament_context=tournament_context,
        leverage_games=leverage_games,
        narrative_type=narrative_type,
        just_finished=just_finished,
    )
    print(f'  [v2] {len(candidate_events)} candidate events (top: '
          f'{candidate_events[0]["event_type"] if candidate_events else "none"})')

    # ── 2. Storyline store: load + auto-resolve ───────────────────────────

    print('  [v2] Loading storylines and clusters...')
    active_storylines = load_active_storylines(supabase_client, pool_id)
    existing_clusters = load_clusters(supabase_client, pool_id)
    print(f'  [v2] {len(active_storylines)} active storylines, {len(existing_clusters)} clusters')

    # Auto-resolve stale/dead storylines
    to_resolve, to_stale = auto_resolve_storylines(
        active_storylines, enriched_stats, just_finished,
    )
    if to_resolve:
        print(f'  [v2] Auto-resolving {len(to_resolve)} storylines: {to_resolve}')
        if not dry_run:
            bulk_resolve(supabase_client, pool_id, to_resolve)
        # Remove resolved from active list
        active_storylines = [s for s in active_storylines
                            if s.get('storyline_id') not in to_resolve]
    if to_stale:
        print(f'  [v2] Marking {len(to_stale)} storylines stale: {to_stale}')
        if not dry_run:
            bulk_mark_stale(supabase_client, pool_id, to_stale)
        # Update status in memory
        for s in active_storylines:
            if s.get('storyline_id') in to_stale:
                s['status'] = 'stale'
                s['novelty_budget'] = 0

    # ── 3. Clusters: detect current audience clusters ─────────────────────

    new_clusters = detect_clusters(enriched_stats, existing_clusters)
    if new_clusters:
        print(f'  [v2] Detected {len(new_clusters)} clusters: '
              f'{[c["cluster_id"] for c in new_clusters]}')
        if not dry_run:
            upsert_clusters(supabase_client, pool_id, new_clusters)

    # ── 4. Prep: build planner packet ─────────────────────────────────────

    recent_feed = build_recent_feed_entries(supabase_client, pool_id, limit=15)
    print(f'  [v2] Recent feed: {len(recent_feed)} entries')

    planner_packet = build_planner_packet(
        enriched_stats=enriched_stats,
        candidate_events=candidate_events,
        active_storylines=active_storylines,
        audience_clusters=new_clusters or existing_clusters,
        recent_feed_entries=recent_feed,
        tournament_context=tournament_context,
        narrative_type=narrative_type,
        just_finished=just_finished,
        pool_size=pool_size,
        prize_places=prize_places,
        valid_player_names=valid_player_names,
    )
    print(f'  [v2] Planner packet: {len(planner_packet)} chars')

    # ── 5. Planner: Opus decides whether/what to post ─────────────────────

    print(f'  [v2] Calling planner ({planner_model})...')
    plan = run_planner(
        planner_packet=planner_packet,
        model=planner_model,
        supabase_client=supabase_client,
        pool_id=pool_id,
    )

    usage['planner_input_tokens'] = plan['usage'].get('input_tokens', 0)
    usage['planner_output_tokens'] = plan['usage'].get('output_tokens', 0)
    usage['planner_cache_read_tokens'] = plan['usage'].get('cache_read_tokens', 0)

    if not plan['should_post']:
        reason = plan.get('suppression_reason', 'planner said no')
        print(f'  [v2] Planner suppressed: {reason}')
        usage['suppression_reason'] = reason
        usage['total_latency_ms'] = round((time.time() - t0) * 1000)
        return [], usage

    assignments = plan.get('assignments', [])
    usage['entries_planned'] = len(assignments)
    print(f'  [v2] Planner approved {len(assignments)} assignments')
    for a in assignments:
        print(f'    → {a.get("player_name", "?")} | {a.get("persona", "?")} | {a.get("angle", "?")}')

    if not assignments:
        usage['suppression_reason'] = 'planner approved but no assignments'
        usage['total_latency_ms'] = round((time.time() - t0) * 1000)
        return [], usage

    # ── 6. Writer: Sonnet produces prose ──────────────────────────────────

    print(f'  [v2] Calling writer ({writer_model}) for {len(assignments)} assignments...')
    written = run_writer(
        assignments=assignments,
        model=writer_model,
        supabase_client=supabase_client,
        pool_id=pool_id,
    )
    usage['entries_written'] = len(written)
    usage['writer_input_tokens'] = sum(r['usage']['input_tokens'] for r in written)
    usage['writer_output_tokens'] = sum(r['usage']['output_tokens'] for r in written)
    print(f'  [v2] Writer produced {len(written)} entries')

    # ── 7. Validator: hard-reject checks ──────────────────────────────────

    accepted, rejected = validate_entries(
        entries=written,
        valid_player_names=valid_player_names,
        narrative_type=narrative_type,
    )
    usage['entries_accepted'] = len(accepted)
    usage['entries_rejected'] = len(rejected)

    if rejected:
        print(f'  [v2] Validator rejected {len(rejected)} entries:')
        for r in rejected:
            print(f'    ✗ {r.get("player_name", "?")} — {r.get("rejection_reasons", [])}')

    print(f'  [v2] {len(accepted)} entries passed validation')

    # ── 8. Post-cycle: update storylines ──────────────────────────────────

    storyline_actions = plan.get('storyline_actions', [])
    if storyline_actions and not dry_run:
        print(f'  [v2] Applying {len(storyline_actions)} storyline actions...')
        upsert_storylines(supabase_client, pool_id, storyline_actions)

    # ── 9. Format for insert ──────────────────────────────────────────────

    feed_entries = []
    for entry in accepted:
        feed_entries.append({
            'player_name': entry['player_name'],
            'entry_type': narrative_type,
            'persona': entry['persona'],
            'content': entry['content'],
        })

    usage['total_latency_ms'] = round((time.time() - t0) * 1000)

    # Log summary
    if supabase_client and pool_id and not dry_run:
        try:
            from simulate import log_event
            log_event(supabase_client, pool_id, 'simulate', 'info', 'v2_pipeline_complete',
                      f"v2 pipeline: {len(feed_entries)} entries "
                      f"(planned:{usage['entries_planned']}, "
                      f"written:{usage['entries_written']}, "
                      f"accepted:{usage['entries_accepted']}, "
                      f"rejected:{usage['entries_rejected']}) "
                      f"in {usage['total_latency_ms']}ms",
                      metadata=usage)
        except Exception:
            pass

    print(f'  [v2] Pipeline complete: {len(feed_entries)} entries in {usage["total_latency_ms"]}ms')
    return feed_entries, usage
