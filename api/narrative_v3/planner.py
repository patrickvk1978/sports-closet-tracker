"""
Constrained Sonnet Planner — Layer 3 of the v3 narrative pipeline.

The planner adds creative threading and tone direction AFTER the deterministic
maps have made all editorial decisions (who/what/when). It CANNOT override:
  - Who gets covered
  - Which game is the focus
  - Which persona delivers
  - The angle category
  - The directional context / stance
  - The frame action

It CAN add:
  - Narrative threading (callbacks to prior entries)
  - Tone temperature ("understated" vs "go big")
  - Entry ordering for dramatic arc
  - Specific creative direction for the writer
  - Flag for redundancy (two entries that would feel like duplicates)

Input: player map assignments + cycle context + recent feed
Output: same assignments, enriched with creative_notes and entry_order
"""

from __future__ import annotations

import json
import os
import time
from datetime import datetime


PLANNER_SYSTEM_PROMPT = """You are the broadcast director for a March Madness bracket pool commentary feed.

The editorial decisions have already been made by a rules engine. You cannot change:
- Who gets covered
- Which game is the focus
- Which persona delivers (Mo/Zelda/Davin)
- The angle or stance
- The directional context (win/loss impact)
- The frame action (establish/maintain/escalate/resolve)

Your job is ONLY to add creative direction that helps the writer produce better prose.
For each assignment, provide:
- creative_notes: 2-3 sentences of specific direction for the writer
- tone: one of "tense" | "casual" | "excited" | "analytical" | "empathetic" | "anticipation" | "somber"
- entry_order: integer ranking for dramatic arc within this cycle (1 = lead story)

Also provide a cycle_note: one sentence describing the overall dramatic arc for this cycle.

Rules:
1. Match tone to stance — PROTECTIVE = tense/empathetic, OPPORTUNISTIC = excited/casual,
   DECISIVE = tense, MINOR = casual/analytical.
2. Order entries for arc: biggest story first (or build to it if you prefer tension).
3. Flag redundancy: if two entries cover the same game with similar angles, note it.
4. Use specific details from the assignment — don't give generic direction.
5. Callback to recent feed when relevant — "the last entry said X, now..."
6. Keep creative_notes grounded in the facts provided. Don't invent new story angles.

Output: JSON only. No markdown.
{
  "entries": [
    {
      "player": "player_name",
      "creative_notes": "specific direction for the writer",
      "tone": "tense",
      "entry_order": 1,
      "redundancy_flag": false
    }
  ],
  "cycle_note": "one sentence describing the overall arc"
}
"""


def run_planner(
    assignments:    list[dict],
    game_map:       dict,
    recent_feed:    list,
    narrative_type: str,
    cycle_time:     str,
    model:          str = 'claude-sonnet-4-20250514',
    supabase_client=None,
    pool_id:        str | None = None,
) -> dict:
    """
    Run the constrained Sonnet planner.

    Returns:
    {
      'assignments':   [enriched assignment dicts],
      'cycle_note':    str,
      'usage':         { input_tokens, output_tokens, latency_ms },
    }
    """
    if not assignments:
        return {'assignments': [], 'cycle_note': '', 'usage': {}}

    api_key = os.environ.get('ANTHROPIC_API_KEY', '')
    if not api_key:
        print('  [v3] No ANTHROPIC_API_KEY — skipping planner, using raw assignments')
        return {
            'assignments': _default_enrich(assignments),
            'cycle_note':  '',
            'usage': {},
        }

    try:
        import anthropic
    except ImportError:
        print('  [v3] anthropic not installed — skipping planner')
        return {
            'assignments': _default_enrich(assignments),
            'cycle_note':  '',
            'usage': {},
        }

    client = anthropic.Anthropic(api_key=api_key)
    user_message = _build_planner_message(
        assignments, game_map, recent_feed, narrative_type, cycle_time,
    )

    t0 = time.time()
    try:
        resp = client.messages.create(
            model=model,
            max_tokens=1024,
            system=[{
                'type': 'text',
                'text': PLANNER_SYSTEM_PROMPT,
                'cache_control': {'type': 'ephemeral'},
            }],
            messages=[{'role': 'user', 'content': user_message}],
        )
        raw = resp.content[0].text.strip()
        latency_ms = round((time.time() - t0) * 1000)

        if raw.startswith('```'):
            raw = raw.split('\n', 1)[-1].rsplit('```', 1)[0].strip()

        plan = json.loads(raw)
        enriched = _apply_plan(assignments, plan)

        return {
            'assignments': enriched,
            'cycle_note':  plan.get('cycle_note', ''),
            'usage': {
                'input_tokens':  getattr(resp.usage, 'input_tokens', 0),
                'output_tokens': getattr(resp.usage, 'output_tokens', 0),
                'latency_ms':    latency_ms,
            },
        }

    except Exception as e:
        print(f'  [v3] Planner failed: {e} — using raw assignments')
        return {
            'assignments': _default_enrich(assignments),
            'cycle_note':  '',
            'usage': {'latency_ms': round((time.time() - t0) * 1000)},
        }


def _build_planner_message(
    assignments:    list[dict],
    game_map:       dict,
    recent_feed:    list,
    narrative_type: str,
    cycle_time:     str,
) -> str:
    """Format the planner's user message."""
    lines = []

    # Cycle context
    trigger_id = game_map.get('trigger_game_id')
    trigger_game = next(
        (g for g in game_map.get('games', []) if g['game_id'] == trigger_id), None
    ) if trigger_id is not None else None

    lines.append('CYCLE CONTEXT:')
    lines.append(f'  Time: {cycle_time}')
    lines.append(f'  Type: {narrative_type}')
    if trigger_game:
        score = trigger_game.get('score', '')
        lines.append(f'  Trigger: {trigger_game["matchup"]} — {trigger_game["status"].upper()} {score}'.strip())
    live_games = [g for g in game_map.get('games', []) if g['status'] == 'live']
    lines.append(f'  Live games: {len(live_games)}')
    lines.append('')

    # Assignments
    lines.append(f'ASSIGNMENTS THIS CYCLE ({len(assignments)} entries):')
    lines.append('')
    for i, a in enumerate(assignments, 1):
        lines.append(f'  {i}. {a["player_name"]} — {a["persona"]} — {a["angle"]} — {a["frame_action"].upper()} frame')
        lines.append(f'     Stance: {a.get("stance", "N/A")}')
        lines.append(f'     Objective: {a.get("objective", "N/A")}')
        lines.append(f'     Directional: {a.get("directional_context", "N/A")}')
        lines.append(f'     Headline: {a.get("headline_fact", "")}')
        if a.get('established_frame'):
            lines.append(f'     Frame: "{a["established_frame"]}"')
        lines.append('')

    # Recent feed (last 5 entries for context)
    recent = (recent_feed or [])[-5:]
    if recent:
        lines.append('RECENT FEED (last entries for context):')
        for entry in recent:
            created = entry.get('created_at', '')[:16]
            persona = entry.get('persona', '?')
            player  = entry.get('player_name', '?')
            content = (entry.get('content') or '')[:80]
            lines.append(f'  [{created}] {persona} → {player}: "{content}..."')
        lines.append('')

    lines.append('Provide creative_notes, tone, and entry_order for each assignment.')
    lines.append('Order by dramatic impact (1 = lead story).')

    return '\n'.join(lines)


def _apply_plan(assignments: list[dict], plan: dict) -> list[dict]:
    """Merge planner output into assignments."""
    plan_by_player = {e['player']: e for e in plan.get('entries', [])}

    enriched = []
    for a in assignments:
        p = plan_by_player.get(a['player_name'], {})
        enriched.append({
            **a,
            'creative_notes': p.get('creative_notes', ''),
            'tone':           p.get('tone', 'analytical'),
            'entry_order':    p.get('entry_order', 99),
            'redundancy_flag': p.get('redundancy_flag', False),
        })

    # Sort by entry_order
    enriched.sort(key=lambda x: x.get('entry_order', 99))
    return enriched


def _default_enrich(assignments: list[dict]) -> list[dict]:
    """Fallback enrichment when planner is unavailable."""
    enriched = []
    for i, a in enumerate(assignments, 1):
        stance = a.get('stance', '')
        tone_map = {
            'PROTECTIVE':   'tense',
            'OPPORTUNISTIC': 'excited',
            'DECISIVE':     'tense',
            'SYMMETRIC':    'analytical',
            'MINOR':        'casual',
        }
        enriched.append({
            **a,
            'creative_notes': '',
            'tone':           tone_map.get(stance, 'analytical'),
            'entry_order':    i,
            'redundancy_flag': False,
        })
    return enriched
