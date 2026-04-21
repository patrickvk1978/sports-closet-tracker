#!/usr/bin/env python3
"""
Run the shared NBA pipeline for one or more v1 NBA pools.

This is the operational companion to seed_nba_probabilities.py. It runs:
  1. probability_inputs
  2. simulation_outputs
  3. commentary_outputs

for a specific pool id, or for every discovered NBA series-pick'em pool.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

from adapters.nba_playoffs import NBAPlayoffsAdapter


def load_env() -> None:
    script_dir = Path(__file__).parent
    load_dotenv(script_dir / ".env")
    load_dotenv(script_dir.parent / ".env")
    load_dotenv(script_dir.parent.parent.parent / "sports-closet-tracker" / "api" / ".env")


def is_nba_series_pool(pool: dict) -> bool:
    settings = pool.get("settings") or {}
    scoring_config = pool.get("scoring_config") or {}
    product_key = (
        settings.get("product_key")
        or settings.get("productKey")
        or scoring_config.get("product_key")
        or scoring_config.get("productKey")
    )
    game_mode = pool.get("game_mode")
    game_type = pool.get("game_type")
    return (
        product_key == "nba_playoffs"
        or game_type == "nba_playoffs"
        or game_mode in {"series_pickem", "bracket_pool"}
    )


def discover_pool_ids(client) -> list[str]:
    response = client.from_("pools").select("id, settings, scoring_config, game_mode, game_type").execute()
    return [
        pool["id"]
        for pool in (response.data or [])
        if is_nba_series_pool(pool)
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the shared NBA pipeline.")
    parser.add_argument("--pool-id", action="append", default=[], help="Pool id to process. Can be repeated.")
    parser.add_argument(
        "--discover",
        action="store_true",
        help="Auto-discover NBA series-pick'em pools from public.pools.",
    )
    args = parser.parse_args()

    load_env()

    supabase_url = os.environ.get("SUPABASE_URL", "")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not supabase_key:
        raise SystemExit("ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in services/api/.env")

    client = create_client(supabase_url, supabase_key)
    adapter = NBAPlayoffsAdapter(client)

    pool_ids = list(args.pool_id)
    if args.discover:
        pool_ids.extend(discover_pool_ids(client))
    pool_ids = list(dict.fromkeys(pool_ids))

    if not pool_ids:
        raise SystemExit("ERROR: Provide --pool-id or pass --discover.")

    for pool_id in pool_ids:
        adapter.run_full_pipeline(pool_id, client)

    print(f"[nba_playoffs] Pipeline complete for {len(pool_ids)} pool(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
