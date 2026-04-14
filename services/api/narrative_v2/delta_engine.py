"""
Delta engine — deterministic candidate event generation.

Sits on top of the state engine (enriched_stats, leverage, tournament context).
Converts raw state diffs into named narrative events with importance scores.

No LLM. All logic is enumerable if/elif checks over known event types.

Key principle: only produce events that pass minimum thresholds.
A 0.2% win probability fluctuation within the same game is noise, not an event.
"""

from __future__ import annotations

# ── Minimum thresholds ─────────────────────────────────────────────────────────
# Events below these thresholds are suppressed as noise.

MIN_WIN_PROB_DELTA = 2.0       # % — don't narrate win prob changes smaller than this
MIN_PRIZE_PROB_DELTA = 3.0     # % — don't narrate prize prob changes smaller than this
MIN_LEVERAGE_SWING = 3.0       # % — don't highlight games with less personal swing
MIN_RANK_CHANGE = 1            # positions — don't narrate rank change of 0


# ── Event types ────────────────────────────────────────────────────────────────

EVENT_TYPES = {
    # Game-level events
    'game_started':           'A game just tipped off',
    'game_ended':             'A game just finished',
    'score_changed':          'Live score update',
    'upset_in_progress':      'Lower seed leading late',
    'upset_final':            'Upset result — lower seed won',

    # Player-level events
    'champ_eliminated':       'Champion pick lost',
    'champ_advancing':        'Champion pick won and advancing',
    'champ_in_danger':        'Champion pick trailing late',
    'elimination_complete':   'Player now at 0% win prob',
    'prize_locked':           'Player prize position confirmed (100%)',
    'win_prob_surge':         'Win probability jumped significantly',
    'win_prob_crash':         'Win probability dropped significantly',
    'rank_change':            'Player moved in standings',
    'contention_entered':     'Player crossed into realistic contention (>10%)',
    'contention_exited':      'Player dropped below realistic contention (<5%)',

    # Pool-level events
    'leader_change':          'New pool leader',
    'positions_locked':       'All prize positions settled at 100%',
    'leverage_game_live':     'High-leverage game just started',
    'leverage_game_resolved': 'High-leverage game just ended',

    # Rooting events
    'rooting_direction':      'Clear rooting advice based on leverage',
}


def compute_candidate_events(
    enriched_stats: dict,
    prev_enriched_stats: dict | None,
    tournament_context: dict,
    leverage_games: list,
    narrative_type: str,
    just_finished: str,
) -> list[dict]:
    """
    Compute candidate narrative events from current + previous state.

    Each event is a dict:
    {
        'event_type': str,           # key from EVENT_TYPES
        'importance': float,         # 0-10 scale, higher = more newsworthy
        'affected_players': [str],   # player names this event impacts
        'teams': [str],              # teams involved
        'headline': str,             # one-line summary
        'data': dict,                # supporting numbers for the planner
    }

    Events are sorted by importance descending.
    Only events above minimum thresholds are included.
    """
    events = []
    prev = prev_enriched_stats or {}

    # ── Game-level events ──────────────────────────────────────────────────

    if just_finished:
        events.append({
            'event_type': 'game_ended',
            'importance': 7.0,
            'affected_players': [],  # filled below
            'teams': _extract_teams(just_finished),
            'headline': just_finished,
            'data': {},
        })

    # Live games from tournament context
    live_games = tournament_context.get('live_games', [])
    if live_games and narrative_type == 'deep_dive':
        for lg_str in live_games:
            events.append({
                'event_type': 'score_changed',
                'importance': 3.0,
                'affected_players': [],
                'teams': _extract_teams(lg_str),
                'headline': lg_str,
                'data': {},
            })

    # ── Player-level events ────────────────────────────────────────────────

    for name, stats in enriched_stats.items():
        prev_stats = prev.get(name, {})
        wp = stats.get('win_prob', 0)
        prev_wp = prev_stats.get('win_prob', wp)  # default to current if no prev
        wp_delta = wp - prev_wp

        prize = stats.get('any_prize_prob', 0)
        prev_prize = prev_stats.get('any_prize_prob', prize)
        prize_delta = prize - prev_prize

        rank = stats.get('rank', 99)
        prev_rank = prev_stats.get('rank', rank)

        champ = stats.get('champ_pick')
        champ_alive = stats.get('champ_alive', False)
        prev_champ_alive = prev_stats.get('champ_alive', champ_alive)

        ppr = stats.get('ppr', 0)

        # ── Champion events ────────────────────────────────────────────

        # Champ just eliminated (was alive, now dead)
        if prev_champ_alive and not champ_alive and champ:
            events.append({
                'event_type': 'champ_eliminated',
                'importance': 9.0,
                'affected_players': [name],
                'teams': [champ],
                'headline': f"{name}'s champion pick {champ} eliminated",
                'data': {'champ_pick': champ, 'win_prob': wp, 'prize_prob': prize},
            })

        # Champ just advanced (game ended, champ still alive, in just_finished)
        if champ_alive and champ and just_finished and champ in just_finished:
            # Only fire if the champ WON (their name appears with "def.")
            if f"{champ} def" in just_finished or f"def. {champ}" not in just_finished:
                events.append({
                    'event_type': 'champ_advancing',
                    'importance': 6.0,
                    'affected_players': [name],
                    'teams': [champ],
                    'headline': f"{name}'s champion pick {champ} advances",
                    'data': {'champ_pick': champ, 'win_prob': wp},
                })

        # ── Win probability events ─────────────────────────────────────

        # Surge
        if wp_delta >= MIN_WIN_PROB_DELTA and prev_wp > 0:
            events.append({
                'event_type': 'win_prob_surge',
                'importance': min(8.0, 4.0 + abs(wp_delta) / 5),
                'affected_players': [name],
                'teams': [],
                'headline': f"{name} win prob surged {prev_wp:.1f}% → {wp:.1f}% (+{wp_delta:.1f}%)",
                'data': {'win_prob': wp, 'prev_win_prob': prev_wp, 'delta': wp_delta},
            })

        # Crash
        if wp_delta <= -MIN_WIN_PROB_DELTA and wp > 0:
            events.append({
                'event_type': 'win_prob_crash',
                'importance': min(8.0, 4.0 + abs(wp_delta) / 5),
                'affected_players': [name],
                'teams': [],
                'headline': f"{name} win prob dropped {prev_wp:.1f}% → {wp:.1f}% ({wp_delta:.1f}%)",
                'data': {'win_prob': wp, 'prev_win_prob': prev_wp, 'delta': wp_delta},
            })

        # ── Threshold crossings ────────────────────────────────────────

        # Full elimination (first time at 0%)
        if wp == 0 and prev_wp > 0 and ppr == 0:
            events.append({
                'event_type': 'elimination_complete',
                'importance': 7.0,
                'affected_players': [name],
                'teams': [],
                'headline': f"{name} fully eliminated — 0% win prob, 0 PPR",
                'data': {'win_prob': 0, 'ppr': 0, 'prize_prob': prize},
            })

        # Prize position locked
        if prize == 100 and prev_prize < 100:
            place_probs = stats.get('finish_place_probs', {})
            locked_place = None
            for place, prob in sorted(place_probs.items()):
                if prob == 100:
                    locked_place = place
                    break
            events.append({
                'event_type': 'prize_locked',
                'importance': 6.0,
                'affected_players': [name],
                'teams': [],
                'headline': f"{name} locked into {'place ' + str(locked_place) if locked_place else 'a prize'}",
                'data': {'prize_prob': 100, 'locked_place': locked_place},
            })

        # Entered contention (crossed 10% from below)
        if wp >= 10 and prev_wp < 10 and prev_wp > 0:
            events.append({
                'event_type': 'contention_entered',
                'importance': 5.0,
                'affected_players': [name],
                'teams': [],
                'headline': f"{name} crossed into contention at {wp:.1f}%",
                'data': {'win_prob': wp, 'prev_win_prob': prev_wp},
            })

        # Exited contention (dropped below 5% from above)
        if wp < 5 and prev_wp >= 5:
            events.append({
                'event_type': 'contention_exited',
                'importance': 5.0,
                'affected_players': [name],
                'teams': [],
                'headline': f"{name} dropped below contention at {wp:.1f}%",
                'data': {'win_prob': wp, 'prev_win_prob': prev_wp},
            })

        # ── Rank change ────────────────────────────────────────────────

        if abs(rank - prev_rank) >= MIN_RANK_CHANGE and prev_rank != rank:
            direction = 'up' if rank < prev_rank else 'down'
            events.append({
                'event_type': 'rank_change',
                'importance': 3.5 + abs(rank - prev_rank) * 0.5,
                'affected_players': [name],
                'teams': [],
                'headline': f"{name} moved {direction} from #{prev_rank} to #{rank}",
                'data': {'rank': rank, 'prev_rank': prev_rank},
            })

    # ── Pool-level events ──────────────────────────────────────────────────

    # Leader change
    if enriched_stats and prev:
        current_leader = min(enriched_stats.items(), key=lambda x: x[1].get('rank', 99))
        prev_leader = min(prev.items(), key=lambda x: x[1].get('rank', 99)) if prev else (None, {})
        if current_leader[0] != prev_leader[0] and prev_leader[0]:
            events.append({
                'event_type': 'leader_change',
                'importance': 7.5,
                'affected_players': [current_leader[0], prev_leader[0]],
                'teams': [],
                'headline': f"New pool leader: {current_leader[0]} overtakes {prev_leader[0]}",
                'data': {},
            })

    # All positions locked
    all_locked = all(
        s.get('any_prize_prob', 0) == 100 or s.get('no_prize_prob', 0) == 100
        for s in enriched_stats.values()
    )
    if all_locked and prev:
        prev_all_locked = all(
            s.get('any_prize_prob', 0) == 100 or s.get('no_prize_prob', 0) == 100
            for s in prev.values()
        )
        if not prev_all_locked:
            events.append({
                'event_type': 'positions_locked',
                'importance': 8.0,
                'affected_players': list(enriched_stats.keys()),
                'teams': [],
                'headline': 'All prize positions now settled',
                'data': {},
            })

    # ── Leverage-based rooting events ──────────────────────────────────────

    for game in (leverage_games or [])[:5]:
        if game.get('status') != 'live':
            continue
        for impact in game.get('playerImpacts', []):
            swing = impact.get('swing', 0)
            if swing >= MIN_LEVERAGE_SWING:
                events.append({
                    'event_type': 'rooting_direction',
                    'importance': 2.0 + swing / 10,
                    'affected_players': [impact['player']],
                    'teams': [game.get('team1', ''), game.get('team2', '')],
                    'headline': f"{impact['player']} needs {impact['rootFor']} (±{swing}%)",
                    'data': {
                        'matchup': game.get('matchup', ''),
                        'root_for': impact.get('rootFor', ''),
                        'swing': swing,
                        'game_status': game.get('status', ''),
                    },
                })

    # ── Enrich game_ended event with affected players ──────────────────────

    if just_finished:
        teams_in_result = _extract_teams(just_finished)
        game_end_events = [e for e in events if e['event_type'] == 'game_ended']
        for ge in game_end_events:
            # Find players affected by this game result
            affected = set()
            for name, stats in enriched_stats.items():
                # Player has picks involving these teams
                for lev in stats.get('personal_leverage', []):
                    for team in teams_in_result:
                        if team in lev.get('matchup', ''):
                            affected.add(name)
                # Champion pick was one of these teams
                if stats.get('champ_pick') in teams_in_result:
                    affected.add(name)
            ge['affected_players'] = list(affected)

    # ── Sort by importance, highest first ──────────────────────────────────

    events.sort(key=lambda e: -e['importance'])

    return events


def _extract_teams(text: str) -> list[str]:
    """Extract team names from a game result string like 'Duke Blue Devils def. UConn Huskies 73-72'."""
    if not text:
        return []
    teams = []
    # Pattern: "CHAMP ELIMINATED: Duke Blue Devils lost 73-72 (championship pick for: ...)"
    if 'CHAMP ELIMINATED:' in text:
        text = text.split('CHAMP ELIMINATED:')[1].split('(')[0].strip()
    # Pattern: "Team A def. Team B 73-72" or "Team A def Team B"
    if ' def.' in text or ' def ' in text:
        sep = ' def.' if ' def.' in text else ' def '
        parts = text.split(sep, 1)
        teams.append(parts[0].strip())
        if len(parts) > 1:
            # Remove score from end
            rest = parts[1].strip()
            # Remove anything after last digit sequence
            import re
            rest = re.sub(r'\s+\d+[-–]\d+.*$', '', rest).strip()
            if rest:
                teams.append(rest)
    return teams


def summarize_events(events: list[dict], max_events: int = 8) -> str:
    """
    Produce a compact text summary of candidate events for the planner packet.
    Only includes top events by importance.
    """
    top = events[:max_events]
    if not top:
        return 'No candidate events this cycle.'

    lines = []
    for i, e in enumerate(top, 1):
        players_str = ', '.join(e['affected_players'][:4]) if e['affected_players'] else 'pool-wide'
        lines.append(
            f"  {i}. [{e['event_type']}] (importance: {e['importance']:.1f}) "
            f"— {e['headline']} (affects: {players_str})"
        )

    return 'Candidate events (sorted by importance):\n' + '\n'.join(lines)
