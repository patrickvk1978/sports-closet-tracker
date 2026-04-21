"""
March Madness adapter.

Wraps existing simulate.py and narrative_v3/ pipeline.
Reads from march_madness.* tables, writes to public shared layers.
"""
from datetime import datetime, timezone
from typing import Any

from adapters.base import GameAdapter


class MarchMadnessAdapter(GameAdapter):
    product_key = 'march_madness'

    def __init__(self, supabase_client):
        self.db = supabase_client

    def fetch_probabilities(self, pool_id: str) -> list[dict[str, Any]]:
        """
        Pull win probabilities for all games in this pool.
        Uses the existing win_prob_home values from march_madness.games
        (which the poller.py already keeps fresh from ESPN).
        """
        captured_at = datetime.now(timezone.utc).isoformat()

        response = self.db.schema('march_madness').from_('games') \
            .select('slot, home_team, away_team, win_prob_home, status') \
            .eq('pool_id', pool_id) \
            .not_.is_('win_prob_home', 'null') \
            .execute()

        rows = []
        for game in (response.data or []):
            home_pct = game['win_prob_home']
            if home_pct is None:
                continue
            rows.append({
                'product_key':    self.product_key,
                'entity_type':    'game',
                'entity_id':      f"slot-{game['slot']}",
                'source_type':    'model',
                'source_name':    'espn_bpi',
                'probabilities':  {
                    'home_team':     game['home_team'],
                    'away_team':     game['away_team'],
                    'home_win_pct':  round(home_pct * 100, 1),
                    'away_win_pct':  round((1 - home_pct) * 100, 1),
                },
                'captured_at':    captured_at,
            })

        return rows

    def run_simulation(self, pool_id: str) -> list[dict[str, Any]]:
        """
        Run Monte Carlo simulation for this pool.
        Calls the existing simulate.py logic and transforms output to
        the simulation_outputs shape.
        """
        import sys, os
        sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
        from simulate import run_simulation_for_pool

        raw_results = run_simulation_for_pool(self.db, pool_id)

        standings = []
        for r in (raw_results or []):
            standings.append({
                'product_key':   self.product_key,
                'pool_id':       pool_id,
                'user_id':       r.get('user_id'),
                'entry_id':      r.get('entry_id'),
                'window_key':    'current',
                'win_odds':      r.get('win_pct'),
                'points_total':  r.get('points', 0),
                'points_back':   r.get('points_back'),
                'rank':          r.get('rank'),
                'max_possible':  r.get('max_possible'),
                'details': {
                    'finish_probs':  r.get('finish_probs'),
                    'leverage_game': r.get('leverage_game'),
                    'best_path':     r.get('best_path'),
                },
            })

        return standings

    def generate_commentary(self, pool_id: str) -> list[dict[str, Any]]:
        """
        Run the narrative pipeline for this pool.
        Calls the existing narrative_v3/pipeline.py and transforms output
        to the commentary_outputs shape.
        """
        import sys, os
        sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
        from narrative_v3.pipeline import run_narrative_pipeline

        raw_commentary = run_narrative_pipeline(self.db, pool_id)

        cards = []
        for item in (raw_commentary or []):
            cards.append({
                'product_key':   self.product_key,
                'pool_id':       pool_id,
                'user_id':       item.get('user_id'),     # None = pool-wide
                'headline':      item['headline'],
                'body':          item.get('body'),
                'action_label':  item.get('action_label'),
                'action_target': item.get('action_target'),
                'priority':      item.get('priority', 'medium'),
                'tags':          item.get('tags', []),
                'persona':       item.get('persona', 'default'),
                'metadata':      item.get('metadata', {}),
            })

        return cards
