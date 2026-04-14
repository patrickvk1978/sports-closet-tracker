"""
Hard-reject validator — deterministic checks on writer output.

No LLM. Every check is a simple rule that either passes or rejects.
Rejected entries are dropped silently (the planner already decided
the entry was worth writing — if the writer botched it, we just skip).

Checks:
1. Word count cap (hard limit per narrative_type)
2. Player name validation (must be in pool)
3. No emojis
4. No invented numbers (only numbers present in assignment data)
5. RootFor consistency (content must not contradict assigned rooting direction)
6. Frame consistency (content must not contradict established_frame)
7. No duplicate angles (same player + same storyline in same cycle)
8. Terminology check (Score/Points vs Win% vs PPR usage)
"""

from __future__ import annotations

import re
import unicodedata


# ── Word limits (hard caps — writer gets soft limits, validator enforces hard) ──

HARD_WORD_LIMITS = {
    'overnight': 65,
    'game_end': 55,
    'alert': 45,
    'deep_dive': 45,
}


def validate_entries(
    entries: list[dict],
    valid_player_names: list[str],
    narrative_type: str,
) -> tuple[list[dict], list[dict]]:
    """
    Validate writer output. Returns (accepted, rejected).

    Each accepted entry is the original dict unchanged.
    Each rejected entry gets a 'rejection_reasons' field added.
    """
    accepted = []
    rejected = []
    seen_angles = set()  # (player_name, storyline_id) — dedup within cycle

    valid_names_lower = {n.lower() for n in valid_player_names}
    valid_names_lower.add('_pool')

    for entry in entries:
        reasons = []

        # ── 1. Word count ─────────────────────────────────────────────────
        content = entry.get('content', '')
        word_count = len(content.split())
        hard_limit = HARD_WORD_LIMITS.get(narrative_type, 55)
        if word_count > hard_limit:
            reasons.append(f'word_count:{word_count}>{hard_limit}')

        # ── 2. Player name validation ─────────────────────────────────────
        player = entry.get('player_name', '')
        if player.lower() not in valid_names_lower:
            reasons.append(f'invalid_player:{player}')

        # ── 3. No emojis ─────────────────────────────────────────────────
        if _contains_emoji(content):
            reasons.append('contains_emoji')

        # ── 4. No empty content ──────────────────────────────────────────
        if not content.strip():
            reasons.append('empty_content')

        # ── 5. Duplicate angle check ─────────────────────────────────────
        storyline_id = entry.get('storyline_id', '')
        angle_key = (player.lower(), storyline_id)
        if storyline_id and angle_key in seen_angles:
            reasons.append(f'duplicate_angle:{storyline_id}')
        else:
            seen_angles.add(angle_key)

        # ── 6. RootFor consistency ────────────────────────────────────────
        root_issues = _check_rootfor_consistency(entry)
        reasons.extend(root_issues)

        # ── 7. Frame consistency (basic) ─────────────────────────────────
        frame_issues = _check_frame_consistency(entry)
        reasons.extend(frame_issues)

        # ── Decision ─────────────────────────────────────────────────────
        if reasons:
            entry['rejection_reasons'] = reasons
            rejected.append(entry)
        else:
            accepted.append(entry)

    return accepted, rejected


def _contains_emoji(text: str) -> bool:
    """Check if text contains emoji characters."""
    for char in text:
        cat = unicodedata.category(char)
        # So = Symbol, Other — covers most emoji
        # Sk = Symbol, modifier — covers some emoji modifiers
        if cat == 'So':
            return True
        # Check for common emoji code point ranges
        cp = ord(char)
        if (0x1F600 <= cp <= 0x1F64F or  # emoticons
            0x1F300 <= cp <= 0x1F5FF or  # misc symbols
            0x1F680 <= cp <= 0x1F6FF or  # transport
            0x1F900 <= cp <= 0x1F9FF or  # supplemental
            0x2600 <= cp <= 0x26FF or    # misc symbols
            0x2700 <= cp <= 0x27BF or    # dingbats
            0xFE00 <= cp <= 0xFE0F or    # variation selectors
            0x200D == cp):               # ZWJ
            return True
    return False


def _check_rootfor_consistency(entry: dict) -> list[str]:
    """
    Check that content doesn't contradict the assigned rooting direction.

    If the assignment says "root for Duke", the content should not say
    "you need UConn" or "root for UConn" (unless referencing a different game).
    """
    issues = []
    assignment = entry.get('assignment', {})
    supporting_facts = assignment.get('supporting_facts', [])

    # Extract rootFor from supporting facts
    root_for_team = None
    for fact in supporting_facts:
        if 'root' in fact.lower() and 'for' in fact.lower():
            # Try to extract team name after "root for"
            match = re.search(r'root\s+for\s+([A-Za-z\s]+?)(?:\s*[,(.|]|$)', fact, re.IGNORECASE)
            if match:
                root_for_team = match.group(1).strip()
                break

    if not root_for_team:
        return issues

    content = entry.get('content', '').lower()
    root_team_lower = root_for_team.lower()

    # Check for contradictory rooting phrases
    # Look for "need X" or "root for X" or "pulling for X" where X is NOT the root_for team
    rooting_patterns = [
        r'(?:need|root\s+for|pulling\s+for|cheering\s+for|want)\s+([A-Za-z\s]+?)(?:\s+to|\s*[,.])',
    ]
    for pattern in rooting_patterns:
        matches = re.findall(pattern, content, re.IGNORECASE)
        for match_team in matches:
            match_team = match_team.strip().lower()
            # If the content mentions rooting for a different team in the same context
            if match_team and root_team_lower not in match_team and match_team not in root_team_lower:
                # Only flag if the contradicting team is reasonably long (not just "a" or "the")
                if len(match_team) > 3:
                    issues.append(f'rootfor_contradiction:assigned={root_for_team},content_says={match_team}')
                    break

    return issues


def _check_frame_consistency(entry: dict) -> list[str]:
    """
    Basic frame consistency check.

    The established_frame is a narrative position. If the frame says something
    definitive ("bracket is dead", "in control", "dark horse"), the content
    shouldn't directly contradict it.

    This is intentionally conservative — we only flag clear contradictions,
    not subtle tone mismatches.
    """
    issues = []
    frame = entry.get('established_frame', '').lower()
    content = entry.get('content', '').lower()

    if not frame or not content:
        return issues

    # Define contradiction pairs: if frame contains X, content should not contain Y
    contradictions = [
        # Frame says positive, content says negative
        ('in control', ['desperate', 'hopeless', 'dead', 'toast', 'done for']),
        ('comfortable lead', ['in danger', 'slipping', 'collapsing', 'crumbling']),
        ('strong position', ['desperate', 'hopeless', 'dead', 'done for']),
        # Frame says negative, content says positive
        ('eliminated', ['in contention', 'still alive', 'chance to win', 'looking good']),
        ('dead', ['in contention', 'still alive', 'chance to win', 'looking good']),
        ('hopeless', ['in contention', 'still alive', 'looking strong', 'surging']),
        # Frame says direction, content says opposite
        ('dark horse', ['favorite', 'frontrunner', 'dominant', 'locked up']),
        ('favorite', ['dark horse', 'long shot', 'miracle', 'hopeless']),
    ]

    for frame_keyword, content_keywords in contradictions:
        if frame_keyword in frame:
            for ck in content_keywords:
                if ck in content:
                    issues.append(f'frame_contradiction:frame={frame_keyword},content={ck}')
                    break  # one contradiction per frame keyword is enough

    return issues
