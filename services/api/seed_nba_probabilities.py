#!/usr/bin/env python3
"""
Seed the shared probability_inputs table with the current NBA playoffs series
snapshot.

This is the lightweight operational bridge until the NBA adapter is fed by a
true live market/model source. It writes the same curated series probabilities
the NBA frontends currently use as local fallbacks, but through the shared
backend contract.

Usage:
  python services/api/seed_nba_probabilities.py
  python services/api/seed_nba_probabilities.py --pool-id manual-seed
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

from adapters.nba_playoffs import NBAPlayoffsAdapter
from layers.probability import write_probability_inputs


def load_env() -> None:
    script_dir = Path(__file__).parent
    load_dotenv(script_dir / ".env")
    load_dotenv(script_dir.parent / ".env")
    # Temporary bridge while the monorepo backend env is still being stood up.
    load_dotenv(script_dir.parent.parent.parent / "sports-closet-tracker" / "api" / ".env")


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed NBA probability_inputs rows.")
    parser.add_argument(
        "--pool-id",
        default="manual-seed",
        help="Pool identifier passed through the adapter interface. "
        "The current NBA snapshot writer does not depend on a real pool yet.",
    )
    args = parser.parse_args()

    load_env()

    supabase_url = os.environ.get("SUPABASE_URL", "")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not supabase_key:
        raise SystemExit("ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in services/api/.env")

    client = create_client(supabase_url, supabase_key)
    adapter = NBAPlayoffsAdapter(client)
    rows = adapter.fetch_probabilities(args.pool_id)
    write_probability_inputs(client, rows)
    print(f"[nba_playoffs] Seeded {len(rows)} probability_inputs rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
