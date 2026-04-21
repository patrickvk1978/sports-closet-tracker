"""
Adapter registry — maps game_type strings to adapter classes.

Usage:
    from adapters import get_adapter
    adapter = get_adapter('march_madness', supabase_client)
    adapter.run_full_pipeline(pool_id)
"""
from adapters.base import GameAdapter
from adapters.march_madness import MarchMadnessAdapter
from adapters.nba_playoffs import NBAPlayoffsAdapter

_REGISTRY: dict[str, type[GameAdapter]] = {
    'march_madness': MarchMadnessAdapter,
    'nba_playoffs':  NBAPlayoffsAdapter,
    # 'nfl_draft':   NFLDraftAdapter,     # add when built
    # 'wnba_draft':  WNBADraftAdapter,    # add when built
}


def get_adapter(game_type: str, supabase_client) -> GameAdapter:
    """Return an instantiated adapter for the given game type."""
    cls = _REGISTRY.get(game_type)
    if not cls:
        raise ValueError(f"No adapter registered for game_type '{game_type}'")
    return cls(supabase_client)


def list_supported_games() -> list[str]:
    return list(_REGISTRY.keys())
