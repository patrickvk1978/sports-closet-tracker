"""
Thin prep layer — assembles a compact planner packet.

Receives outputs from state engine, delta engine, storyline store, and clusters.
Produces a structured text packet that the Opus planner can reason over.

Does NOT decide what to say. Does NOT write. Compresses and shapes.
"""

from __future__ import annotations

from .delta_engine import summarize_events
from .clusters import summarize_clusters
from .storylines import summarize_storylines


def build_planner_packet(
    enriched_stats: dict,
    candidate_events: list[dict],
    active_storylines: list[dict],
    audience_clusters: list[dict],
    recent_feed_entries: list[dict],
    tournament_context: dict,
    narrative_type: str,
    just_finished: str,
    pool_size: int,
    prize_places: list[int],
    valid_player_names: list[str],
) -> str:
    """
    Build a compact text packet for the Opus planner.

    The planner receives this as its user message and returns structured JSON
    with should_post, assignments, and storyline actions.
    """
    sections = []

    # ── Header ─────────────────────────────────────────────────────────────

    sections.append(f"""NARRATIVE PLANNER — {narrative_type.upper()} CYCLE
Pool: {pool_size} entries | Prize places: {', '.join(str(p) for p in prize_places)}
Valid players: {', '.join(valid_player_names)}, _pool
Trigger: {narrative_type}{f' | Event: {just_finished}' if just_finished else ''}""")

    # ── Tournament state (compact) ─────────────────────────────────────────

    ctx = tournament_context
    live_games = ctx.get('live_games', [])
    today_upcoming = ctx.get('today_upcoming', [])

    state_lines = [
        f"Day {ctx.get('day_number', '?')} | Round: {ctx.get('current_round', '?')} | "
        f"Games final: {ctx.get('n_final', 0)} | Today remaining: {ctx.get('n_today_upcoming', 0)}"
    ]
    if live_games:
        state_lines.append('Live now:')
        for lg in live_games[:4]:
            state_lines.append(f'  {lg}')
    if today_upcoming and narrative_type == 'overnight':
        state_lines.append("Today's games:")
        for tg in today_upcoming[:6]:
            state_lines.append(f'  {tg}')

    sections.append('Tournament state:\n' + '\n'.join(state_lines))

    # ── Player dashboard (compact) ─────────────────────────────────────────

    player_lines = []
    for name in sorted(enriched_stats.keys(), key=lambda n: enriched_stats[n].get('rank', 99)):
        s = enriched_stats[name]
        wp = s.get('win_prob', 0)
        wp_delta = s.get('win_prob_delta', 0)
        delta_str = f" ({'+' if wp_delta > 0 else ''}{wp_delta:.1f}%)" if abs(wp_delta) >= 0.5 else ''
        prize = s.get('any_prize_prob', 0)
        champ = s.get('champ_pick', 'none')
        champ_status = 'alive' if s.get('champ_alive') else 'ELIM'
        ppr = s.get('ppr', 0)

        # Top leverage game for this player
        lev = s.get('personal_leverage', [])
        lev_str = ''
        if lev and lev[0].get('swing', 0) >= 3.0:
            top = lev[0]
            lev_str = f" | Top lever: {top['matchup']} ±{top['swing']}% root:{top['root_for']}"

        player_lines.append(
            f"  {name}: #{s.get('rank','?')}/{pool_size} | "
            f"{s.get('points', 0)}pts | {ppr}PPR | "
            f"Win:{wp:.1f}%{delta_str} | Prize:{prize:.0f}% | "
            f"Champ:{champ}({champ_status}){lev_str}"
        )

    sections.append('Player dashboard:\n' + '\n'.join(player_lines))

    # ── Candidate events ───────────────────────────────────────────────────

    sections.append(summarize_events(candidate_events, max_events=8))

    # ── Active storylines ──────────────────────────────────────────────────

    sections.append(summarize_storylines(active_storylines))

    # ── Audience clusters ──────────────────────────────────────────────────

    sections.append(summarize_clusters(audience_clusters))

    # ── Recent feed (compact) ──────────────────────────────────────────────

    if recent_feed_entries:
        persona_map = {'stat_nerd': 'Mo', 'color_commentator': 'Zelda', 'barkley': 'Davin'}
        feed_lines = []
        for entry in recent_feed_entries[-10:]:  # last 10 only
            persona = persona_map.get(entry.get('persona', ''), 'Mo')
            player = entry.get('player_name', '_pool')
            content = entry.get('content', '')
            # Truncate to ~60 chars for compactness
            if len(content) > 80:
                content = content[:77] + '...'
            feed_lines.append(f"  {persona}→{player}: {content}")
        sections.append('Recent feed (last 10):\n' + '\n'.join(feed_lines))
    else:
        sections.append('Recent feed: empty (first cycle)')

    # ── Hard constraints ───────────────────────────────────────────────────

    max_entries = _max_entries(narrative_type, pool_size)
    sections.append(f"""Hard constraints:
  Max entries this cycle: {max_entries}
  Word limit per entry: {_word_limit(narrative_type)}
  Default: should_post = false (must justify posting)
  Persona is a presentation choice — do not balance for its own sake
  RootFor comes from data only — do not derive your own rooting direction""")

    return '\n\n'.join(sections)


def _max_entries(narrative_type: str, pool_size: int) -> int:
    """Maximum entries allowed per trigger type."""
    if narrative_type == 'overnight':
        return pool_size + 1  # everyone + pool entry
    if narrative_type == 'alert':
        return min(3, pool_size)
    if narrative_type == 'game_end':
        return min(pool_size, max(3, pool_size // 2 + 1))
    # deep_dive — most conservative
    return min(pool_size, max(2, pool_size // 3))


def _word_limit(narrative_type: str) -> int:
    """Word limit per entry by trigger type."""
    if narrative_type == 'overnight':
        return 55
    if narrative_type == 'game_end':
        return 45
    if narrative_type == 'alert':
        return 35
    return 35  # deep_dive


def build_recent_feed_entries(supabase_client, pool_id: str, limit: int = 15) -> list[dict]:
    """Fetch recent feed entries as structured dicts (not formatted string)."""
    if not supabase_client or not pool_id:
        return []
    try:
        resp = supabase_client.table('narrative_feed') \
            .select('persona, player_name, content, entry_type, created_at') \
            .eq('pool_id', pool_id) \
            .order('created_at', desc=True) \
            .limit(limit) \
            .execute()
        rows = resp.data or []
        return list(reversed(rows))  # chronological order
    except Exception as e:
        print(f'  Warning: could not fetch recent feed: {e}')
        return []
