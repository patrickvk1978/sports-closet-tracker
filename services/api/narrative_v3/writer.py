"""
Sonnet Writer — Layer 4 of the v3 narrative pipeline.

Adapted from v2 writer. Key differences:
- Assignment includes `stance` and `directional_context` pre-computed from the game map
- Assignment includes `creative_notes` and `tone` from the constrained planner
- Writer system prompt includes stance-based tone guidance
- Writer is explicitly told not to derive rooting or framing — it's all pre-set
"""

from __future__ import annotations

import json
import time

from llm_client import generate_structured_json


# ── Persona Guides ────────────────────────────────────────────────────────────

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


# ── Writer System Prompt ──────────────────────────────────────────────────────

WRITER_SYSTEM_PROMPT = """You are the writer for a March Madness bracket pool commentary feed. You receive individual writing assignments from an editorial planner. Your job is ONLY to write prose — all strategic decisions have already been made.

## Rules

1. Write ONLY what the assignment asks for. Do not add angles, stats, or opinions not in the brief.
2. Lead with the headline_fact. Do not bury it.
3. Stay within the established_frame. If the frame says "rooting for Duke", do not hedge or suggest rooting for someone else.
4. Respect must_avoid — do not use any listed phrases, stats, or angles.
5. Stay under max_words. Count carefully.
6. NO emojis. Ever.
7. NEVER invent numbers. Only cite numbers from supporting_facts, headline_fact, or directional_context.
7a. NEVER invent the winner of any game. Only state a winner if they are explicitly named in headline_fact or supporting_facts. If no winner is stated, do not name one.
8. NEVER invent player names. Only use the player_name from the assignment or names in supporting_facts.
9. "Score"/"Points" = ranking points from correct picks. "Win%" = simulated chance of winning the pool. "PPR" = points possible remaining. Never confuse these.
10. Address the player in second person ("you") unless the assignment is for _pool (pool-wide).
11. For _pool entries, reference specific player names — never say "somebody's bracket".
12. One entry per assignment. No preamble, no sign-off.

## Stance-Based Tone Guide

The `stance` field tells you what the game outcome actually means. Match your tone to it:

- **PROTECTIVE** (loss hurts much more than win helps):
  Use anxiety/relief language: "must-win", "can't afford this", "sweating", "crisis averted", "dodged a bullet".
  On a win: "exhale", "held serve", "the one they needed not to lose".
  On a loss: "the floor fell out", "devastating", "that's the one that'll sting".

- **OPPORTUNISTIC** (win helps much more than loss hurts):
  Use opportunity/hope language: "door is open", "chance to make a move", "house money", "nothing to lose".
  On a win: "that's the break they needed", "suddenly in the mix".
  On a loss: "no real damage", "the real game is still ahead".

- **DECISIVE** (both outcomes are massive):
  Use "defining moment", "everything on the line", "the whole tournament in one game".
  Don't undersell either direction.

- **SYMMETRIC**: Standard leverage framing — balanced, analytical.

- **MINOR**: Do NOT lead with the swing number. Mention as background only. Don't dramatize.

## Creative Direction

If `creative_notes` are provided, follow them. They give specific tone, callback, and framing guidance.
If `tone` is provided, match it: tense/casual/excited/analytical/empathetic/anticipation/somber.

## Persona

{persona_guide}

## Output

Return ONLY a JSON object (no markdown, no explanation):
{{"content": "the written text", "word_count": integer}}
"""

WRITER_RESPONSE_SCHEMA = {
    'type': 'object',
    'properties': {
        'content': {'type': 'string'},
        'word_count': {'type': 'integer'},
    },
    'required': ['content', 'word_count'],
    'additionalProperties': False,
}


# ── Writer ────────────────────────────────────────────────────────────────────

def run_writer(
    assignments: list[dict],
    model:       str = 'gpt-5.5',
    supabase_client=None,
    pool_id:     str | None = None,
) -> list[dict]:
    """
    Write prose for each assignment.

    Returns list of dicts ready for validation.
    """
    results = []

    for assignment in assignments:
        # Skip flagged redundant entries
        if assignment.get('redundancy_flag'):
            print(f'  [v3] Skipping {assignment.get("player_name", "?")} — planner flagged as redundant')
            continue

        persona = assignment.get('persona', 'stat_nerd')
        persona_guide = PERSONA_GUIDES.get(persona, PERSONA_GUIDES['stat_nerd'])
        system_prompt = WRITER_SYSTEM_PROMPT.format(persona_guide=persona_guide)
        user_message  = _format_assignment(assignment)

        t0 = time.time()
        try:
            result = generate_structured_json(
                model=model,
                instructions=system_prompt,
                input_text=user_message,
                json_schema=WRITER_RESPONSE_SCHEMA,
                schema_name='narrative_v3_writer_response',
                max_output_tokens=256,
            )
            latency_ms = round((time.time() - t0) * 1000)
            parsed = result['parsed']
            content    = parsed.get('content', '')
            word_count = parsed.get('word_count', len(content.split()))

            results.append({
                'player_name':       assignment.get('player_name', '_pool'),
                'persona':           persona,
                'content':           content,
                'word_count':        word_count,
                'angle':             assignment.get('angle', ''),
                'stance':            assignment.get('stance', ''),
                'established_frame': assignment.get('established_frame', ''),
                'frame_action':      assignment.get('frame_action', ''),
                'assignment':        assignment,
                'usage': {
                    'input_tokens':  result['usage'].get('input_tokens', 0),
                    'output_tokens': result['usage'].get('output_tokens', 0),
                    'latency_ms':    latency_ms,
                },
            })

        except Exception as e:
            print(f'  [v3] Writer failed for {assignment.get("player_name", "?")}: {e}')

    return results


def _format_assignment(assignment: dict) -> str:
    """Format a single assignment as a user message for the writer."""
    lines = [
        f"Player: {assignment.get('player_name', '_pool')}",
        f"Persona: {assignment.get('persona', 'stat_nerd')}",
        f"Angle: {assignment.get('angle', 'general update')}",
        f"Stance: {assignment.get('stance', 'N/A')}",
        f"Objective: {assignment.get('objective', 'N/A')}",
        f"Tone: {assignment.get('tone', 'analytical')}",
        f"Headline fact: {assignment.get('headline_fact', 'N/A')}",
    ]

    directional = assignment.get('directional_context', '')
    if directional:
        lines.append(f'Directional context: {directional}')

    supporting = assignment.get('supporting_facts', [])
    if supporting:
        lines.append('Supporting facts:')
        for fact in supporting:
            lines.append(f'  - {fact}')

    frame = assignment.get('established_frame', '')
    frame_action = assignment.get('frame_action', '')
    if frame:
        lines.append(f'Established frame ({frame_action}): {frame}')

    creative_notes = assignment.get('creative_notes', '')
    if creative_notes:
        lines.append(f'Creative direction: {creative_notes}')

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
