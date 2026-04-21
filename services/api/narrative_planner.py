"""
Rules-based narrative planner.

Runs BEFORE the LLM call to decide:
  - Which players get entries (skip if nothing meaningful changed)
  - What ANGLE to use per player (no two consecutive cycles should repeat an angle)
  - Which persona speaks (rotate, don't let one dominate)
  - What facts to highlight as the headline
  - What phrases/stats to BAN (repeated in recent feed)

The planner output is injected into the dynamic context so the LLM receives
structured assignments rather than figuring out what to say from raw data.
"""

import re
from collections import Counter, defaultdict


# ── Angle definitions ─────────────────────────────────────────────────────────

ANGLES = [
    'leverage',       # cite specific game + personal swing %
    'prize_race',     # 2nd/3rd place odds for players with prize but no win path
    'elimination',    # champion pick eliminated or in danger
    'momentum',       # win_prob trending significantly
    'rooting',        # "come on [team], [player] needs you"
    'spectator',      # eliminated player watching others' drama
    'matchup',        # two players with opposing needs in same game
    'unique_pick',    # contrarian pick still alive
    'standings',      # pool race dynamics, who's closing the gap
]

# Which personas are best suited for which angles
PERSONA_AFFINITY = {
    'stat_nerd':          ['leverage', 'prize_race', 'momentum', 'standings'],
    'color_commentator':  ['rooting', 'matchup', 'standings', 'momentum', 'elimination'],
    'barkley':            ['elimination', 'spectator', 'rooting', 'unique_pick'],
}

PERSONA_NAMES = {'stat_nerd': 'Mo', 'color_commentator': 'Zelda', 'barkley': 'Davin'}


# ── Recent feed analysis ─────────────────────────────────────────────────────

def _parse_recent_feed(recent_feed_str):
    """Parse the formatted recent feed string into structured entries.

    Input format: "- Mo (to Alice): content here"
    Returns list of dicts with persona, player_name, content.
    """
    if not recent_feed_str:
        return []

    name_to_key = {'Mo': 'stat_nerd', 'Zelda': 'color_commentator', 'Davin': 'barkley'}
    entries = []
    for line in recent_feed_str.split('\n'):
        m = re.match(r'^- (\w+) \(to ([^)]+)\): (.+)$', line.strip())
        if m:
            persona_name, player, content = m.groups()
            entries.append({
                'persona': name_to_key.get(persona_name, 'stat_nerd'),
                'player_name': player.strip(),
                'content': content.strip(),
            })
    return entries


def _extract_stats_cited(content):
    """Extract percentage values and key numeric phrases from content."""
    pcts = re.findall(r'[\d]+\.?\d*%', content)
    # Also catch "X points", "X PPR"
    nums = re.findall(r'[\d,]+\s+(?:points?|PPR|point)', content)
    return pcts + nums


def _extract_key_phrases(content):
    """Extract distinctive phrases (3+ word sequences) that shouldn't be repeated."""
    # Lowercase and extract notable phrases
    phrases = set()
    content_lower = content.lower()

    # Specific game references: "team1-team2", "team vs team"
    vs_matches = re.findall(r'(\w+(?:\s+\w+)?)\s+(?:vs\.?|versus)\s+(\w+(?:\s+\w+)?)', content_lower)
    for t1, t2 in vs_matches:
        phrases.add(f"{t1} vs {t2}")

    # Catch repeated framings
    crutch_patterns = [
        r'one[- ]game (?:bracket|pool|tournament)',
        r'ceiling',
        r'formality',
        r'this (?:pool|game) is',
        r'bracket is (?:dead|alive|toast)',
        r'grab (?:a seat|your|some)',
        r'buckle up',
        r'turrible',
        r'on fire',
        r'right now',
    ]
    for pat in crutch_patterns:
        if re.search(pat, content_lower):
            match = re.search(pat, content_lower)
            if match:
                phrases.add(match.group(0))

    return phrases


def _analyze_recent_feed(recent_entries, player_names):
    """Analyze recent feed to determine what's been said per player.

    Returns dict per player:
      {
        'last_personas': ['stat_nerd', 'barkley'],
        'last_angles_inferred': ['leverage', 'leverage'],
        'stats_cited': ['89.4%', '16.6%'],
        'phrases_used': {'one-game bracket', 'ceiling'},
        'entry_count': 3,
      }
    """
    per_player = defaultdict(lambda: {
        'last_personas': [],
        'last_angles_inferred': [],
        'stats_cited': [],
        'phrases_used': set(),
        'entry_count': 0,
    })

    for entry in recent_entries:
        pn = entry['player_name']
        pp = per_player[pn]
        pp['last_personas'].append(entry['persona'])
        pp['stats_cited'].extend(_extract_stats_cited(entry['content']))
        pp['phrases_used'].update(_extract_key_phrases(entry['content']))
        pp['entry_count'] += 1

        # Infer angle from content heuristics
        content_lower = entry['content'].lower()
        if any(w in content_lower for w in ('swing', 'leverage', '±', 'flip')):
            pp['last_angles_inferred'].append('leverage')
        elif any(w in content_lower for w in ('2nd', '3rd', 'second place', 'third place', 'prize')):
            pp['last_angles_inferred'].append('prize_race')
        elif any(w in content_lower for w in ('eliminated', 'dead', 'over for', 'toast')):
            pp['last_angles_inferred'].append('elimination')
        elif any(w in content_lower for w in ('come on', 'root', 'need them', 'pull for', 'do .* a favor')):
            pp['last_angles_inferred'].append('rooting')
        elif any(w in content_lower for w in ('watching', 'spectator', 'just here', 'grab a seat')):
            pp['last_angles_inferred'].append('spectator')
        elif any(w in content_lower for w in ('rising', 'climbing', 'surging', 'falling', 'dropping')):
            pp['last_angles_inferred'].append('momentum')
        elif any(w in content_lower for w in ('nobody else', 'unique', 'only player', 'only one')):
            pp['last_angles_inferred'].append('unique_pick')
        else:
            pp['last_angles_inferred'].append('standings')

    return dict(per_player)


# ── Angle selection ───────────────────────────────────────────────────────────

def _select_angle(player_name, enriched_stat, feed_history, narrative_type,
                  has_live_games, prize_places):
    """Pick the best angle for this player this cycle.

    Priority:
      1. Forced angles (elimination event, champion danger)
      2. Avoid repeating last cycle's angle
      3. Pick from available angles based on player state
    """
    s = enriched_stat
    hist = feed_history.get(player_name, {})
    last_angles = hist.get('last_angles_inferred', [])
    last_angle = last_angles[-1] if last_angles else None

    # Determine which angles are valid for this player's state
    candidates = []

    win_prob = s.get('win_prob', 0)
    any_prize = s.get('any_prize_prob', 0)
    ppr = s.get('ppr', 0)
    champ_alive = s.get('champ_alive', False)

    # Fully eliminated — no win, no prize
    if win_prob == 0 and any_prize == 0:
        candidates = ['spectator']
        # Only one option, don't rotate
        return 'spectator', 'Player eliminated from all prize positions'

    # Out of win contention but alive for prizes
    if win_prob == 0 and any_prize > 0 and len(prize_places) > 1:
        candidates = ['prize_race', 'rooting', 'standings']

    # Champion in danger (champ pick team trailing in live game)
    elif not champ_alive and s.get('champ_pick'):
        candidates = ['elimination', 'momentum', 'standings']

    # High win prob (leader)
    elif win_prob > 60:
        candidates = ['leverage', 'standings', 'rooting', 'momentum']

    # Normal contender
    else:
        candidates = ['leverage', 'momentum', 'rooting', 'unique_pick', 'matchup', 'standings']
        if len(prize_places) > 1:
            candidates.append('prize_race')

    # If live games: prefer leverage/rooting/momentum
    if has_live_games and narrative_type == 'deep_dive':
        live_preferred = [a for a in candidates if a in ('leverage', 'rooting', 'momentum', 'matchup')]
        if live_preferred:
            candidates = live_preferred + [a for a in candidates if a not in live_preferred]

    # Avoid repeating last angle (demote, don't fully ban)
    if last_angle and last_angle in candidates and len(candidates) > 1:
        candidates = [a for a in candidates if a != last_angle] + [last_angle]

    # Also avoid repeating the angle before that if it matches the first candidate
    if len(last_angles) >= 2 and candidates and candidates[0] == last_angles[-2] and len(candidates) > 1:
        candidates = candidates[1:] + [candidates[0]]

    chosen = candidates[0] if candidates else 'standings'

    # Build headline fact
    headline = _build_headline(chosen, s, prize_places)

    return chosen, headline


def _build_headline(angle, s, prize_places):
    """Build a one-line headline fact for the assigned angle."""
    name = s.get('_name', 'player')

    if angle == 'leverage':
        lev = s.get('personal_leverage', [])
        if lev:
            g = lev[0]
            return (f"Key game: {g['matchup']} — root for {g['root_for']} "
                    f"(±{g['swing']}% swing"
                    f"{', ' + g['game_time'] if g.get('game_time') else ''})")
        return f"Win prob: {s['win_prob']}% (delta {s['win_prob_delta']:+}%)"

    elif angle == 'prize_race':
        fp = s.get('finish_place_probs', {})
        parts = []
        for p in sorted(fp.keys()):
            if p in prize_places and p != 1:
                parts.append(f"{_ordinal(p)}: {fp[p]}%")
        if parts:
            return f"Prize race: {', '.join(parts)} | Any prize: {s.get('any_prize_prob', 0)}%"
        return f"Any prize probability: {s.get('any_prize_prob', 0)}%"

    elif angle == 'elimination':
        champ = s.get('champ_pick', '?')
        if not s.get('champ_alive'):
            return f"Champion pick {champ} is ELIMINATED"
        return f"Champion pick {champ} is alive but under pressure"

    elif angle == 'momentum':
        delta = s.get('win_prob_delta', 0)
        direction = 'up' if delta > 0 else 'down'
        return f"Win prob moved {direction}: {s['win_prob']}% (delta {delta:+}%)"

    elif angle == 'rooting':
        lev = s.get('personal_leverage', [])
        if lev:
            g = lev[0]
            return f"Root for {g['root_for']} in {g['matchup']}"
        return f"Needs help from remaining games"

    elif angle == 'spectator':
        return f"Eliminated — 0% win, 0% prize. Spectator role."

    elif angle == 'matchup':
        lev = s.get('personal_leverage', [])
        if lev:
            g = lev[0]
            return f"Opposite side of {g['matchup']} from another player"
        return f"Watching key matchups with rival implications"

    elif angle == 'unique_pick':
        uniq = s.get('unique_picks', [])
        if uniq:
            return f"Unique pick still alive: {uniq[0]}"
        return f"Contrarian choices in later rounds"

    elif angle == 'standings':
        return f"Rank {s['rank']}, {s['points']} pts, {s['ppr']} PPR, {s['win_prob']}% win"

    return f"Win prob: {s['win_prob']}%"


def _ordinal(n):
    """Return ordinal string: 1st, 2nd, 3rd, etc."""
    if 11 <= n % 100 <= 13:
        return f"{n}th"
    return f"{n}{['th','st','nd','rd'][min(n % 10, 4)] if n % 10 < 4 else 'th'}"


# ── Persona assignment ────────────────────────────────────────────────────────

def _select_persona(angle, feed_history, player_name, global_persona_counts):
    """Pick a persona for this player+angle, avoiding recent repetition."""
    hist = feed_history.get(player_name, {})
    last_personas = hist.get('last_personas', [])
    last_persona = last_personas[-1] if last_personas else None

    # Find personas with affinity for this angle
    affinity = []
    for persona, angles in PERSONA_AFFINITY.items():
        if angle in angles:
            affinity.append(persona)

    if not affinity:
        affinity = list(PERSONA_AFFINITY.keys())

    # Score each by: affinity rank (lower=better) + avoid last persona + balance globally
    scored = []
    for p in affinity:
        score = 0
        # Penalize if same as last persona for this player
        if p == last_persona:
            score += 10
        # Penalize if this persona used a lot globally this cycle
        score += global_persona_counts.get(p, 0) * 2
        # Bonus for affinity rank
        score += affinity.index(p)
        scored.append((score, p))

    scored.sort(key=lambda x: x[0])
    return scored[0][1]


# ── Build banned phrases list ─────────────────────────────────────────────────

def _build_banned_content(player_name, feed_history):
    """Build list of phrases and stats to ban for this player."""
    hist = feed_history.get(player_name, {})
    banned = set()

    # Ban stats cited in last 2 entries
    stats = hist.get('stats_cited', [])
    banned.update(stats[-6:])  # last ~2 cycles worth

    # Ban repeated phrases
    banned.update(hist.get('phrases_used', set()))

    return sorted(banned) if banned else []


# ── Main planner ──────────────────────────────────────────────────────────────

def plan_narrative_cycle(enriched_stats, recent_feed_str, narrative_type,
                         just_finished, tournament_context, prize_places):
    """
    Plan the next narrative cycle.

    Args:
        enriched_stats: dict of {player_name: stats_dict} from build_enriched_player_stats
        recent_feed_str: formatted recent feed string from _fetch_recent_feed
        narrative_type: 'overnight' | 'deep_dive' | 'game_end' | 'alert'
        just_finished: description of game that just ended (or '')
        tournament_context: dict from build_tournament_context
        prize_places: list of prize-paying positions, e.g. [1, 2, 3]

    Returns:
        dict with:
          'assignments': list of per-player assignment dicts
          'skipped_players': list of player names skipped (no update)
          'pool_entry': bool — whether to suggest a _pool entry
          'rationale': human-readable summary of planning decisions
          'feed_analysis': per-player feed analysis (for logging)
    """
    has_live_games = bool(tournament_context.get('live_games'))

    # Parse and analyze recent feed
    recent_entries = _parse_recent_feed(recent_feed_str)
    feed_history = _analyze_recent_feed(recent_entries, list(enriched_stats.keys()))

    # Track global persona usage this cycle for balancing
    global_persona_counts = Counter()

    assignments = []
    skipped = []
    rationale_parts = []

    # Sort players by relevance: highest win_prob delta first, then by rank
    sorted_players = sorted(
        enriched_stats.items(),
        key=lambda x: (-abs(x[1].get('win_prob_delta', 0)), x[1].get('rank', 99))
    )

    # Decide how many entries to produce based on pool size and trigger type
    pool_size = len(enriched_stats)
    max_entries = _max_entries_for_cycle(pool_size, narrative_type)

    for name, stats in sorted_players:
        if len(assignments) >= max_entries:
            skipped.append(name)
            continue

        # Inject name into stats for headline builder
        stats_with_name = {**stats, '_name': name}

        # Should we skip this player? (no meaningful update for deep_dive)
        if narrative_type == 'deep_dive' and _should_skip_player(name, stats, feed_history):
            skipped.append(name)
            rationale_parts.append(f"Skip {name}: no meaningful state change")
            continue

        # Select angle
        angle, headline = _select_angle(
            name, stats_with_name, feed_history, narrative_type,
            has_live_games, prize_places
        )

        # Select persona
        persona = _select_persona(angle, feed_history, name, global_persona_counts)
        global_persona_counts[persona] += 1

        # Build banned content
        banned = _build_banned_content(name, feed_history)

        # Word limit by type
        word_limits = {'overnight': 60, 'deep_dive': 50, 'game_end': 50, 'alert': 35}

        assignment = {
            'player_name': name,
            'angle': angle,
            'headline_fact': headline,
            'persona': persona,
            'banned_phrases': banned[:8],  # keep it manageable
            'word_limit': word_limits.get(narrative_type, 50),
        }
        assignments.append(assignment)
        rationale_parts.append(
            f"{name}: {angle} via {PERSONA_NAMES[persona]} — {headline}"
        )

    # Pool entry: suggest for game_end and overnight only, not every deep_dive
    pool_entry = narrative_type in ('overnight', 'game_end')

    return {
        'assignments': assignments,
        'skipped_players': skipped,
        'pool_entry': pool_entry,
        'rationale': '\n'.join(rationale_parts),
        'feed_analysis': {k: {
            'last_personas': v['last_personas'][-3:],
            'last_angles': v['last_angles_inferred'][-3:],
            'stats_banned': list(v['stats_cited'])[-4:],
            'phrases_banned': list(v['phrases_used'])[:5],
        } for k, v in feed_history.items()},
    }


def _max_entries_for_cycle(pool_size, narrative_type):
    """Determine max player entries based on pool size and trigger type."""
    if narrative_type == 'overnight':
        # Cover everyone in overnight
        return pool_size
    elif narrative_type == 'alert':
        # Alerts should be tight — 2-3 affected players
        return min(3, pool_size)
    elif narrative_type == 'game_end':
        # Cover most affected players
        return min(pool_size, max(3, pool_size // 2 + 1))
    else:
        # Deep dive: focus on 2-4 most affected
        return min(4, max(2, pool_size // 3))


def _should_skip_player(name, stats, feed_history):
    """For deep_dive: skip players with no meaningful state change."""
    hist = feed_history.get(name, {})

    # Always include if win_prob moved meaningfully
    if abs(stats.get('win_prob_delta', 0)) >= 1.0:
        return False

    # Always include if they have leverage in a live game
    lev = stats.get('personal_leverage', [])
    if any(g.get('status') == 'live' for g in lev):
        return False

    # Skip if already covered recently (3+ entries in recent feed)
    if hist.get('entry_count', 0) >= 3:
        return True

    # Skip if fully eliminated
    if stats.get('win_prob', 0) == 0 and stats.get('any_prize_prob', 0) == 0:
        return True

    return False


# ── Format plan for injection into prompt ─────────────────────────────────────

def format_plan_for_prompt(plan):
    """Format the planner output as structured instructions in the dynamic context.

    This is what the LLM sees — clear assignments that constrain what it writes.
    """
    if not plan or not plan.get('assignments'):
        return ''

    lines = [
        "NARRATIVE PLAN (follow these assignments — the planner has already decided "
        "who speaks, what angle, and what to avoid):",
        ""
    ]

    for i, a in enumerate(plan['assignments'], 1):
        persona_name = PERSONA_NAMES.get(a['persona'], 'Mo')
        lines.append(f"  {i}. {a['player_name']} — {persona_name} ({a['persona']})")
        lines.append(f"     Angle: {a['angle']}")
        lines.append(f"     Headline fact: {a['headline_fact']}")
        lines.append(f"     Max words: {a['word_limit']}")
        if a.get('banned_phrases'):
            lines.append(f"     DO NOT use these (already said recently): {', '.join(a['banned_phrases'][:5])}")
        lines.append("")

    if plan.get('pool_entry'):
        lines.append("  Also produce ONE _pool entry (pool-wide scene-setter, no player targeting).")
    else:
        lines.append("  No _pool entry needed this cycle.")

    if plan.get('skipped_players'):
        lines.append(f"\n  Skipped (no meaningful update): {', '.join(plan['skipped_players'])}")

    lines.append("")
    lines.append("Follow the plan above. Use the assigned persona, angle, and headline fact for each entry.")
    lines.append("You may add a supporting fact from the player stats, but the headline fact must be the lead.")
    lines.append("Do NOT produce entries for skipped players. Do NOT switch personas or angles from the plan.")

    return '\n'.join(lines)
