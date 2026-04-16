"""
Static NBA Playoffs probability snapshot used until the shared NBA adapter is
wired to a live market/model feed.

This mirrors the current April 15, 2026 frontend probability layer so the
shared `probability_inputs` table can start serving real-looking rows now,
without depending on the newer `nba_playoffs.*` schema being available in the
live Supabase project yet.
"""

from __future__ import annotations

from typing import Any


NBA_PLAYOFFS_SERIES_SNAPSHOT: dict[str, dict[str, Any]] = {
    "east-r1-1": {
        "home_team": "Detroit",
        "away_team": "East No. 8",
        "market": {"source_name": "provisional_seed_estimate", "home_win_pct": 75.0, "away_win_pct": 25.0},
        "model": {"source_name": "local_seeded_model", "home_win_pct": 72.0, "away_win_pct": 28.0},
    },
    "east-r1-2": {
        "home_team": "Boston",
        "away_team": "Philadelphia",
        "market": {"source_name": "post_playin_estimate_apr_16_2026", "home_win_pct": 67.0, "away_win_pct": 33.0},
        "model": {"source_name": "local_seeded_model", "home_win_pct": 65.0, "away_win_pct": 35.0},
    },
    "east-r1-3": {
        "home_team": "New York",
        "away_team": "Atlanta",
        "market": {"source_name": "fanduel_static_series_apr_15_2026", "home_win_pct": 61.0, "away_win_pct": 39.0},
        "model": {"source_name": "local_seeded_model", "home_win_pct": 59.0, "away_win_pct": 41.0},
    },
    "east-r1-4": {
        "home_team": "Cleveland",
        "away_team": "Toronto",
        "market": {"source_name": "fanduel_static_series_apr_15_2026", "home_win_pct": 55.0, "away_win_pct": 45.0},
        "model": {"source_name": "local_seeded_model", "home_win_pct": 57.0, "away_win_pct": 43.0},
    },
    "west-r1-1": {
        "home_team": "Oklahoma City",
        "away_team": "West No. 8",
        "market": {"source_name": "provisional_seed_estimate", "home_win_pct": 75.0, "away_win_pct": 25.0},
        "model": {"source_name": "local_seeded_model", "home_win_pct": 72.0, "away_win_pct": 28.0},
    },
    "west-r1-2": {
        "home_team": "San Antonio",
        "away_team": "Portland",
        "market": {"source_name": "fanduel_static_series_apr_15_2026", "home_win_pct": 63.0, "away_win_pct": 37.0},
        "model": {"source_name": "local_seeded_model", "home_win_pct": 60.0, "away_win_pct": 40.0},
    },
    "west-r1-3": {
        "home_team": "Denver",
        "away_team": "Minnesota",
        "market": {"source_name": "fanduel_static_series_apr_15_2026", "home_win_pct": 52.0, "away_win_pct": 48.0},
        "model": {"source_name": "local_seeded_model", "home_win_pct": 51.0, "away_win_pct": 49.0},
    },
    "west-r1-4": {
        "home_team": "Los Angeles Lakers",
        "away_team": "Houston",
        "market": {"source_name": "fanduel_static_series_apr_15_2026", "home_win_pct": 51.0, "away_win_pct": 49.0},
        "model": {"source_name": "local_seeded_model", "home_win_pct": 50.0, "away_win_pct": 50.0},
    },
    "east-playin-1": {
        "home_team": "Philadelphia",
        "away_team": "Orlando",
        "market": {"source_name": "completed_playin_game_apr_15_2026", "home_win_pct": 100.0, "away_win_pct": 0.0},
        "model": {"source_name": "completed_playin_game_apr_15_2026", "home_win_pct": 100.0, "away_win_pct": 0.0},
    },
    "east-playin-2": {
        "home_team": "Charlotte",
        "away_team": "Miami",
        "market": {"source_name": "fanduel_static_game_apr_14_2026", "home_win_pct": 66.0, "away_win_pct": 34.0},
        "model": {"source_name": "local_seeded_model", "home_win_pct": 63.0, "away_win_pct": 37.0},
    },
    "west-playin-1": {
        "home_team": "Phoenix",
        "away_team": "Portland",
        "market": {"source_name": "completed_playin_game_apr_14_2026", "home_win_pct": 0.0, "away_win_pct": 100.0},
        "model": {"source_name": "completed_playin_game_apr_14_2026", "home_win_pct": 0.0, "away_win_pct": 100.0},
    },
    "west-playin-2": {
        "home_team": "Los Angeles Clippers",
        "away_team": "Golden State",
        "market": {"source_name": "completed_playin_game_apr_15_2026", "home_win_pct": 0.0, "away_win_pct": 100.0},
        "model": {"source_name": "completed_playin_game_apr_15_2026", "home_win_pct": 0.0, "away_win_pct": 100.0},
    },
    "east-sf-1": {
        "home_team": "East Semifinal 1",
        "away_team": "East Semifinal 1 Challenger",
        "market": {"source_name": "future_round_estimate", "home_win_pct": 60.0, "away_win_pct": 40.0},
        "model": {"source_name": "local_seeded_model", "home_win_pct": 58.0, "away_win_pct": 42.0},
    },
    "east-sf-2": {
        "home_team": "East Semifinal 2",
        "away_team": "East Semifinal 2 Challenger",
        "market": {"source_name": "future_round_estimate", "home_win_pct": 57.0, "away_win_pct": 43.0},
        "model": {"source_name": "local_seeded_model", "home_win_pct": 55.0, "away_win_pct": 45.0},
    },
    "west-sf-1": {
        "home_team": "West Semifinal 1",
        "away_team": "West Semifinal 1 Challenger",
        "market": {"source_name": "future_round_estimate", "home_win_pct": 52.0, "away_win_pct": 48.0},
        "model": {"source_name": "local_seeded_model", "home_win_pct": 51.0, "away_win_pct": 49.0},
    },
    "west-sf-2": {
        "home_team": "West Semifinal 2",
        "away_team": "West Semifinal 2 Challenger",
        "market": {"source_name": "future_round_estimate", "home_win_pct": 54.0, "away_win_pct": 46.0},
        "model": {"source_name": "local_seeded_model", "home_win_pct": 56.0, "away_win_pct": 44.0},
    },
    "east-finals": {
        "home_team": "East Finals Favorite",
        "away_team": "East Finals Challenger",
        "market": {"source_name": "future_round_estimate", "home_win_pct": 56.0, "away_win_pct": 44.0},
        "model": {"source_name": "local_seeded_model", "home_win_pct": 54.0, "away_win_pct": 46.0},
    },
    "west-finals": {
        "home_team": "West Finals Favorite",
        "away_team": "West Finals Challenger",
        "market": {"source_name": "future_round_estimate", "home_win_pct": 53.0, "away_win_pct": 47.0},
        "model": {"source_name": "local_seeded_model", "home_win_pct": 52.0, "away_win_pct": 48.0},
    },
    "nba-finals": {
        "home_team": "NBA Finals Favorite",
        "away_team": "NBA Finals Challenger",
        "market": {"source_name": "future_round_estimate", "home_win_pct": 51.0, "away_win_pct": 49.0},
        "model": {"source_name": "local_seeded_model", "home_win_pct": 50.0, "away_win_pct": 50.0},
    },
}


NBA_PLAYOFFS_SERIES_STATE: dict[str, dict[str, Any]] = {
    "east-r1-1": {
        "round_key": "round_1",
        "status": "scheduled",
        "home_team_id": "det",
        "away_team_id": "east-seed-8",
        "home_team": "Detroit",
        "away_team": "East No. 8",
    },
    "east-r1-2": {
        "round_key": "round_1",
        "status": "scheduled",
        "home_team_id": "bos",
        "away_team_id": "phi",
        "home_team": "Boston",
        "away_team": "Philadelphia",
    },
    "east-r1-3": {
        "round_key": "round_1",
        "status": "scheduled",
        "home_team_id": "nyk",
        "away_team_id": "atl",
        "home_team": "New York",
        "away_team": "Atlanta",
    },
    "east-r1-4": {
        "round_key": "round_1",
        "status": "scheduled",
        "home_team_id": "cle",
        "away_team_id": "tor",
        "home_team": "Cleveland",
        "away_team": "Toronto",
    },
    "west-r1-1": {
        "round_key": "round_1",
        "status": "scheduled",
        "home_team_id": "okc",
        "away_team_id": "west-seed-8",
        "home_team": "Oklahoma City",
        "away_team": "West No. 8",
    },
    "west-r1-2": {
        "round_key": "round_1",
        "status": "scheduled",
        "home_team_id": "sas",
        "away_team_id": "por",
        "home_team": "San Antonio",
        "away_team": "Portland",
    },
    "west-r1-3": {
        "round_key": "round_1",
        "status": "scheduled",
        "home_team_id": "den",
        "away_team_id": "min",
        "home_team": "Denver",
        "away_team": "Minnesota",
    },
    "west-r1-4": {
        "round_key": "round_1",
        "status": "scheduled",
        "home_team_id": "lal",
        "away_team_id": "hou",
        "home_team": "Los Angeles Lakers",
        "away_team": "Houston",
    },
    "east-playin-1": {
        "round_key": "play_in",
        "status": "completed",
        "home_team_id": "phi",
        "away_team_id": "orl",
        "home_team": "Philadelphia",
        "away_team": "Orlando",
        "winner_team_id": "phi",
        "games_played": 1,
    },
    "east-playin-2": {
        "round_key": "play_in",
        "status": "completed",
        "home_team_id": "cha",
        "away_team_id": "mia",
        "home_team": "Charlotte",
        "away_team": "Miami",
        "winner_team_id": "cha",
        "games_played": 1,
    },
    "west-playin-1": {
        "round_key": "play_in",
        "status": "completed",
        "home_team_id": "phx",
        "away_team_id": "por",
        "home_team": "Phoenix",
        "away_team": "Portland",
        "winner_team_id": "por",
        "games_played": 1,
    },
    "west-playin-2": {
        "round_key": "play_in",
        "status": "completed",
        "home_team_id": "lac",
        "away_team_id": "gsw",
        "home_team": "Los Angeles Clippers",
        "away_team": "Golden State",
        "winner_team_id": "gsw",
        "games_played": 1,
    },
}
