"""
NBA Playoffs adapter.

Simpler than March Madness — no bracket Monte Carlo needed.
Series outcomes are modeled as independent Bernoulli trials using market/model odds.
"""
from datetime import datetime, timezone
from typing import Any
import math

from adapters.base import GameAdapter

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


class NBAPlayoffsAdapter(GameAdapter):
    product_key = 'nba_playoffs'

    def __init__(self, supabase_client):
        self.db = supabase_client

    def fetch_probabilities(self, pool_id: str) -> list[dict[str, Any]]:
        """
        Fetch market/model series win probabilities for all active matchups.
        Currently uses placeholder market probabilities; replace with
        ESPN or market API when available.
        """
        captured_at = datetime.now(timezone.utc).isoformat()

        response = self.db.schema('nba_playoffs').from_('matchups') \
            .select('id, round, conference, home_team, away_team, home_seed, away_seed, status') \
            .eq('pool_id', pool_id) \
            .in_('status', ['pending', 'active']) \
            .execute()

        rows = []
        for matchup in (response.data or []):
            # TODO: replace with ESPN API call or market odds feed
            # Using 50/50 as placeholder until real odds are wired
            rows.append({
                'product_key':   self.product_key,
                'entity_type':   'series',
                'entity_id':     matchup['id'],
                'source_type':   'market',
                'source_name':   'consensus_market',
                'probabilities': {
                    'home_team':     matchup['home_team'],
                    'away_team':     matchup['away_team'],
                    'home_win_pct':  50.0,   # replace with real odds
                    'away_win_pct':  50.0,
                },
                'captured_at':   captured_at,
            })

        return rows

    def run_simulation(self, pool_id: str) -> list[dict[str, Any]]:
        """
        Score each user's picks against current series results.
        Calculates win probability based on remaining picks and series odds.
        """
        # Fetch all matchups for scoring context
        matchups_resp = self.db.schema('nba_playoffs').from_('matchups') \
            .select('*') \
            .eq('pool_id', pool_id) \
            .execute()
        matchups = {m['id']: m for m in (matchups_resp.data or [])}

        # Fetch all picks in this pool
        picks_resp = self.db.schema('nba_playoffs').from_('picks') \
            .select('*') \
            .eq('pool_id', pool_id) \
            .execute()

        # Get pool scoring config
        pool_resp = self.db.from_('pools').select('scoring_config, settings') \
            .eq('id', pool_id).single().execute()
        scoring = (pool_resp.data or {}).get('scoring_config', {})
        pts_correct_winner = scoring.get('correct_winner', 10)
        pts_correct_games  = scoring.get('correct_games', 5)

        # Group picks by user
        user_picks: dict[str, list] = {}
        for pick in (picks_resp.data or []):
            uid = pick['user_id']
            user_picks.setdefault(uid, []).append(pick)

        # Score each user
        user_scores: dict[str, dict] = {}
        for user_id, picks in user_picks.items():
            points = 0
            max_possible = 0
            exact_calls = 0
            correct_winners = 0

            for pick in picks:
                m = matchups.get(pick['matchup_id'])
                if not m:
                    continue

                if m['status'] == 'final':
                    if pick['predicted_winner'] == m['winner']:
                        points += pts_correct_winner
                        correct_winners += 1
                        if pick['predicted_games'] == m['games_played']:
                            points += pts_correct_games
                            exact_calls += 1
                    max_possible += pts_correct_winner + pts_correct_games
                else:
                    # Series still active — add potential future points
                    max_possible += pts_correct_winner + pts_correct_games

            user_scores[user_id] = {
                'points':          points,
                'max_possible':    max_possible,
                'exact_calls':     exact_calls,
                'correct_winners': correct_winners,
            }

        # Rank users
        sorted_users = sorted(user_scores.items(), key=lambda x: -x[1]['points'])
        leader_pts = sorted_users[0][1]['points'] if sorted_users else 0

        standings = []
        for rank, (user_id, scores) in enumerate(sorted_users, 1):
            standings.append({
                'product_key':  self.product_key,
                'pool_id':      pool_id,
                'user_id':      user_id,
                'window_key':   'current',
                'win_odds':     None,  # TODO: Monte Carlo pool win probability
                'points_total': scores['points'],
                'points_back':  leader_pts - scores['points'],
                'rank':         rank,
                'max_possible': scores['max_possible'],
                'details': {
                    'exact_calls':     scores['exact_calls'],
                    'correct_winners': scores['correct_winners'],
                },
            })

        return standings

    def generate_commentary(self, pool_id: str) -> list[dict[str, Any]]:
        """
        Generate structured commentary for this NBA playoff pool.
        Basic implementation — extend with narrative_v3 when ready.
        """
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

        # Pool-wide leader card
        commentary.append({
            'product_key':   self.product_key,
            'pool_id':       pool_id,
            'user_id':       None,
            'headline':      f"Standings after the latest series results.",
            'body':          f"Leading the pool with {leader['points_total']} points.",
            'action_label':  'View standings',
            'action_target': '/standings',
            'priority':      'medium',
            'tags':          ['standings', 'round_update'],
            'persona':       'default',
            'metadata':      {},
        })

        # High-priority card: anyone with exact series length calls
        for entry in standings:
            exact = entry.get('details', {}).get('exact_calls', 0)
            if exact >= 2:
                commentary.append({
                    'product_key':   self.product_key,
                    'pool_id':       pool_id,
                    'user_id':       entry['user_id'],
                    'headline':      f"{exact} exact series calls — that's a serious edge.",
                    'body':          "Getting the series length right is rare. Keep it up.",
                    'action_label':  'See your picks',
                    'action_target': '/my-picks',
                    'priority':      'high',
                    'tags':          ['exact_call', 'performance'],
                    'persona':       'stat_nerd',
                    'metadata':      {'exact_calls': exact},
                })

        return commentary
