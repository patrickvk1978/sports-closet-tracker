"""
Base adapter interface for all game types.

Each game type implements this interface. The adapter is responsible for:
  1. Fetching raw probabilities from external sources (ESPN, markets, model)
  2. Running game-specific simulation logic
  3. Generating structured commentary

The adapter writes results to the 3 shared layers via the layer writers in layers/.
The frontend never talks to the adapter directly — it reads from the shared tables.
"""
from abc import ABC, abstractmethod
from typing import Any


class GameAdapter(ABC):
    """
    Abstract base for all game adapters.

    Subclasses must set `product_key` and implement the 3 core methods.
    """
    product_key: str  # must match game_type enum: 'march_madness', 'nba_playoffs', etc.

    @abstractmethod
    def fetch_probabilities(self, pool_id: str) -> list[dict[str, Any]]:
        """
        Pull win probabilities from external source(s) for this game type.
        Returns a list of dicts matching the probability_inputs table shape:
        {
            product_key, entity_type, entity_id,
            source_type, source_name, probabilities, captured_at
        }
        """
        ...

    @abstractmethod
    def run_simulation(self, pool_id: str) -> list[dict[str, Any]]:
        """
        Run game-specific simulation logic and return standings.
        Returns a list of dicts matching the simulation_outputs table shape:
        {
            product_key, pool_id, user_id, window_key,
            win_odds, points_total, points_back, rank, max_possible, details
        }
        """
        ...

    @abstractmethod
    def generate_commentary(self, pool_id: str) -> list[dict[str, Any]]:
        """
        Produce structured narrative cards for this pool.
        Returns a list of dicts matching the commentary_outputs table shape:
        {
            product_key, pool_id, user_id, headline, body,
            action_label, action_target, priority, tags, persona, metadata
        }
        """
        ...

    def run_full_pipeline(self, pool_id: str, supabase_client) -> None:
        """
        Orchestrates the full pipeline for a pool:
          1. Fetch probabilities → write to Layer 1
          2. Run simulation → write to Layer 2
          3. Generate commentary → write to Layer 3

        Can be called by the poller or triggered manually.
        """
        from layers.probability import write_probability_inputs
        from layers.simulation import write_simulation_outputs
        from layers.commentary import write_commentary_outputs

        print(f"[{self.product_key}] Running pipeline for pool {pool_id}")

        probs = self.fetch_probabilities(pool_id)
        write_probability_inputs(supabase_client, probs)

        standings = self.run_simulation(pool_id)
        write_simulation_outputs(supabase_client, standings)

        commentary = self.generate_commentary(pool_id)
        write_commentary_outputs(supabase_client, pool_id, commentary)

        print(f"[{self.product_key}] Pipeline complete for pool {pool_id}")
