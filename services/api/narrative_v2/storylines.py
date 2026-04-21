"""
Storyline store — CRUD + lifecycle management.

Each storyline is a persistent narrative arc tracked across cycles.
The planner reads active storylines to avoid re-narration and to
enforce frame consistency.

Lifecycle: emerging → active → escalating → stale → resolving → resolved
"""

from __future__ import annotations
from datetime import datetime, timezone


def load_active_storylines(supabase_client, pool_id: str) -> list[dict]:
    """Fetch all non-resolved storylines for this pool."""
    if not supabase_client or not pool_id:
        return []
    try:
        resp = supabase_client.table('narrative_storylines') \
            .select('*') \
            .eq('pool_id', pool_id) \
            .not_.in_('status', ['resolved']) \
            .order('updated_at', desc=True) \
            .execute()
        return resp.data or []
    except Exception as e:
        print(f'  Warning: could not load storylines: {e}')
        return []


def load_clusters(supabase_client, pool_id: str) -> list[dict]:
    """Fetch current audience clusters for this pool."""
    if not supabase_client or not pool_id:
        return []
    try:
        resp = supabase_client.table('audience_clusters') \
            .select('*') \
            .eq('pool_id', pool_id) \
            .execute()
        return resp.data or []
    except Exception as e:
        print(f'  Warning: could not load clusters: {e}')
        return []


def auto_resolve_storylines(
    storylines: list[dict],
    enriched_stats: dict,
    just_finished: str,
) -> list[dict]:
    """
    Deterministic auto-resolution. Returns list of storyline_ids to resolve.

    Rules:
    - If a team in teams_involved just lost (in just_finished), resolve
    - If all affected players now have 0% win prob + 0 PPR, resolve
    - If mentioned 4+ times without escalation (stale), mark stale
    """
    to_resolve = []
    to_stale = []

    for s in storylines:
        sid = s.get('storyline_id', '')
        status = s.get('status', 'active')

        # Already stale or resolving — leave alone for planner
        if status in ('stale', 'resolving', 'resolved'):
            continue

        # Team-based resolution: if a team in the storyline just lost
        if just_finished:
            teams = s.get('teams_involved', [])
            for team in teams:
                # Check if team appears as loser in result string
                if team and f"def. {team}" in just_finished:
                    to_resolve.append(sid)
                    break
                # Check for "CHAMP ELIMINATED" pattern
                if team and 'CHAMP ELIMINATED' in just_finished and team in just_finished:
                    # The eliminated team's champion storylines should resolve
                    if 'champion' in s.get('angle_type', '') or 'elimination' in s.get('angle_type', ''):
                        to_resolve.append(sid)
                        break

        # Player-based resolution: all affected players fully dead
        affected = s.get('affected_players', [])
        if affected and enriched_stats:
            all_dead = all(
                enriched_stats.get(p, {}).get('win_prob', 0) == 0
                and enriched_stats.get(p, {}).get('ppr', 0) == 0
                for p in affected
                if p in enriched_stats
            )
            if all_dead and sid not in to_resolve:
                to_resolve.append(sid)

        # Staleness: mentioned 4+ times without escalation
        mentions = s.get('mention_count', 0)
        novelty = s.get('novelty_budget', 3)
        if mentions >= 4 and novelty <= 0 and status not in ('escalating',):
            to_stale.append(sid)

    return to_resolve, to_stale


def upsert_storylines(
    supabase_client,
    pool_id: str,
    planner_storyline_actions: list[dict],
) -> None:
    """
    Apply planner's storyline decisions to the database.

    Each action dict:
    {
        'storyline_id': str,
        'action': 'create' | 'escalate' | 'maintain' | 'resolve' | 'suppress',
        'affected_players': [str],
        'teams_involved': [str],
        'angle_type': str,
        'established_frame': str,
        'escalation_threshold': str,
        'cluster_id': str | None,
    }
    """
    if not supabase_client or not pool_id:
        return

    now = datetime.now(timezone.utc).isoformat()

    for action in planner_storyline_actions:
        sid = action.get('storyline_id', '')
        act = action.get('action', 'maintain')

        try:
            if act == 'create':
                supabase_client.table('narrative_storylines').upsert({
                    'pool_id': pool_id,
                    'storyline_id': sid,
                    'affected_players': action.get('affected_players', []),
                    'teams_involved': action.get('teams_involved', []),
                    'angle_type': action.get('angle_type', 'general'),
                    'status': 'emerging',
                    'intensity': 'medium',
                    'established_frame': action.get('established_frame', ''),
                    'last_fact_used': action.get('headline_fact', ''),
                    'mention_count': 1,
                    'novelty_budget': 3,
                    'escalation_threshold': action.get('escalation_threshold', ''),
                    'suppression_note': '',
                    'cluster_id': action.get('cluster_id'),
                }, on_conflict='pool_id,storyline_id').execute()

            elif act == 'escalate':
                # Fetch current, then update
                existing = supabase_client.table('narrative_storylines') \
                    .select('mention_count') \
                    .eq('pool_id', pool_id) \
                    .eq('storyline_id', sid) \
                    .not_.in_('status', ['resolved']) \
                    .limit(1).execute()
                cur_mentions = (existing.data[0]['mention_count'] if existing.data else 0)
                supabase_client.table('narrative_storylines') \
                    .update({
                        'status': 'escalating',
                        'intensity': 'high',
                        'mention_count': cur_mentions + 1,
                        'novelty_budget': 2,  # reset budget on escalation
                        'last_fact_used': action.get('headline_fact', ''),
                        'established_frame': action.get('established_frame', ''),
                    }) \
                    .eq('pool_id', pool_id) \
                    .eq('storyline_id', sid) \
                    .not_.in_('status', ['resolved']) \
                    .execute()

            elif act == 'maintain':
                # Decrement novelty budget, increment mention count
                existing = supabase_client.table('narrative_storylines') \
                    .select('mention_count, novelty_budget') \
                    .eq('pool_id', pool_id) \
                    .eq('storyline_id', sid) \
                    .not_.in_('status', ['resolved']) \
                    .limit(1).execute()
                if existing.data:
                    cur = existing.data[0]
                    new_budget = max(0, cur['novelty_budget'] - 1)
                    new_status = 'stale' if new_budget == 0 else 'active'
                    supabase_client.table('narrative_storylines') \
                        .update({
                            'status': new_status,
                            'mention_count': cur['mention_count'] + 1,
                            'novelty_budget': new_budget,
                            'last_fact_used': action.get('headline_fact', ''),
                        }) \
                        .eq('pool_id', pool_id) \
                        .eq('storyline_id', sid) \
                        .not_.in_('status', ['resolved']) \
                        .execute()

            elif act == 'resolve':
                supabase_client.table('narrative_storylines') \
                    .update({
                        'status': 'resolved',
                        'resolved_at': now,
                    }) \
                    .eq('pool_id', pool_id) \
                    .eq('storyline_id', sid) \
                    .not_.in_('status', ['resolved']) \
                    .execute()

            elif act == 'suppress':
                supabase_client.table('narrative_storylines') \
                    .update({
                        'suppression_note': action.get('suppression_note', 'planner suppressed'),
                        'novelty_budget': 0,
                    }) \
                    .eq('pool_id', pool_id) \
                    .eq('storyline_id', sid) \
                    .not_.in_('status', ['resolved']) \
                    .execute()

        except Exception as e:
            print(f'  Warning: storyline upsert failed for {sid}: {e}')


def bulk_resolve(supabase_client, pool_id: str, storyline_ids: list[str]) -> None:
    """Resolve multiple storylines at once (from auto_resolve)."""
    if not supabase_client or not storyline_ids:
        return
    now = datetime.now(timezone.utc).isoformat()
    for sid in storyline_ids:
        try:
            supabase_client.table('narrative_storylines') \
                .update({'status': 'resolved', 'resolved_at': now}) \
                .eq('pool_id', pool_id) \
                .eq('storyline_id', sid) \
                .not_.in_('status', ['resolved']) \
                .execute()
        except Exception as e:
            print(f'  Warning: bulk resolve failed for {sid}: {e}')


def bulk_mark_stale(supabase_client, pool_id: str, storyline_ids: list[str]) -> None:
    """Mark multiple storylines as stale."""
    if not supabase_client or not storyline_ids:
        return
    for sid in storyline_ids:
        try:
            supabase_client.table('narrative_storylines') \
                .update({'status': 'stale', 'novelty_budget': 0}) \
                .eq('pool_id', pool_id) \
                .eq('storyline_id', sid) \
                .not_.in_('status', ['resolved', 'stale']) \
                .execute()
        except Exception as e:
            print(f'  Warning: mark stale failed for {sid}: {e}')


def upsert_clusters(supabase_client, pool_id: str, clusters: list[dict]) -> None:
    """Write detected clusters to the database, replacing previous ones for this pool."""
    if not supabase_client or not pool_id:
        return
    try:
        # Delete old clusters for this pool
        supabase_client.table('audience_clusters') \
            .delete().eq('pool_id', pool_id).execute()
        # Insert new ones
        if clusters:
            rows = [{
                'pool_id': pool_id,
                'cluster_id': c['cluster_id'],
                'players': c['players'],
                'reason': c['reason'],
                'shared_storylines': c.get('shared_storylines', []),
            } for c in clusters]
            supabase_client.table('audience_clusters').insert(rows).execute()
    except Exception as e:
        print(f'  Warning: cluster upsert failed: {e}')


def summarize_storylines(storylines: list[dict]) -> str:
    """Produce a compact text summary of active storylines for the planner packet."""
    if not storylines:
        return 'No active storylines.'

    lines = []
    for s in storylines:
        status = s.get('status', 'unknown')
        mentions = s.get('mention_count', 0)
        budget = s.get('novelty_budget', 0)
        frame = s.get('established_frame', '')
        players = ', '.join(s.get('affected_players', [])[:3])
        esc = s.get('escalation_threshold', '')

        frame_note = f' Frame: "{frame}"' if frame else ''
        esc_note = f' Escalate if: {esc}' if esc else ''
        suppress = s.get('suppression_note', '')
        suppress_note = f' SUPPRESSED: {suppress}' if suppress else ''

        lines.append(
            f"  - {s.get('storyline_id', '?')} [{status}] "
            f"(mentions: {mentions}, novelty_budget: {budget}) "
            f"— players: {players}.{frame_note}{esc_note}{suppress_note}"
        )

    return 'Active storylines:\n' + '\n'.join(lines)
