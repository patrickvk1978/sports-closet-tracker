"""
Audience cluster detection.

Identifies groups of players whose pool situations are effectively identical,
so the planner can avoid generating mirror commentary for twins.

Deterministic — no LLM.
"""

from __future__ import annotations


def detect_clusters(
    enriched_stats: dict,
    existing_clusters: list[dict] | None = None,
) -> list[dict]:
    """
    Detect audience clusters from current enriched stats.

    Returns list of cluster dicts:
    {
        'cluster_id': str,          # e.g. 'boblu_tcasey_twins'
        'players': [str],           # member player usernames
        'reason': str,              # why they're clustered
        'shared_storylines': [],    # filled later by storyline store
    }

    Clustering criteria (any one is enough):
    1. Identical champion pick + similar win probability (within 2%)
    2. Identical champion pick + identical F4 picks
    3. Both fully eliminated with same prize position locked
    """
    if not enriched_stats or len(enriched_stats) < 2:
        return []

    clusters = []
    names = sorted(enriched_stats.keys())
    clustered = set()

    # ── Strategy 1: identical champ + close win prob ───────────────────────

    champ_groups: dict[str, list[str]] = {}
    for name, stats in enriched_stats.items():
        champ = stats.get('champ_pick') or 'none'
        champ_groups.setdefault(champ, []).append(name)

    for champ, members in champ_groups.items():
        if len(members) < 2 or champ == 'none':
            continue

        # Sub-cluster by similar win prob (within 2%)
        sorted_members = sorted(members, key=lambda n: enriched_stats[n].get('win_prob', 0))
        i = 0
        while i < len(sorted_members):
            group = [sorted_members[i]]
            wp_base = enriched_stats[sorted_members[i]].get('win_prob', 0)
            j = i + 1
            while j < len(sorted_members):
                wp_j = enriched_stats[sorted_members[j]].get('win_prob', 0)
                if abs(wp_j - wp_base) <= 2.0:
                    group.append(sorted_members[j])
                    j += 1
                else:
                    break
            if len(group) >= 2:
                # Check none are already in a cluster
                if not any(n in clustered for n in group):
                    cluster_id = _make_cluster_id(group)
                    avg_wp = sum(enriched_stats[n].get('win_prob', 0) for n in group) / len(group)
                    clusters.append({
                        'cluster_id': cluster_id,
                        'players': group,
                        'reason': f'identical_champ_{champ}_similar_wp_{avg_wp:.1f}',
                        'shared_storylines': [],
                    })
                    clustered.update(group)
            i = j

    # ── Strategy 2: both locked into same prize position ───────────────────

    locked_groups: dict[int, list[str]] = {}
    for name, stats in enriched_stats.items():
        if name in clustered:
            continue
        if stats.get('any_prize_prob', 0) == 100 or stats.get('no_prize_prob', 0) == 100:
            # Find which place they're locked into
            place_probs = stats.get('finish_place_probs', {})
            locked = None
            for place, prob in sorted(place_probs.items()):
                if prob == 100:
                    locked = place
                    break
            if locked is not None:
                locked_groups.setdefault(locked, []).append(name)

    for place, members in locked_groups.items():
        if len(members) < 2:
            continue
        if not any(n in clustered for n in members):
            cluster_id = _make_cluster_id(members)
            clusters.append({
                'cluster_id': cluster_id,
                'players': members,
                'reason': f'locked_place_{place}',
                'shared_storylines': [],
            })
            clustered.update(members)

    # ── Strategy 3: fully eliminated players (0% win, 0 PPR) ──────────────

    eliminated = [
        name for name, stats in enriched_stats.items()
        if name not in clustered
        and stats.get('win_prob', 0) == 0
        and stats.get('ppr', 0) == 0
    ]
    if len(eliminated) >= 2:
        cluster_id = _make_cluster_id(eliminated)
        clusters.append({
            'cluster_id': cluster_id,
            'players': eliminated,
            'reason': 'eliminated_zero_ppr',
            'shared_storylines': [],
        })

    return clusters


def _make_cluster_id(players: list[str]) -> str:
    """Generate a deterministic cluster ID from player names."""
    sorted_names = sorted(players)
    short = '_'.join(n[:6].lower() for n in sorted_names[:3])
    if len(sorted_names) > 3:
        short += f'_+{len(sorted_names) - 3}'
    return f'cluster_{short}'


def summarize_clusters(clusters: list[dict]) -> str:
    """Produce a compact text summary of clusters for the planner packet."""
    if not clusters:
        return 'No audience clusters detected.'

    lines = []
    for c in clusters:
        members = ', '.join(c['players'])
        lines.append(f"  - {c['cluster_id']}: [{members}] — {c['reason']}")

    return 'Audience clusters (near-identical situations):\n' + '\n'.join(lines)
