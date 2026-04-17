"""
NBA Playoffs adapter.

Simpler than March Madness — no bracket Monte Carlo needed.
Series outcomes are modeled as independent Bernoulli trials using market/model odds.
"""
from datetime import datetime, timezone
from typing import Any
import math
import random

from adapters.base import GameAdapter
from adapters.nba_playoffs_snapshot import NBA_PLAYOFFS_SERIES_SNAPSHOT, NBA_PLAYOFFS_SERIES_STATE

ROUND_NUMBER_TO_KEY = {1: "round_1", 2: "semifinals", 3: "finals", 4: "nba_finals"}

SERIES_WIN_TABLE = {
    4: lambda p: p**4,
    5: lambda p: 4 * p**4 * (1-p),
    6: lambda p: 10 * p**4 * (1-p)**2,
    7: lambda p: 20 * p**4 * (1-p)**3,
}


def series_win_prob(home_win_pct: float, predicted_games: int) -> float:
    """P(home team wins series in exactly predicted_games games)."""
    p = home_win_pct / 100
    fn = SERIES_WIN_TABLE.get(predicted_games)
    return fn(p) if fn else 0.0


def build_exact_result_distribution(
    home_win_pct: float,
    current_home_wins: int = 0,
    current_away_wins: int = 0,
) -> dict[str, float]:
    """Return exact-result percentages keyed as home_4 ... away_7."""
    p = max(0.1, min(home_win_pct / 100, 0.9))
    games_played = current_home_wins + current_away_wins
    home_needed = max(0, 4 - current_home_wins)
    away_needed = max(0, 4 - current_away_wins)
    distribution = {
        f"{side}_{games}": 0.0 for side in ("home", "away") for games in range(4, 8)
    }

    if home_needed == 0:
        distribution[f"home_{games_played}"] = 100.0
        return distribution
    if away_needed == 0:
        distribution[f"away_{games_played}"] = 100.0
        return distribution

    min_remaining_games = min(home_needed, away_needed)
    max_remaining_games = home_needed + away_needed - 1

    for remaining_games in range(min_remaining_games, max_remaining_games + 1):
        final_games = games_played + remaining_games
        if not 4 <= final_games <= 7:
            continue

        if remaining_games >= home_needed:
            home_probability = (
                math.comb(remaining_games - 1, home_needed - 1)
                * (p ** home_needed)
                * ((1 - p) ** (remaining_games - home_needed))
            )
            distribution[f"home_{final_games}"] = round(home_probability * 100, 4)

        if remaining_games >= away_needed:
            away_probability = (
                math.comb(remaining_games - 1, away_needed - 1)
                * ((1 - p) ** away_needed)
                * (p ** (remaining_games - away_needed))
            )
            distribution[f"away_{final_games}"] = round(away_probability * 100, 4)

    return distribution


class NBAPlayoffsAdapter(GameAdapter):
    product_key = 'nba_playoffs'

    def __init__(self, supabase_client):
        self.db = supabase_client

    def _get_pool_settings(self, pool_id: str) -> dict[str, Any]:
        response = self.db.from_('pools').select('settings, scoring_config').eq('id', pool_id).maybe_single().execute()
        pool = response.data or {}
        return {
            **(pool.get('settings') or {}),
            "__scoring_config": pool.get('scoring_config') or {},
        }

    def _get_round_scoring(self, round_key: str, settings: dict[str, Any]) -> dict[str, int]:
        fallback = {
            'round_1': {'exactBase': 5, 'edgeBonus': 1, 'offBy1': 3, 'offBy2': 1},
            'semifinals': {'exactBase': 7, 'edgeBonus': 1, 'offBy1': 4, 'offBy2': 1},
            'finals': {'exactBase': 9, 'edgeBonus': 1, 'offBy1': 5, 'offBy2': 2},
            'nba_finals': {'exactBase': 11, 'edgeBonus': 1, 'offBy1': 6, 'offBy2': 2},
        }.get(round_key, {'exactBase': 5, 'edgeBonus': 1, 'offBy1': 3, 'offBy2': 1})
        custom = (settings or {}).get('round_scoring', {}).get(round_key, {})
        return {
            'exactBase': int(custom.get('exactBase', fallback['exactBase'])),
            'edgeBonus': int(custom.get('edgeBonus', fallback['edgeBonus'])),
            'offBy1': int(custom.get('offBy1', fallback['offBy1'])),
            'offBy2': int(custom.get('offBy2', fallback['offBy2'])),
        }

    def _score_pick_against_result(self, pick: dict[str, Any] | None, result: dict[str, Any] | None, round_key: str, settings: dict[str, Any]) -> dict[str, Any] | None:
        if not pick or not result:
            return None
        if pick.get('winner_team_id') != result.get('winner_team_id'):
            return {'points': 0, 'outcome': 'miss', 'label': 'Wrong winner'}

        scoring = self._get_round_scoring(round_key, settings)
        game_diff = abs(int(pick.get('predicted_games', 0) or 0) - int(result.get('games', 0) or 0))
        if game_diff == 0:
            edge_bonus = scoring['edgeBonus'] if int(result.get('games', 0)) in (4, 7) else 0
            return {
                'points': scoring['exactBase'] + edge_bonus,
                'outcome': 'exact',
                'label': f"Exact {result.get('games')}-game call" if edge_bonus else 'Exact series and length',
            }
        if game_diff == 1:
            return {'points': scoring['offBy1'], 'outcome': 'close', 'label': 'Correct winner, off by 1 game'}
        if game_diff == 2:
            return {'points': scoring['offBy2'], 'outcome': 'near', 'label': 'Correct winner, off by 2 games'}
        return {'points': 0, 'outcome': 'miss', 'label': 'Correct winner, too far on length'}

    def _normalize_weights(self, weights: list[float]) -> list[float]:
        total = sum(weights) or 1.0
        return [weight / total for weight in weights]

    def _sample_by_weights(self, values: list[Any], weights: list[float], rng: random.Random) -> Any:
        threshold = rng.random()
        for value, weight in zip(values, weights):
            threshold -= weight
            if threshold <= 0:
                return value
        return values[-1]

    def _simulate_series_from_state(
        self,
        home_team_id: str,
        away_team_id: str,
        home_win_pct: float,
        current_home_wins: int,
        current_away_wins: int,
        rng: random.Random,
    ) -> dict[str, Any]:
        """Simulate remaining games from current series state using per-game probability."""
        p = max(0.1, min(home_win_pct / 100, 0.9))
        wins_to_close = 4
        h = current_home_wins
        a = current_away_wins
        while h < wins_to_close and a < wins_to_close:
            if rng.random() <= p:
                h += 1
            else:
                a += 1
        winner = home_team_id if h >= wins_to_close else away_team_id
        return {'winner_team_id': winner, 'games': h + a}

    def _sample_series_result(self, series_id: str, rng: random.Random) -> dict[str, Any]:
        snapshot = NBA_PLAYOFFS_SERIES_SNAPSHOT[series_id]
        state = NBA_PLAYOFFS_SERIES_STATE[series_id]
        home_win_pct = float(snapshot['market']['home_win_pct'])
        return self._simulate_series_from_state(
            state['home_team_id'], state['away_team_id'], home_win_pct, 0, 0, rng
        )

    def _sample_series_result_from_exact(
        self,
        home_team_id: str,
        away_team_id: str,
        exact_distribution: dict[str, float],
        rng: random.Random,
    ) -> dict[str, Any]:
        outcomes: list[tuple[str, int]] = []
        weights: list[float] = []
        for games in range(4, 8):
            for side in ("home", "away"):
                weight = float(exact_distribution.get(f"{side}_{games}", 0.0))
                if weight <= 0:
                    continue
                outcomes.append((side, games))
                weights.append(weight)

        if not outcomes:
            return {"winner_team_id": home_team_id, "games": 7}

        winner_side, games = self._sample_by_weights(outcomes, self._normalize_weights(weights), rng)
        return {
            "winner_team_id": home_team_id if winner_side == "home" else away_team_id,
            "games": games,
        }

    def _load_series_state(self, pool_id: str) -> dict[str, dict[str, Any]]:
        """Load current series state from nba_playoffs.matchups for this pool."""
        resp = self.db.schema('nba_playoffs').from_('matchups').select(
            'series_key, home_team_id, away_team_id, winner_team_id, '
            'home_wins, away_wins, games_played, status, round'
        ).eq('pool_id', pool_id).execute()

        state = {}
        for row in resp.data or []:
            key = row.get('series_key')
            if not key:
                continue
            round_key = ROUND_NUMBER_TO_KEY.get(int(row.get('round') or 1), 'round_1')
            state[key] = {
                'round_key': round_key,
                'status': row.get('status', 'pending'),
                'home_team_id': row.get('home_team_id'),
                'away_team_id': row.get('away_team_id'),
                'winner_team_id': row.get('winner_team_id'),
                'games_played': int(row.get('games_played') or 0),
                'home_wins': int(row.get('home_wins') or 0),
                'away_wins': int(row.get('away_wins') or 0),
            }
        return state

    def _load_series_probs(self) -> dict[str, dict[str, Any]]:
        """Load per-game win probabilities from probability_inputs (market source)."""
        resp = self.db.from_('probability_inputs').select(
            'entity_id, probabilities, captured_at'
        ).eq('product_key', self.product_key).eq('entity_type', 'series').eq('source_type', 'market') \
            .order('captured_at', desc=True).execute()
        latest: dict[str, dict[str, Any]] = {}
        for row in resp.data or []:
            entity_id = row.get('entity_id')
            if not entity_id or entity_id in latest:
                continue
            latest[entity_id] = row.get('probabilities') or {}
        return latest

    def _load_exact_series_probs(self) -> dict[str, dict[str, Any]]:
        resp = self.db.from_('probability_inputs').select(
            'entity_id, probabilities, captured_at'
        ).eq('product_key', self.product_key).eq('entity_type', 'series_exact_result').eq('source_type', 'market') \
            .order('captured_at', desc=True).execute()
        latest: dict[str, dict[str, Any]] = {}
        for row in resp.data or []:
            entity_id = row.get('entity_id')
            if not entity_id or entity_id in latest:
                continue
            latest[entity_id] = row.get('probabilities') or {}
        return latest

    def _fetch_series_picks(self, pool_id: str) -> tuple[list[dict[str, Any]], bool]:
        response = self.db.from_('nba_series_picks') \
            .select('user_id, series_id, winner_team_id, predicted_games, round_key, updated_at') \
            .eq('pool_id', pool_id) \
            .execute()
        error = getattr(response, 'error', None)
        if error:
            message = f"{getattr(error, 'message', '')} {getattr(error, 'details', '')} {getattr(error, 'hint', '')}".lower()
            if getattr(error, 'code', None) == 'PGRST205' or getattr(error, 'status', None) == 404 or 'nba_series_picks' in message:
                return [], False
            raise RuntimeError(f"nba_series_picks query failed: {message}")
        return response.data or [], True

    def fetch_probabilities(self, pool_id: str) -> list[dict[str, Any]]:
        """
        Write a first real NBA probability layer into shared probability_inputs.

        For now, this uses the same curated April 15, 2026 series snapshot that
        powers the frontend fallback layer. That gives the shared backend a real
        market/model contract immediately, without depending on the newer
        `nba_playoffs.*` schema being available in the live database yet.
        """
        captured_at = datetime.now(timezone.utc).isoformat()

        rows = []
        live_state = self._load_series_state(pool_id) or NBA_PLAYOFFS_SERIES_STATE
        for series_id, snapshot in NBA_PLAYOFFS_SERIES_SNAPSHOT.items():
            state = live_state.get(series_id) or NBA_PLAYOFFS_SERIES_STATE.get(series_id) or {}
            home_wins = int(state.get('home_wins', 0) or 0)
            away_wins = int(state.get('away_wins', 0) or 0)
            for source_type in ('market', 'model'):
                source = snapshot[source_type]
                rows.append({
                    'product_key': self.product_key,
                    'entity_type': 'series',
                    'entity_id': series_id,
                    'source_type': source_type,
                    'source_name': source['source_name'],
                    'probabilities': {
                        'home_team': snapshot['home_team'],
                        'away_team': snapshot['away_team'],
                        'home_win_pct': source['home_win_pct'],
                        'away_win_pct': source['away_win_pct'],
                    },
                    'captured_at': captured_at,
                })
                rows.append({
                    'product_key': self.product_key,
                    'entity_type': 'series_exact_result',
                    'entity_id': series_id,
                    'source_type': source_type,
                    'source_name': f"{source['source_name']}_exact_result_derived",
                    'probabilities': build_exact_result_distribution(
                        float(source['home_win_pct']),
                        home_wins,
                        away_wins,
                    ),
                    'captured_at': captured_at,
                })

        return rows

    def run_simulation(self, pool_id: str) -> list[dict[str, Any]]:
        settings = self._get_pool_settings(pool_id)
        pick_rows, available = self._fetch_series_picks(pool_id)
        if not available:
            return []

        user_picks: dict[str, dict[str, dict[str, Any]]] = {}
        for pick in pick_rows:
            user_picks.setdefault(pick['user_id'], {})[pick['series_id']] = pick

        if not user_picks:
            return []

        # Load live series state from DB; fall back to snapshot if pool has no matchups yet.
        db_state = self._load_series_state(pool_id)
        series_state = db_state if db_state else NBA_PLAYOFFS_SERIES_STATE

        series_probs = self._load_series_probs()
        exact_series_probs = self._load_exact_series_probs()

        completed_series = {
            series_id: {
                'winner_team_id': s['winner_team_id'],
                'games': s['games_played'],
            }
            for series_id, s in series_state.items()
            if s.get('status') == 'completed' and s.get('winner_team_id')
        }

        # Unresolved = both teams known but series not yet complete
        unresolved_series = [
            series_id for series_id, s in series_state.items()
            if s.get('home_team_id') and s.get('away_team_id')
            and s.get('status') != 'completed'
        ]

        base_scores: dict[str, dict[str, Any]] = {}
        for user_id, picks in user_picks.items():
            points = 0
            exact_calls = 0
            close_calls = 0
            near_calls = 0
            correct_winners = 0
            picked_series_count = 0
            max_possible = 0

            for series_id, pick in picks.items():
                s = series_state.get(series_id)
                if not s:
                    continue
                picked_series_count += 1
                scoring = self._get_round_scoring(s['round_key'], settings)
                max_possible += scoring['exactBase'] + scoring['edgeBonus']
                result = completed_series.get(series_id)
                score = self._score_pick_against_result(pick, result, s['round_key'], settings)
                if not score:
                    continue
                points += score['points']
                if score['outcome'] == 'exact':
                    exact_calls += 1
                    correct_winners += 1
                elif score['outcome'] == 'close':
                    close_calls += 1
                    correct_winners += 1
                elif score['outcome'] == 'near':
                    near_calls += 1
                    correct_winners += 1

            base_scores[user_id] = {
                'points': points,
                'exact_calls': exact_calls,
                'close_calls': close_calls,
                'near_calls': near_calls,
                'correct_winners': correct_winners,
                'picked_series_count': picked_series_count,
                'max_possible': max_possible,
            }

        win_share_by_user = {user_id: 0.0 for user_id in user_picks}
        iterations = 3000
        rng = random.Random(20260416)

        if not unresolved_series:
            best_score = max(score['points'] for score in base_scores.values())
            leaders = [user_id for user_id, score in base_scores.items() if score['points'] == best_score]
            share = 100.0 / len(leaders) if leaders else 0.0
            for user_id in leaders:
                win_share_by_user[user_id] = share
        else:
            for _ in range(iterations):
                totals = {user_id: score['points'] for user_id, score in base_scores.items()}
                for series_id in unresolved_series:
                    s = series_state[series_id]
                    p_data = series_probs.get(series_id) or {}
                    if not p_data and series_id in NBA_PLAYOFFS_SERIES_SNAPSHOT:
                        p_data = NBA_PLAYOFFS_SERIES_SNAPSHOT[series_id]['market']
                    exact_data = exact_series_probs.get(series_id)
                    if not exact_data:
                        exact_data = build_exact_result_distribution(
                            float(p_data.get('home_win_pct', 50.0)),
                            int(s.get('home_wins', 0) or 0),
                            int(s.get('away_wins', 0) or 0),
                        )
                    simulated = self._sample_series_result_from_exact(
                        s['home_team_id'],
                        s['away_team_id'],
                        exact_data,
                        rng,
                    )
                    round_key = s['round_key']
                    for user_id, picks in user_picks.items():
                        score = self._score_pick_against_result(picks.get(series_id), simulated, round_key, settings)
                        if score:
                            totals[user_id] += score['points']
                best_score = max(totals.values())
                leaders = [user_id for user_id, total in totals.items() if total == best_score]
                share = 1.0 / len(leaders) if leaders else 0.0
                for user_id in leaders:
                    win_share_by_user[user_id] += share

            for user_id in win_share_by_user:
                win_share_by_user[user_id] = round((win_share_by_user[user_id] / iterations) * 100, 1)

        sorted_users = sorted(
            base_scores.items(),
            key=lambda item: (
                -item[1]['points'],
                -item[1]['exact_calls'],
                -item[1]['close_calls'],
                -item[1]['near_calls'],
                item[0],
            ),
        )
        leader_points = sorted_users[0][1]['points'] if sorted_users else 0

        standings = []
        for rank, (user_id, scores) in enumerate(sorted_users, 1):
            standings.append({
                'product_key': self.product_key,
                'pool_id': pool_id,
                'user_id': user_id,
                'window_key': 'current',
                'win_odds': win_share_by_user.get(user_id, 0),
                'points_total': scores['points'],
                'points_back': max(leader_points - scores['points'], 0),
                'rank': rank,
                'max_possible': scores['max_possible'],
                'details': {
                    'exact_calls': scores['exact_calls'],
                    'close_calls': scores['close_calls'],
                    'near_calls': scores['near_calls'],
                    'correct_winners': scores['correct_winners'],
                    'picked_series_count': scores['picked_series_count'],
                    'unresolved_series': len(unresolved_series),
                },
            })

        return standings

    def generate_commentary(self, pool_id: str) -> list[dict[str, Any]]:
        """Generate structured pool-wide and user-specific commentary cards."""
        standings_resp = self.db.from_('simulation_outputs') \
            .select('*') \
            .eq('pool_id', pool_id) \
            .eq('window_key', 'current') \
            .order('rank') \
            .execute()

        standings = standings_resp.data or []
        if not standings:
            return []

        leader = standings[0]
        commentary = []
        unresolved_series = leader.get('details', {}).get('unresolved_series', 0)
        exact_leader = leader.get('details', {}).get('exact_calls', 0)

        # Pool-wide leader card
        commentary.append({
            'product_key':   self.product_key,
            'pool_id':       pool_id,
            'user_id':       None,
            'headline':      "The pool is live, and a few series can already bend the table.",
            'body':          f"Current leader: {leader['points_total']} points, {leader.get('win_odds', 0)}% win odds, and {unresolved_series} live series still able to move things.",
            'action_label':  'View standings',
            'action_target': '/standings',
            'priority':      'medium',
            'tags':          ['standings', 'round_update'],
            'persona':       'default',
            'metadata':      {'leader_points': leader['points_total'], 'leader_win_odds': leader.get('win_odds', 0)},
        })

        for entry in standings:
            exact = entry.get('details', {}).get('exact_calls', 0)
            win_odds = float(entry.get('win_odds') or 0)
            points_back = int(entry.get('points_back') or 0)
            place = int(entry.get('rank') or 0)

            if exact >= 2:
                headline = f"{exact} exact calls is the kind of start that changes the room."
                body = "Exact series lengths are rare currency in this format. You have already banked a meaningful edge."
                priority = 'high'
                tags = ['exact_call', 'performance']
                persona = 'stat_nerd'
            elif place == 1:
                headline = f"You are up front with {win_odds:.1f}% win odds."
                body = "This is the point where protection matters as much as upside. The job is keeping your live edge from leaking away."
                priority = 'high'
                tags = ['leader', 'position']
                persona = 'coach'
            elif points_back <= 2 and win_odds >= 20:
                headline = "You are close enough that one swing can flip the board."
                body = f"Only {points_back} points back, with {win_odds:.1f}% win odds. This is still very live."
                priority = 'medium'
                tags = ['chase', 'live_equity']
                persona = 'play_by_play'
            else:
                headline = "You still have live paths, but the margin is thinner now."
                body = f"{points_back} points back with {win_odds:.1f}% win odds. The remaining series matter, but you need them to break cleanly."
                priority = 'medium'
                tags = ['live_equity', 'position']
                persona = 'color'

            commentary.append({
                'product_key': self.product_key,
                'pool_id': pool_id,
                'user_id': entry['user_id'],
                'headline': headline,
                'body': body,
                'action_label': 'View standings',
                'action_target': '/standings',
                'priority': priority,
                'tags': tags,
                'persona': persona,
                'metadata': {
                    'rank': place,
                    'points_back': points_back,
                    'win_odds': win_odds,
                    'exact_calls': exact,
                    'leader_exact_calls': exact_leader,
                },
            })

        return commentary
