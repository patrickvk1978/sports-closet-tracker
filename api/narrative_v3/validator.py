"""
Hard-reject validator — Layer 5 of the v3 narrative pipeline.

Adapted from v2 validator. Added: stance consistency check.
"""

from __future__ import annotations

import re
import unicodedata

HARD_WORD_LIMITS = {
    'overnight':    65,
    'game_end':     55,
    'alert':        45,
    'deep_dive':    45,
}

# Words that contradict each stance
STANCE_TONE_VIOLATIONS = {
    'MINOR': [
        'devastating', 'catastrophic', 'everything on the line', 'must-win',
        'huge swing', 'massive', 'season-defining',
    ],
    'PROTECTIVE': [
        'house money', 'nothing to lose', 'door is open', 'chance to make a move',
    ],
    'OPPORTUNISTIC': [
        'devastating', 'catastrophic', 'bracket on life support', 'toast',
    ],
}


def validate_entries(
    entries: list[dict],
    valid_player_names: list[str],
    narrative_type: str,
) -> tuple[list[dict], list[dict]]:
    accepted = []
    rejected = []
    seen_angles: set = set()

    valid_names_lower = {n.lower() for n in valid_player_names}
    valid_names_lower.add('_pool')

    for entry in entries:
        reasons = []
        content = entry.get('content', '')

        # 1. Word count
        word_count = len(content.split())
        hard_limit = HARD_WORD_LIMITS.get(narrative_type, 55)
        if word_count > hard_limit:
            reasons.append(f'word_count:{word_count}>{hard_limit}')

        # 2. Player name
        player = entry.get('player_name', '')
        if player.lower() not in valid_names_lower:
            reasons.append(f'invalid_player:{player}')

        # 3. No emojis
        if _contains_emoji(content):
            reasons.append('contains_emoji')

        # 4. No empty content
        if not content.strip():
            reasons.append('empty_content')

        # 5. Duplicate angle
        angle = entry.get('angle', '')
        angle_key = (player.lower(), angle)
        if angle and angle_key in seen_angles:
            reasons.append(f'duplicate_angle:{angle}')
        else:
            seen_angles.add(angle_key)

        # 6. Stance tone consistency (new in v3)
        stance_issues = _check_stance_tone(entry)
        reasons.extend(stance_issues)

        # 7. RootFor consistency
        root_issues = _check_rootfor_consistency(entry)
        reasons.extend(root_issues)

        # 8. Frame consistency
        frame_issues = _check_frame_consistency(entry)
        reasons.extend(frame_issues)

        if reasons:
            entry['rejection_reasons'] = reasons
            rejected.append(entry)
        else:
            accepted.append(entry)

    return accepted, rejected


def _check_stance_tone(entry: dict) -> list[str]:
    """Reject if the written tone contradicts the pre-computed stance."""
    stance = entry.get('stance', '')
    content = entry.get('content', '').lower()
    violations = STANCE_TONE_VIOLATIONS.get(stance, [])
    for phrase in violations:
        if phrase in content:
            return [f'stance_tone_violation:stance={stance},phrase="{phrase}"']
    return []


def _check_rootfor_consistency(entry: dict) -> list[str]:
    issues = []
    assignment = entry.get('assignment', {})
    supporting = assignment.get('supporting_facts', [])
    root_for_team = None
    for fact in supporting:
        if 'root' in fact.lower() and 'for' in fact.lower():
            match = re.search(r'root\s+for\s+([A-Za-z\s]+?)(?:\s*[,(.|]|$)', fact, re.IGNORECASE)
            if match:
                root_for_team = match.group(1).strip()
                break
    if not root_for_team:
        return issues
    content = entry.get('content', '').lower()
    root_team_lower = root_for_team.lower()
    for pattern in [r'(?:need|root\s+for|pulling\s+for|cheering\s+for|want)\s+([A-Za-z\s]+?)(?:\s+to|\s*[,.])']:
        for match_team in re.findall(pattern, content, re.IGNORECASE):
            match_team = match_team.strip().lower()
            if match_team and root_team_lower not in match_team and match_team not in root_team_lower:
                if len(match_team) > 3:
                    issues.append(f'rootfor_contradiction:assigned={root_for_team},content={match_team}')
                    break
    return issues


def _check_frame_consistency(entry: dict) -> list[str]:
    issues = []
    frame   = entry.get('established_frame', '').lower()
    content = entry.get('content', '').lower()
    if not frame or not content:
        return issues
    contradictions = [
        ('in control',      ['desperate', 'hopeless', 'dead', 'toast', 'done for']),
        ('comfortable lead',['in danger', 'slipping', 'collapsing']),
        ('eliminated',      ['in contention', 'still alive', 'chance to win']),
        ('dead',            ['in contention', 'still alive', 'chance to win']),
        ('dark horse',      ['favorite', 'frontrunner', 'dominant', 'locked up']),
        ('favorite',        ['dark horse', 'long shot', 'miracle', 'hopeless']),
    ]
    for frame_kw, content_kws in contradictions:
        if frame_kw in frame:
            for ck in content_kws:
                if ck in content:
                    issues.append(f'frame_contradiction:frame={frame_kw},content={ck}')
                    break
    return issues


def _contains_emoji(text: str) -> bool:
    for char in text:
        if unicodedata.category(char) == 'So':
            return True
        cp = ord(char)
        if (0x1F600 <= cp <= 0x1F64F or 0x1F300 <= cp <= 0x1F5FF or
                0x1F680 <= cp <= 0x1F6FF or 0x1F900 <= cp <= 0x1F9FF or
                0x2600 <= cp <= 0x26FF or 0x2700 <= cp <= 0x27BF or
                0xFE00 <= cp <= 0xFE0F or cp == 0x200D):
            return True
    return False
