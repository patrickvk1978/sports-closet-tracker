"""
Player Map — Layer 2 of the v3 narrative pipeline.

Builds a deterministic, per-player editorial planning document.
Every coverage decision (COVER / SKIP / CLUSTER_COVER) is made here by
rule. No LLM.

Inputs:
  game_map         — output of game_map.build_game_map()
  enriched_stats   — from simulate.py build_enriched_player_stats()
  prev_stats       — previous cycle's enriched_stats (for delta detection)
  narrative_type   — 'game_end' | 'overnight' | 'deep_dive' | 'alert'
  recent_feed      — list of recent feed entries (for coverage tracking)
  players          — list of raw player dicts (for pool metadata)
  prize_places     — list of prize-eligible place numbers e.g. [1, 2, 3]

Output:
  {
    'players': [player_map_entry, ...],
    'clusters': [cluster_entry, ...],
    'persona_counts': { 'stat_nerd': int, 'color_commentator': int, 'barkley': int },
  }
"""

from __future__ import annotations

from datetime import datetime, timezone
from .game_map import get_game, MINOR_MAX


# ── Objective Classification ──────────────────────────────────────────────────

def classify_objective(stats: dict, trigger_game: dict | None) -> str:
    """
    Classify a player's current pool objective.
    SURVIVE overrides everything when champ is in a live game right now.
    """
    wp          = stats.get('win_prob', 0)
    champ_alive = stats.get('champ_alive', False)
    any_prize   = stats.get('any_prize_prob', 0)
    champ_pick  = stats.get('champ_pick', '')

    # SURVIVE: champ pick is in the trigger game (which is live)
    if trigger_game and trigger_game.get('status') == 'live' and champ_pick:
        t1 = trigger_game.get('team1', '')
        t2 = trigger_game.get('team2', '')
        if champ_pick in (t1, t2):
            return 'SURVIVE'

    # Also SURVIVE if champ is in any other live game
    # (handled in caller via primary_game check)

    if not champ_alive:
        if any_prize > 0:
            return 'PRIZE_RACE'
        return 'SPECTATOR'

    if wp >= 40:
        return 'PROTECT_LEAD'
    if wp >= 10:
        return 'CONTENDER'
    return 'LONGSHOT'


# ── Trajectory Classification ─────────────────────────────────────────────────

def classify_trajectory(delta: float) -> str:
    if delta > 8:
        return 'surging'
    if delta > 2:
        return 'rising'
    if delta < -8:
        return 'plummeting'
    if delta < -2:
        return 'falling'
    return 'stable'


# ── Danger Zone ───────────────────────────────────────────────────────────────

def classify_danger_zone(stats: dict, prev_stats: dict | None) -> tuple[str | None, float, str]:
    """
    Returns (danger_zone_label, nearest_threshold_distance, direction).
    """
    wp        = stats.get('win_prob', 0)
    any_prize = stats.get('any_prize_prob', 0)
    prev_wp   = (prev_stats or {}).get('win_prob', wp)

    # Near elimination (win_prob approaching 0%)
    if 0 < wp <= 3:
        dist = wp
        direction = 'approaching' if wp < prev_wp else 'pulling_away'
        return 'NEAR_ELIMINATION', round(dist, 1), direction

    # Prize near elimination
    if 0 < any_prize <= 5 and wp == 0:
        return 'NEAR_ELIMINATION', round(any_prize, 1), 'approaching'

    # Near longshot threshold (10%)
    if 8 <= wp <= 12:
        dist = abs(wp - 10)
        direction = 'approaching' if wp < prev_wp else 'pulling_away'
        return 'NEAR_LONGSHOT', round(dist, 1), direction

    # Near front-runner threshold (40%)
    if 38 <= wp <= 42:
        dist = abs(wp - 40)
        direction = 'approaching' if wp < prev_wp else 'pulling_away'
        return 'NEAR_CONTENDER', round(dist, 1), direction

    return None, 0.0, ''


# ── Player-Game Stake Building ────────────────────────────────────────────────

def build_player_game_stake(player_name: str, game_entry: dict) -> dict | None:
    """
    Extract this player's directional stake in a specific game.
    Returns None if the player has no stake (< 1% swing).
    """
    sides = game_entry.get('sides', {})
    for side_key in ('team1', 'team2'):
        for p in sides.get(side_key, {}).get('players', []):
            if p['name'] == player_name:
                return {
                    'game_id':        game_entry['game_id'],
                    'matchup':        game_entry['matchup'],
                    'status':         game_entry['status'],
                    'game_phase':     game_entry.get('game_phase', 'pending'),
                    'root_for':       p['root_for'],
                    'if_win':         p['if_win'],
                    'if_loss':        p['if_loss'],
                    'swing':          p['swing'],
                    'stance':         p['stance'],
                    'reason':         p['reason'],
                    'champ_at_stake': p['champ_at_stake'],
                    'directional':    p.get('directional', ''),
                }
    return None


# ── Coverage History Per Player ───────────────────────────────────────────────

def load_player_coverage_history(recent_feed: list, player_names: list) -> dict:
    """
    From recent feed entries, compute per-player coverage stats.
    Returns { player_name: { times_today, last_covered_at, last_covered_angle,
                              last_covered_persona, established_frame,
                              last_covered_stance } }
    """
    history = {
        name: {
            'times_today': 0,
            'last_covered_at': None,
            'last_covered_angle': '',
            'last_covered_persona': '',
            'established_frame': None,
            'last_covered_stance': None,
        }
        for name in player_names
    }
    history['_pool'] = {
        'times_today': 0, 'last_covered_at': None,
        'last_covered_angle': '', 'last_covered_persona': '',
        'established_frame': None, 'last_covered_stance': None,
    }

    names_lower = {n.lower(): n for n in player_names}

    for entry in sorted(recent_feed or [], key=lambda e: e.get('created_at', '')):
        player = entry.get('player_name', '')
        if player == '_pool':
            h = history['_pool']
        else:
            canon = names_lower.get(player.lower())
            if not canon:
                continue
            h = history[canon]

        created = entry.get('created_at')
        if isinstance(created, str):
            try:
                created = datetime.fromisoformat(created.replace('Z', '+00:00'))
            except ValueError:
                created = None

        h['times_today'] += 1
        if created and (h['last_covered_at'] is None or created > h['last_covered_at']):
            h['last_covered_at'] = created
            h['last_covered_angle'] = entry.get('angle', '') or entry.get('entry_type', '')
            h['last_covered_persona'] = entry.get('persona', '')
            # Extract frame and stance from metadata if available
            meta = entry.get('metadata') or {}
            if meta.get('frame'):
                h['established_frame'] = meta['frame']
            if meta.get('stance'):
                h['last_covered_stance'] = meta['stance']

    return history


# ── Threshold Crossing Detection ──────────────────────────────────────────────

def detect_threshold_crossing(stats: dict, prev_stats: dict | None) -> str | None:
    """
    Return the threshold crossed since the last cycle, or None.
    """
    if not prev_stats:
        return None
    wp      = stats.get('win_prob', 0)
    prev_wp = prev_stats.get('win_prob', wp)

    for threshold in (50.0, 10.0, 0.0):
        crossed = (prev_wp > threshold >= wp) or (prev_wp <= threshold < wp)
        if crossed:
            direction = 'above' if wp > threshold else 'below'
            return f'{int(threshold)}pct_{direction}'

    return None


# ── Persona Assignment ────────────────────────────────────────────────────────

PERSONA_MAP = {
    'stat_nerd':          'stat_nerd',
    'color_commentator':  'color_commentator',
    'barkley':            'barkley',
}

def assign_persona(angle: str, stance: str | None, objective: str,
                   persona_counts: dict) -> str:
    """
    Assign persona based on angle and stance.
    Respects global 50% cap per persona.
    """
    total = sum(persona_counts.values()) or 1

    def pick(preferred: str) -> str:
        pct = persona_counts.get(preferred, 0) / total
        if pct >= 0.50:
            # Rotate to second-best
            others = [p for p in ('stat_nerd', 'color_commentator', 'barkley') if p != preferred]
            return min(others, key=lambda p: persona_counts.get(p, 0))
        return preferred

    if angle == 'champ_eliminated':
        return pick('color_commentator')

    if angle in ('champ_in_danger', 'elimination', 'rooting_callout'):
        return pick('barkley')

    if angle == 'stance_flip' and stance == 'PROTECTIVE':
        return pick('barkley')

    if angle == 'game_end':
        return pick('color_commentator')

    if angle in ('trigger_leverage', 'primary_game_live', 'threshold', 'standings_shift'):
        if stance == 'PROTECTIVE' and objective == 'SURVIVE':
            return pick('barkley')
        return pick('stat_nerd')

    if angle == 'context_setting':
        return pick('color_commentator')

    if angle == 'overnight':
        return pick('stat_nerd')

    # Pool-wide entry
    if angle == 'pool_wide':
        return pick('color_commentator')

    return pick('stat_nerd')


# ── Angle Selection ───────────────────────────────────────────────────────────

def select_angle(
    stats: dict,
    prev_stats: dict | None,
    trigger_stake: dict | None,
    primary_game: dict | None,
    player_history: dict,
    objective: str,
    narrative_type: str,
    cycle_time: datetime,
) -> str | None:
    """
    Select the highest-priority angle for this player.
    Returns None if no valid angle (player should be skipped).
    """
    last_angle = player_history.get('last_covered_angle', '')
    last_at    = player_history.get('last_covered_at')

    def recently_used(angle: str, minutes: int = 30) -> bool:
        if last_angle != angle or not last_at:
            return False
        delta = cycle_time - (last_at.replace(tzinfo=timezone.utc)
                               if last_at.tzinfo is None else last_at)
        return delta.total_seconds() < minutes * 60

    # 1. Champ eliminated this cycle
    champ_alive_now  = stats.get('champ_alive', False)
    champ_alive_prev = (prev_stats or {}).get('champ_alive', True)
    if champ_alive_prev and not champ_alive_now:
        return 'champ_eliminated'

    # 2. Champ in danger (live game, trailing in late phases)
    if primary_game and primary_game.get('champ_at_stake'):
        phase = primary_game.get('game_phase', '')
        if (primary_game.get('status') == 'live' and
                phase in ('late_2h', 'crunch', 'ot') and
                primary_game.get('if_loss', 0) < -5 and
                not recently_used('champ_in_danger', 20)):
            return 'champ_in_danger'

    # 3. Elimination: win prob just hit 0
    threshold = detect_threshold_crossing(stats, prev_stats)
    if threshold and '0pct' in threshold:
        if not recently_used('elimination', 60):
            return 'elimination'

    # 4. Other threshold crossings (50%, 10%)
    if threshold and not recently_used('threshold', 45):
        return 'threshold'

    # 5. Stance flip since last coverage
    prev_stance = player_history.get('last_covered_stance')
    if trigger_stake and prev_stance and prev_stance != trigger_stake.get('stance'):
        if not recently_used('stance_flip', 20):
            return 'stance_flip'

    # 6. Trigger leverage: meaningful stake in the trigger game
    if trigger_stake and trigger_stake.get('swing', 0) >= 5:
        if not recently_used('trigger_leverage', 25):
            return 'trigger_leverage'

    # 7. Primary game live
    if primary_game and primary_game.get('status') == 'live':
        if not recently_used('primary_game_live', 25):
            return 'primary_game_live'

    # 8. Standings shift
    # (rank change is in enriched_stats — check if rank moved 2+)
    # Not directly available here; planner can add if needed

    # 9. Context setting: upcoming high-importance game
    if narrative_type in ('overnight', 'deep_dive'):
        return 'context_setting'

    return None


# ── Cluster Detection ─────────────────────────────────────────────────────────

def detect_clusters(player_entries: list) -> list:
    """
    Group players with identical situations into clusters.
    Cluster criteria: same champ pick, same win_prob (within 2%), same primary game, same side.

    Returns list of cluster dicts:
    { cluster_id, players: [name, ...], reason }
    """
    groups = {}
    for p in player_entries:
        if p.get('coverage_decision') == 'SKIP':
            continue
        champ = p.get('champ_pick', '')
        wp    = round(p.get('win_prob', 0) / 2) * 2  # bucket to nearest 2%
        pg    = p.get('primary_game', {})
        pg_id = pg.get('game_id', -1) if pg else -1
        side  = pg.get('root_for', '') if pg else ''
        key   = (champ, wp, pg_id, side)
        groups.setdefault(key, []).append(p['name'])

    clusters = []
    for key, names in groups.items():
        if len(names) < 2:
            continue
        champ, wp, pg_id, side = key
        cluster_id = '_'.join(sorted(n.lower().replace(' ', '') for n in names[:3]))
        clusters.append({
            'cluster_id': cluster_id,
            'players':    names,
            'reason':     f'same_champ_{champ}_same_side_{side}' if champ else 'same_situation',
        })

    return clusters


# ── Word Limit ────────────────────────────────────────────────────────────────

ANGLE_WORD_LIMITS = {
    'champ_eliminated':   55,
    'champ_in_danger':    50,
    'elimination':        50,
    'threshold':          45,
    'stance_flip':        45,
    'trigger_leverage':   45,
    'primary_game_live':  40,
    'standings_shift':    40,
    'context_setting':    45,
    'overnight':          60,
    'pool_wide':          50,
}


# ── Assignment Builder ────────────────────────────────────────────────────────

def build_assignment(
    player_name: str,
    stats: dict,
    objective: str,
    angle: str,
    stance: str | None,
    trigger_stake: dict | None,
    primary_game: dict | None,
    player_history: dict,
    persona_counts: dict,
    rivals: list,
    unique_picks: list,
    best_path: list,
    frame_action: str,
    trigger_game_full: dict | None = None,
) -> dict:
    """
    Build the structured writing brief for the writer.
    """
    persona = assign_persona(angle, stance, objective, persona_counts)
    persona_counts[persona] = persona_counts.get(persona, 0) + 1

    frame = player_history.get('established_frame') or _default_frame(
        player_name, objective, primary_game, stats,
    )

    # Headline fact: the single most important thing
    headline = _build_headline(angle, stats, trigger_stake, primary_game, rivals,
                               trigger_game_full=trigger_game_full)

    # Supporting facts (2-4 additional context points)
    supporting = _build_supporting_facts(
        angle, stats, objective, trigger_stake, primary_game,
        rivals, unique_picks, best_path,
        trigger_game_full=trigger_game_full,
    )

    # must_avoid: recent phrases/angles this player was covered with
    must_avoid = _build_must_avoid(player_history, angle)

    return {
        'player_name':        player_name,
        'persona':            persona,
        'angle':              angle,
        'stance':             stance,
        'objective':          objective,
        'headline_fact':      headline,
        'supporting_facts':   supporting,
        'directional_context': trigger_stake.get('directional', '') if trigger_stake else
                               (primary_game.get('directional', '') if primary_game else ''),
        'established_frame':  frame,
        'frame_action':       frame_action,
        'max_words':          ANGLE_WORD_LIMITS.get(angle, 45),
        'must_avoid':         must_avoid,
    }


def _default_frame(player_name: str, objective: str, primary_game: dict | None,
                    stats: dict) -> str:
    wp = stats.get('win_prob', 0)
    if objective == 'PROTECT_LEAD':
        return f'{player_name} is in the lead ({wp:.0f}% win) — managing the field'
    if objective == 'SURVIVE':
        game = primary_game.get('matchup', 'their key game') if primary_game else 'their key game'
        champ = stats.get('champ_pick', 'their pick')
        return f'{player_name} watching {game} — {champ} on the floor'
    if objective == 'LONGSHOT':
        return f'{player_name} is a longshot ({wp:.0f}%) needing things to break right'
    if objective == 'CONTENDER':
        return f'{player_name} is in contention at {wp:.0f}%'
    if objective == 'PRIZE_RACE':
        return f'{player_name} is out of win contention but fighting for a prize'
    return f'{player_name} is watching from the sideline'


def _build_headline(angle: str, stats: dict, trigger_stake: dict | None,
                    primary_game: dict | None, rivals: list,
                    trigger_game_full: dict | None = None) -> str:
    wp    = stats.get('win_prob', 0)
    champ = stats.get('champ_pick', '')
    game  = primary_game or trigger_stake

    if angle == 'champ_eliminated':
        result = trigger_game_full.get('result_sentence', '') if trigger_game_full else ''
        result_note = f" ({result})" if result else ""
        return f"Champion {champ} just got eliminated{result_note}"
    if angle == 'champ_in_danger':
        g = primary_game or {}
        return f"{champ} is live and trailing in {g.get('matchup', 'their game')} — {g.get('game_note', '')}"
    if angle == 'elimination':
        return f"Win probability just hit 0% — out of championship contention"
    if angle == 'threshold':
        delta = stats.get('win_prob_delta', 0)
        dir_  = 'climbed to' if delta > 0 else 'dropped to'
        return f"Win probability {dir_} {wp:.1f}%"
    if angle == 'stance_flip':
        game_name = (primary_game or trigger_stake or {}).get('matchup', 'their key game')
        stance = (trigger_stake or primary_game or {}).get('stance', '')
        return f"Situation in {game_name} just shifted — now {stance.lower().replace('_', ' ')}"
    if angle in ('trigger_leverage', 'primary_game_live') and game:
        root_for = game.get('root_for', '')
        swing    = game.get('swing', 0)
        matchup  = game.get('matchup', '')
        return f"Root for {root_for} in {matchup} — {swing:.1f}% personal swing"
    if angle == 'context_setting' and game:
        return f"Upcoming: {game.get('matchup', 'key game')} — {game.get('directional', '')}"
    if rivals and angle in ('trigger_leverage', 'primary_game_live'):
        rival = rivals[0]
        return f"Head-to-head with {rival['name']} — opposite sides of {rival.get('game', 'this game')}"
    return f"Pool update: {wp:.1f}% win probability, rank {stats.get('rank', '?')}"


def _build_supporting_facts(angle: str, stats: dict, objective: str,
                             trigger_stake: dict | None, primary_game: dict | None,
                             rivals: list, unique_picks: list, best_path: list,
                             trigger_game_full: dict | None = None) -> list[str]:
    facts = []
    wp = stats.get('win_prob', 0)
    rank = stats.get('rank', '?')
    pool_size = stats.get('pool_size', '?')

    # Result sentence first — grounded fact prevents winner hallucination
    if trigger_game_full and trigger_game_full.get('result_sentence'):
        facts.append(trigger_game_full['result_sentence'])

    # Directional context always surfaces for COVER entries
    game = trigger_stake or primary_game
    if game and game.get('directional'):
        facts.append(game['directional'])

    # Standings context
    facts.append(f"#{rank} of {pool_size} | {wp:.1f}% win | {stats.get('points', 0)} pts")

    # Rival context
    if rivals:
        r = rivals[0]
        facts.append(f"Head-to-head: {r['name']} is on the opposite side of {r.get('game', 'this game')}")

    # Best path bullets (top 2)
    for bullet in (best_path or [])[:2]:
        facts.append(f"Path: {bullet}")

    # Unique pick callout
    if unique_picks:
        facts.append(f"Unique pick still alive: {unique_picks[0]}")

    # Prize odds if relevant
    any_prize = stats.get('any_prize_prob', 0)
    if objective in ('LONGSHOT', 'PRIZE_RACE') and any_prize > 0:
        facts.append(f"Any prize: {any_prize:.1f}%")

    return facts[:5]  # cap at 5


def _build_must_avoid(player_history: dict, current_angle: str) -> list[str]:
    """
    Build a list of recently-used phrases/angles to avoid for this player.
    """
    avoid = []
    last_angle = player_history.get('last_covered_angle', '')
    if last_angle and last_angle != current_angle:
        avoid.append(f'rehashing the {last_angle.replace("_", " ")} angle already covered')
    last_frame = player_history.get('established_frame', '')
    if last_frame:
        avoid.append('re-explaining the established frame — just work within it')
    avoid.append('inventing percentages or scores not given in the facts')
    avoid.append('inventing the winner of any game — only state winners explicitly given in the brief')
    return avoid


# ── Main Build Function ───────────────────────────────────────────────────────

def build_player_map(
    game_map:        dict,
    enriched_stats:  dict,
    prev_stats:      dict | None,
    narrative_type:  str,
    recent_feed:     list,
    players:         list,
    prize_places:    list[int],
    cycle_time:      datetime | None = None,
) -> dict:
    """
    Build the full player map for this cycle.

    Returns:
    {
      'players':       [player_map_entry, ...],
      'clusters':      [cluster_entry, ...],
      'persona_counts': { persona: int },
    }
    """
    cycle_time = cycle_time or datetime.now(timezone.utc)

    trigger_id         = game_map.get('trigger_game_id')
    trigger_game       = get_game(game_map, trigger_id) if trigger_id is not None else None
    trigger_game_entry = trigger_game  # full game_map entry (has result_sentence etc.)

    player_names = [p['username'] for p in players]
    pool_size    = len(players)

    # Coverage history per player
    player_history = load_player_coverage_history(recent_feed, player_names)

    # Ranked players
    ranked = sorted(
        enriched_stats.items(),
        key=lambda x: (-x[1].get('win_prob', 0), -x[1].get('points', 0)),
    )

    # Persona counts (shared across all assignments in this cycle)
    persona_counts: dict[str, int] = {'stat_nerd': 0, 'color_commentator': 0, 'barkley': 0}

    player_entries = []

    for name, stats in ranked:
        stats = dict(stats)
        stats['pool_size'] = pool_size
        prev = (prev_stats or {}).get(name)
        hist = player_history.get(name, {})

        # Objective
        objective = classify_objective(stats, trigger_game)
        if objective == 'SURVIVE':
            # Check if champ is in ANY live game, not just trigger
            champ = stats.get('champ_pick', '')
            for g in game_map.get('games', []):
                if g.get('status') == 'live' and champ in (g.get('team1', ''), g.get('team2', '')):
                    objective = 'SURVIVE'
                    break
            else:
                objective = classify_objective({**stats, 'champ_alive': False}, None) \
                    if stats.get('champ_alive') else 'SPECTATOR'

        # Trajectory + danger zone
        delta    = stats.get('win_prob_delta', 0)
        traj     = classify_trajectory(delta)
        danger, nearest_threshold, threshold_dir = classify_danger_zone(stats, prev)

        # Build player-game stakes from game map
        all_stakes = []
        for g in game_map.get('games', []):
            stake = build_player_game_stake(name, g)
            if stake:
                stake['is_trigger'] = g.get('is_trigger', False)
                all_stakes.append(stake)

        all_stakes.sort(key=lambda s: (-s['swing'], 0 if s['status'] == 'live' else 1))

        trigger_stake  = next((s for s in all_stakes if s.get('is_trigger')), None)
        primary_game   = all_stakes[0] if all_stakes else None
        secondary_games = all_stakes[1:3]

        # Rivals: players on opposite sides of primary game
        rivals = []
        if primary_game:
            for g in game_map.get('games', []):
                if g['game_id'] == primary_game['game_id']:
                    root = primary_game['root_for']
                    # Find players on the OTHER side
                    opp_side_key = 'team1' if root == g.get('team2') else 'team2'
                    for opp in g['sides'].get(opp_side_key, {}).get('players', []):
                        rivals.append({
                            'name':          opp['name'],
                            'game':          g['matchup'],
                            'conflict_type': 'champ_vs_champ' if (
                                opp.get('champ_at_stake') and
                                (primary_game or {}).get('champ_at_stake')
                            ) else 'rival',
                            'their_stance':  opp.get('stance', ''),
                        })
                    break

        # Prize vs win tension
        prize_root_conflict = None
        if stats.get('any_prize_prob', 0) > 0 and stats.get('win_prob', 0) < 1:
            # Simple heuristic: if primary_game root_for differs from prize optimization
            # (We don't have per-game prize deltas currently — flag when prize_race objective)
            if objective == 'PRIZE_RACE' and primary_game:
                prize_root_conflict = f"Root for {primary_game['root_for']} (win path) — check prize implications"

        # Coverage decision
        coverage_decision, skip_reason = _make_coverage_decision(
            name, stats, prev, trigger_stake, primary_game,
            hist, cycle_time, objective, narrative_type,
        )

        # Angle selection
        angle = None
        if coverage_decision != 'SKIP':
            angle = select_angle(
                stats, prev, trigger_stake, primary_game,
                hist, objective, narrative_type, cycle_time,
            )
            if angle is None:
                coverage_decision = 'SKIP'
                skip_reason = 'no_valid_angle'

        # Frame action
        frame_action = _determine_frame_action(hist, stats, prev, primary_game, trigger_stake)

        # Assignment
        assignment = None
        if coverage_decision in ('COVER', 'CLUSTER_COVER') and angle:
            assignment = build_assignment(
                player_name=name,
                stats=stats,
                objective=objective,
                angle=angle,
                stance=(trigger_stake or primary_game or {}).get('stance') if (trigger_stake or primary_game) else None,
                trigger_stake=trigger_stake,
                primary_game=primary_game,
                player_history=hist,
                persona_counts=persona_counts,
                rivals=rivals,
                unique_picks=stats.get('unique_picks', []),
                best_path=stats.get('best_path_bullets', []),
                frame_action=frame_action,
                trigger_game_full=trigger_game_entry,
            )

        player_entries.append({
            'name':             name,
            'rank':             stats.get('rank', '?'),
            'pool_size':        pool_size,
            'win_prob':         stats.get('win_prob', 0),
            'win_prob_delta':   delta,
            'trajectory':       traj,
            'points':           stats.get('points', 0),
            'ppr':              stats.get('ppr', 0),
            'champ_pick':       stats.get('champ_pick', ''),
            'champ_alive':      stats.get('champ_alive', False),
            'any_prize_prob':   stats.get('any_prize_prob', 0),
            'finish_probs':     stats.get('finish_place_probs', {}),
            'objective':        objective,
            'danger_zone':      danger,
            'nearest_threshold': nearest_threshold,
            'threshold_direction': threshold_dir,
            'primary_game':     primary_game,
            'secondary_games':  secondary_games,
            'trigger_stake':    trigger_stake,
            'rivals':           rivals,
            'prize_win_tension': prize_root_conflict is not None,
            'prize_root_conflict': prize_root_conflict,
            'unique_picks':     stats.get('unique_picks', []),
            'shared_picks':     stats.get('shared_picks', []),
            'best_path_bullets': stats.get('best_path_bullets', []),
            'cluster_id':       None,       # filled in after cluster detection
            'cluster_players':  [],
            'coverage_decision': coverage_decision,
            'skip_reason':      skip_reason,
            'last_covered_at':  hist.get('last_covered_at'),
            'last_covered_angle': hist.get('last_covered_angle', ''),
            'established_frame': hist.get('established_frame'),
            'assignment':       assignment,
        })

    # Cluster detection + CLUSTER_COVER assignment
    clusters = detect_clusters(player_entries)
    cluster_lookup = {}
    for cluster in clusters:
        for pname in cluster['players']:
            cluster_lookup[pname] = cluster

    for entry in player_entries:
        cl = cluster_lookup.get(entry['name'])
        if cl:
            entry['cluster_id']      = cl['cluster_id']
            entry['cluster_players'] = [p for p in cl['players'] if p != entry['name']]

            # Only the first player in cluster actually generates an entry; rest get CLUSTER_COVER
            if entry['coverage_decision'] == 'COVER':
                first = cl['players'][0]
                if entry['name'] != first:
                    entry['coverage_decision'] = 'CLUSTER_COVER'
                    entry['skip_reason'] = f'cluster:{cl["cluster_id"]} — covered by {first}'
                    entry['assignment'] = None

    # Tie detection — flag players with the same points so the writer doesn't say "coin flip"
    from collections import defaultdict
    points_groups: dict[int, list[str]] = defaultdict(list)
    for entry in player_entries:
        points_groups[entry['points']].append(entry['name'])

    for entry in player_entries:
        tied_names = [n for n in points_groups[entry['points']] if n != entry['name']]
        entry['tied_with'] = tied_names
        if tied_names and entry.get('assignment'):
            # Decide tiebreaker framing based on remaining games
            live_or_upcoming = [
                g for g in game_map.get('games', [])
                if g['status'] in ('live', 'upcoming')
            ]
            if live_or_upcoming:
                # Find first game where tied players' picks differ
                tiebreaker_game = None
                for g in sorted(live_or_upcoming, key=lambda x: x['game_id']):
                    t1_names = {p['name'] for p in g['sides'].get('team1', {}).get('players', [])}
                    t2_names = {p['name'] for p in g['sides'].get('team2', {}).get('players', [])}
                    tied_on_t1 = [n for n in tied_names if n in t1_names]
                    tied_on_t2 = [n for n in tied_names if n in t2_names]
                    self_on_t1 = entry['name'] in t1_names
                    self_on_t2 = entry['name'] in t2_names
                    if (self_on_t1 and tied_on_t2) or (self_on_t2 and tied_on_t1):
                        tiebreaker_game = g['matchup']
                        break
                if tiebreaker_game:
                    tie_fact = (f"Tied with {', '.join(tied_names)} in points — "
                                f"{tiebreaker_game} is the real tiebreaker (they're rooting for opposite sides)")
                else:
                    tie_fact = f"Tied with {', '.join(tied_names)} in points — no divergent game found yet"
            else:
                # No games remain — tie stands, admin decides
                tie_fact = (f"Tied with {', '.join(tied_names)} — same points, no games remain. "
                            f"Pool admin determines final placement.")
            entry['assignment']['supporting_facts'].append(tie_fact)

    return {
        'players':       player_entries,
        'clusters':      clusters,
        'persona_counts': persona_counts,
    }


# ── Coverage Decision ─────────────────────────────────────────────────────────

def _make_coverage_decision(
    name: str,
    stats: dict,
    prev_stats: dict | None,
    trigger_stake: dict | None,
    primary_game: dict | None,
    hist: dict,
    cycle_time: datetime,
    objective: str,
    narrative_type: str,
) -> tuple[str, str | None]:
    """
    Decide COVER / SKIP for this player this cycle.
    Returns (decision, skip_reason).
    """
    last_at = hist.get('last_covered_at')
    mins_since = None
    if last_at:
        delta = cycle_time - (last_at.replace(tzinfo=timezone.utc)
                               if last_at.tzinfo is None else last_at)
        mins_since = delta.total_seconds() / 60

    # Hard skip: covered in last 30 min with no champ event
    recently_covered = mins_since is not None and mins_since < 30

    # Check for champ elimination (always cover)
    champ_was_alive = (prev_stats or {}).get('champ_alive', True)
    champ_eliminated = champ_was_alive and not stats.get('champ_alive', True)
    if champ_eliminated:
        return 'COVER', None

    # Check for threshold crossing (always cover)
    threshold = detect_threshold_crossing(stats, prev_stats)
    if threshold:
        return 'COVER', None

    # Overnight: everyone with a real stake gets covered
    if narrative_type == 'overnight':
        if objective not in ('SPECTATOR',) and not recently_covered:
            return 'COVER', None
        return 'SKIP', 'overnight_no_stake_or_recent'

    # Meaningful stake in trigger game
    if trigger_stake and trigger_stake.get('swing', 0) >= 3:
        if not recently_covered:
            return 'COVER', None
        return 'SKIP', f'trigger_stake_but_covered_{int(mins_since or 0)}min_ago'

    # 2+ hours without coverage + live game stake
    if mins_since is not None and mins_since >= 120:
        if primary_game and primary_game.get('status') == 'live' and primary_game.get('swing', 0) >= 5:
            return 'COVER', None

    # Default: skip
    reasons = []
    if not trigger_stake or trigger_stake.get('swing', 0) < 3:
        reasons.append('no_trigger_stake')
    if recently_covered:
        reasons.append(f'covered_{int(mins_since or 0)}min_ago')
    if not threshold:
        reasons.append('no_threshold_crossing')
    return 'SKIP', '_'.join(reasons) or 'no_cover_condition_met'


# ── Frame Action ──────────────────────────────────────────────────────────────

def _determine_frame_action(hist: dict, stats: dict, prev_stats: dict | None,
                              primary_game: dict | None,
                              trigger_stake: dict | None) -> str:
    """
    Determine whether to establish, maintain, escalate, or resolve the frame.
    """
    existing_frame = hist.get('established_frame')
    prev_stance = hist.get('last_covered_stance')
    current_stance = (trigger_stake or primary_game or {}).get('stance', '') \
        if (trigger_stake or primary_game) else ''

    if not existing_frame:
        return 'establish'

    # Resolve: champ eliminated or player eliminated
    if not stats.get('champ_alive', True) and (prev_stats or {}).get('champ_alive', True):
        return 'resolve'
    if stats.get('win_prob', 0) == 0 and (prev_stats or {}).get('win_prob', 1) > 0:
        return 'resolve'

    # Escalate: stance changed significantly
    if prev_stance and current_stance and prev_stance != current_stance:
        if 'PROTECTIVE' in current_stance or current_stance == 'DECISIVE':
            return 'escalate'

    return 'maintain'
