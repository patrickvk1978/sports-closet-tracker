"""
Opus planner — the editorial brain.

Receives a compact planner packet and returns structured JSON with:
- should_post: bool (default false — must justify)
- assignments: per-player writing assignments
- storyline_actions: create/escalate/maintain/resolve/suppress
- cluster_decisions: how to handle twin players

This is a separate LLM call from the writer. All intelligence budget
goes to selection, not prose.
"""

from __future__ import annotations

import json
import time

from llm_client import generate_structured_json

PLANNER_SYSTEM_PROMPT = """You are the editorial planner for a March Madness bracket pool commentary feed. Your job is to decide WHETHER to post and WHAT to post. You do NOT write the commentary — a separate writer handles that.

## Your default position: DO NOT POST

Start from should_post = false. Only post when there is:
- A real state change (game started, ended, meaningful score change)
- A new angle that hasn't been narrated yet
- A threshold crossing (win prob crossed 50%, dropped below 5%, eliminated)
- A storyline escalation or resolution
- A materially different audience than the last post addressed

"Numerically new but editorially stale" is NOT grounds to post.
A 0.2% win prob fluctuation within the same storyline is NOT news.
Repeating the same rooting advice with different words is NOT novel.

## Storyline management

You manage active storylines. For each assignment, specify:
- storyline_id: a short slug for the narrative arc
- storyline_action: create | escalate | maintain | resolve | suppress
- established_frame: the narrative position you're taking (the writer must stay within this)
- escalation_threshold: what would need to change for this storyline to escalate

If a storyline is stale (novelty_budget: 0), you MUST either escalate it with new information or suppress it. Do not restate a stale storyline.

## Audience clusters

When players are in a cluster (identical situation), prefer:
- One shared post using player_name = "_pool" (mention both players by name in the angle), OR
- One individual post and suppress the twin
- Two separate posts ONLY if their interests actually diverge

IMPORTANT: Never use comma-separated player names like "Bob, Carol" as player_name. Use "_pool" for any entry that covers multiple players.

## Persona selection

Persona is a presentation choice. Pick the persona whose voice best fits the angle:
- stat_nerd (Mo): data, leverage, probability, cold truths
- color_commentator (Zelda): energy, reactions, game moments, bridging
- barkley (Davin): blunt, roasts, rooting calls, pool veteran perspective

Do NOT rotate personas for rotation's sake. Match persona to content.

## RootFor

The data includes a computed rootFor field for each player's leverage games. Trust it. Do not derive your own rooting direction — the simulation already accounts for both own-pick value and relative pool dynamics.

## Output format

Return ONLY valid JSON (no markdown, no explanation). Schema:

{
  "should_post": boolean,
  "suppression_reason": "string — required if should_post is false",
  "assignments": [
    {
      "player_name": "string — exact username or _pool",
      "persona": "stat_nerd | color_commentator | barkley",
      "angle": "string — what the entry is about",
      "storyline_id": "string — short slug",
      "storyline_action": "create | escalate | maintain | resolve",
      "established_frame": "string — narrative position the writer must respect",
      "escalation_threshold": "string — what changes would escalate this storyline",
      "headline_fact": "string — the single most important fact to lead with",
      "supporting_facts": ["string"],
      "must_avoid": ["string — phrases, stats, or angles to NOT use"],
      "max_words": integer,
      "cluster_id": "string | null — if this covers a cluster"
    }
  ],
  "storyline_actions": [
    {
      "storyline_id": "string",
      "action": "create | escalate | maintain | resolve | suppress",
      "affected_players": ["string"],
      "teams_involved": ["string"],
      "angle_type": "string",
      "established_frame": "string",
      "escalation_threshold": "string",
      "headline_fact": "string",
      "suppression_note": "string — only for suppress action",
      "cluster_id": "string | null"
    }
  ]
}

Keep output under 400 tokens. Be decisive. Every assignment must have a clear reason to exist."""

PLANNER_RESPONSE_SCHEMA = {
    'type': 'object',
    'properties': {
        'should_post': {'type': 'boolean'},
        'suppression_reason': {'type': 'string'},
        'assignments': {
            'type': 'array',
            'items': {
                'type': 'object',
                'properties': {
                    'player_name': {'type': 'string'},
                    'persona': {'type': 'string', 'enum': ['stat_nerd', 'color_commentator', 'barkley']},
                    'angle': {'type': 'string'},
                    'storyline_id': {'type': 'string'},
                    'storyline_action': {
                        'type': 'string',
                        'enum': ['create', 'escalate', 'maintain', 'resolve', 'suppress'],
                    },
                    'established_frame': {'type': 'string'},
                    'escalation_threshold': {'type': 'string'},
                    'headline_fact': {'type': 'string'},
                    'supporting_facts': {'type': 'array', 'items': {'type': 'string'}},
                    'must_avoid': {'type': 'array', 'items': {'type': 'string'}},
                    'max_words': {'type': 'integer'},
                    'cluster_id': {'type': ['string', 'null']},
                },
                'required': [
                    'player_name', 'persona', 'angle', 'storyline_id', 'storyline_action',
                    'established_frame', 'escalation_threshold', 'headline_fact',
                    'supporting_facts', 'must_avoid', 'max_words', 'cluster_id',
                ],
                'additionalProperties': False,
            },
        },
        'storyline_actions': {
            'type': 'array',
            'items': {
                'type': 'object',
                'properties': {
                    'storyline_id': {'type': 'string'},
                    'action': {
                        'type': 'string',
                        'enum': ['create', 'escalate', 'maintain', 'resolve', 'suppress'],
                    },
                    'affected_players': {'type': 'array', 'items': {'type': 'string'}},
                    'teams_involved': {'type': 'array', 'items': {'type': 'string'}},
                    'angle_type': {'type': 'string'},
                    'established_frame': {'type': 'string'},
                    'escalation_threshold': {'type': 'string'},
                    'headline_fact': {'type': 'string'},
                    'suppression_note': {'type': 'string'},
                    'cluster_id': {'type': ['string', 'null']},
                },
                'required': [
                    'storyline_id', 'action', 'affected_players', 'teams_involved', 'angle_type',
                    'established_frame', 'escalation_threshold', 'headline_fact',
                    'suppression_note', 'cluster_id',
                ],
                'additionalProperties': False,
            },
        },
    },
    'required': ['should_post', 'suppression_reason', 'assignments', 'storyline_actions'],
    'additionalProperties': False,
}


def run_planner(
    planner_packet: str,
    model: str = 'gpt-5.5',
    supabase_client=None,
    pool_id: str | None = None,
) -> dict:
    """
    Call the Opus planner with the prep packet and return structured plan.

    Returns:
    {
        'should_post': bool,
        'suppression_reason': str,
        'assignments': [...],
        'storyline_actions': [...],
        'raw_response': str,
        'usage': { 'input_tokens', 'output_tokens', 'latency_ms' },
    }
    """
    t0 = time.time()
    try:
        result = generate_structured_json(
            model=model,
            instructions=PLANNER_SYSTEM_PROMPT,
            input_text=planner_packet,
            json_schema=PLANNER_RESPONSE_SCHEMA,
            schema_name='narrative_v2_planner_response',
            max_output_tokens=4096,
        )
        raw = result['raw']
        latency_ms = round((time.time() - t0) * 1000)
        plan = result['parsed']

        # Normalize
        plan.setdefault('should_post', False)
        plan.setdefault('suppression_reason', '')
        plan.setdefault('assignments', [])
        plan.setdefault('storyline_actions', [])
        plan['raw_response'] = raw
        plan['usage'] = {
            'input_tokens': result['usage'].get('input_tokens', 0),
            'output_tokens': result['usage'].get('output_tokens', 0),
            'cache_read_tokens': result['usage'].get('cache_read_tokens', 0),
            'cache_creation_tokens': result['usage'].get('cache_creation_tokens', 0),
            'latency_ms': latency_ms,
        }

        # Log
        if supabase_client and pool_id:
            from simulate import log_event
            log_event(supabase_client, pool_id, 'simulate', 'info', 'v2_planner_call',
                      f"Planner: should_post={plan['should_post']}, "
                      f"{len(plan['assignments'])} assignments",
                      metadata={
                          'model': model,
                          'should_post': plan['should_post'],
                          'suppression_reason': plan.get('suppression_reason', ''),
                          'assignment_count': len(plan['assignments']),
                          'storyline_action_count': len(plan['storyline_actions']),
                          'planner_packet': planner_packet[:2000],
                          'raw_response': raw,
                          'latency_ms': latency_ms,
                          'input_tokens': plan['usage']['input_tokens'],
                          'output_tokens': plan['usage']['output_tokens'],
                      })

        return plan

    except json.JSONDecodeError as e:
        print(f'  Planner returned invalid JSON: {e}')
        if supabase_client and pool_id:
            from simulate import log_event
            log_event(supabase_client, pool_id, 'simulate', 'error', 'v2_planner_call',
                      f'Planner JSON parse failed: {e}',
                      metadata={'raw_response': raw[:2000], 'error': str(e)})
        return _empty_plan(f'JSON parse error: {e}')

    except Exception as e:
        print(f'  Planner call failed: {e}')
        if supabase_client and pool_id:
            from simulate import log_event
            log_event(supabase_client, pool_id, 'simulate', 'error', 'v2_planner_call',
                      f'Planner call failed: {e}',
                      metadata={'error': str(e)})
        return _empty_plan(f'API error: {e}')


def _empty_plan(reason: str) -> dict:
    """Return an empty plan (no post)."""
    return {
        'should_post': False,
        'suppression_reason': reason,
        'assignments': [],
        'storyline_actions': [],
        'raw_response': '',
        'usage': {'input_tokens': 0, 'output_tokens': 0, 'cache_read_tokens': 0,
                  'cache_creation_tokens': 0, 'latency_ms': 0},
    }
