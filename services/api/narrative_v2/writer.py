"""
Sonnet writer — takes structured assignments from the planner and produces prose.

Each assignment is a narrow brief: one player, one angle, one persona, one fact.
The writer receives the persona guide + the assignment and writes a single entry.

No editorial decisions. The planner already decided what to say and whether to say it.
"""

from __future__ import annotations

import json
import os
import time

# ── Persona guides (inline, compact) ─────────────────────────────────────────

PERSONA_GUIDES = {
    'stat_nerd': """You are Mo — the pool's data analyst. Sharp, precise, clinical.
Voice: data-driven, concise, direct. Lead with the most important number. Dry wit only.
Best at: leverage context, asymmetric callouts, cold truths, "this doesn't matter" calls.
Anti-patterns: same opener every time, defining terms mid-sentence, padding to fill word count.""",

    'color_commentator': """You are Zelda — the play-by-play voice. Energy, urgency, immediacy.
Voice: energetic, pool-first reactions, names winners AND losers, punchy sentences.
Best at: game-end reactions, champion elimination announcements, upset reactions, bridging.
Anti-patterns: generic sports anchor recap, burying the lead, vague energy with no specifics.""",

    'barkley': """You are Davin — self-proclaimed bracket pool legend. Blunt, funny, opinionated.
Voice: tough love, pool-aware, calls out specific players, self-referential about past wins.
Best at: rooting callouts, roasts (one then pivot), long-shot sympathy, pool veteran takes.
Anti-patterns: studio references, suit references, "somebody's bracket", overusing catchphrases.""",
}

WRITER_SYSTEM_PROMPT = """You are the writer for a March Madness bracket pool commentary feed. You receive individual writing assignments from an editorial planner. Your job is ONLY to write prose — all strategic decisions have already been made.

## Rules

1. Write ONLY what the assignment asks for. Do not add angles, stats, or opinions not in the brief.
2. Lead with the headline_fact. Do not bury it.
3. Stay within the established_frame. If the frame says "rooting for Duke", do not hedge or suggest rooting for someone else.
4. Respect must_avoid — do not use any listed phrases, stats, or angles.
5. Stay under max_words. Count carefully.
6. NO emojis. Ever.
7. NEVER invent numbers. Only cite numbers from supporting_facts or headline_fact.
7a. NEVER invent the winner of any game. Only state a winner if they are explicitly named in headline_fact or supporting_facts. If no winner is stated, do not name one.
8. NEVER invent player names. Only use the player_name from the assignment or names in supporting_facts.
9. "Score"/"Points" = ranking points from correct picks. "Win%" = simulated chance of winning the pool. "PPR" = points possible remaining. Never confuse these.
10. Address the player in second person ("you") unless the assignment is for _pool (pool-wide).
11. For _pool entries, reference specific player names — never say "somebody's bracket".
12. One entry per assignment. No preamble, no sign-off.

## Persona

{persona_guide}

## Output

Return ONLY a JSON object (no markdown, no explanation):
{{"content": "the written text", "word_count": integer}}
"""


def run_writer(
    assignments: list[dict],
    model: str = 'claude-sonnet-4-20250514',
    supabase_client=None,
    pool_id: str | None = None,
) -> list[dict]:
    """
    Write prose for each planner assignment.

    Each assignment dict should have:
    - player_name, persona, angle, headline_fact, supporting_facts,
      must_avoid, max_words, established_frame, storyline_id

    Returns list of dicts ready for validation:
    [
        {
            'player_name': str,
            'persona': str,
            'content': str,
            'word_count': int,
            'storyline_id': str,
            'established_frame': str,
            'assignment': dict,  # original assignment for validator
        }
    ]
    """
    api_key = os.environ.get('ANTHROPIC_API_KEY', '')
    if not api_key:
        print('  Skipping writer (no ANTHROPIC_API_KEY)')
        return []

    try:
        import anthropic
    except ImportError:
        print('  Skipping writer (anthropic not installed)')
        return []

    client = anthropic.Anthropic(api_key=api_key)
    results = []

    for assignment in assignments:
        persona = assignment.get('persona', 'stat_nerd')
        persona_guide = PERSONA_GUIDES.get(persona, PERSONA_GUIDES['stat_nerd'])

        system_prompt = WRITER_SYSTEM_PROMPT.format(persona_guide=persona_guide)

        user_message = _format_assignment(assignment)

        t0 = time.time()
        try:
            resp = client.messages.create(
                model=model,
                max_tokens=256,
                system=[{
                    'type': 'text',
                    'text': system_prompt,
                    'cache_control': {'type': 'ephemeral'},
                }],
                messages=[{'role': 'user', 'content': user_message}],
            )
            raw = resp.content[0].text.strip()
            latency_ms = round((time.time() - t0) * 1000)

            # Strip markdown fences if present
            if raw.startswith('```'):
                raw = raw.split('\n', 1)[-1].rsplit('```', 1)[0].strip()

            parsed = json.loads(raw)
            content = parsed.get('content', '')
            word_count = parsed.get('word_count', len(content.split()))

            results.append({
                'player_name': assignment.get('player_name', '_pool'),
                'persona': persona,
                'content': content,
                'word_count': word_count,
                'storyline_id': assignment.get('storyline_id', ''),
                'established_frame': assignment.get('established_frame', ''),
                'assignment': assignment,
                'usage': {
                    'input_tokens': getattr(resp.usage, 'input_tokens', 0),
                    'output_tokens': getattr(resp.usage, 'output_tokens', 0),
                    'latency_ms': latency_ms,
                },
            })

        except (json.JSONDecodeError, Exception) as e:
            print(f'  Writer failed for {assignment.get("player_name", "?")}: {e}')
            if supabase_client and pool_id:
                try:
                    from simulate import log_event
                    log_event(supabase_client, pool_id, 'simulate', 'error', 'v2_writer_call',
                              f'Writer failed: {e}',
                              metadata={'player_name': assignment.get('player_name', '?'),
                                        'error': str(e)})
                except Exception:
                    pass

    # Log summary
    if supabase_client and pool_id and results:
        try:
            from simulate import log_event
            total_tokens = sum(r['usage']['input_tokens'] + r['usage']['output_tokens'] for r in results)
            log_event(supabase_client, pool_id, 'simulate', 'info', 'v2_writer_batch',
                      f"Writer produced {len(results)}/{len(assignments)} entries, {total_tokens} total tokens",
                      metadata={
                          'entries_produced': len(results),
                          'assignments_given': len(assignments),
                          'total_tokens': total_tokens,
                          'players': [r['player_name'] for r in results],
                      })
        except Exception:
            pass

    return results


def _format_assignment(assignment: dict) -> str:
    """Format a single assignment as a user message for the writer."""
    lines = [
        f"Player: {assignment.get('player_name', '_pool')}",
        f"Persona: {assignment.get('persona', 'stat_nerd')}",
        f"Angle: {assignment.get('angle', 'general update')}",
        f"Headline fact: {assignment.get('headline_fact', 'N/A')}",
    ]

    supporting = assignment.get('supporting_facts', [])
    if supporting:
        lines.append('Supporting facts:')
        for fact in supporting:
            lines.append(f'  - {fact}')

    frame = assignment.get('established_frame', '')
    if frame:
        lines.append(f'Established frame: {frame}')

    avoid = assignment.get('must_avoid', [])
    if avoid:
        lines.append('Must avoid:')
        for item in avoid:
            lines.append(f'  - {item}')

    max_words = assignment.get('max_words', 45)
    lines.append(f'Max words: {max_words}')

    cluster = assignment.get('cluster_id')
    if cluster:
        lines.append(f'Cluster: {cluster} (this entry covers multiple players with identical situations)')

    return '\n'.join(lines)
