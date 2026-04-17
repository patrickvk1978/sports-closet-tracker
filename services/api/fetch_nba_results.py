#!/usr/bin/env python3
"""
Fetch current NBA playoff game results from ESPN and update nba_playoffs.matchups.

Iterates dates from the round-1 start through today, reads the ESPN scoreboard
for each date, and tallies home/away wins per series. Updates matchups rows with
current win counts, status (pending → in_progress → completed), and winner_team_id.

Run this before run_nba_pipeline.py so the adapter works with live series state.
"""

from __future__ import annotations

import json
import os
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client


ROUND_1_START = date(2026, 4, 19)
WINS_TO_CLOSE = 4

ESPN_SCOREBOARD_URL = (
    "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/"
    "scoreboard?seasontype=3&dates={date}&limit=50"
)

ESPN_ABBR_TO_TEAM_ID: dict[str, str] = {
    "DET": "det", "BOS": "bos", "NYK": "nyk", "CLE": "cle",
    "ATL": "atl", "TOR": "tor", "PHI": "phi", "ORL": "orl",
    "CHA": "cha", "MIA": "mia",
    "OKC": "okc", "SA": "sas",  "DEN": "den", "LAL": "lal",
    "HOU": "hou", "MIN": "min", "POR": "por", "PHX": "phx",
    "GS": "gsw",  "LAC": "lac",
}


def load_env() -> None:
    script_dir = Path(__file__).parent
    load_dotenv(script_dir / ".env")
    load_dotenv(script_dir.parent / ".env")
    load_dotenv(script_dir.parent.parent.parent / "sports-closet-tracker" / "api" / ".env")


def fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def date_range(start: date, end: date):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def fetch_playoff_events(target_date: date) -> list[dict]:
    url = ESPN_SCOREBOARD_URL.format(date=target_date.strftime("%Y%m%d"))
    try:
        data = fetch_json(url)
        return data.get("events", [])
    except Exception as exc:
        print(f"  [warn] ESPN fetch failed for {target_date}: {exc}")
        return []


def parse_game_result(event: dict) -> dict | None:
    """Extract a single completed game's home/away team IDs and which team won."""
    competition = (event.get("competitions") or [{}])[0]
    status = competition.get("status", {}).get("type", {})
    if not status.get("completed", False):
        return None

    competitors = competition.get("competitors", [])
    home = next((c for c in competitors if c.get("homeAway") == "home"), None)
    away = next((c for c in competitors if c.get("homeAway") == "away"), None)
    if not home or not away:
        return None

    home_abbr = home.get("team", {}).get("abbreviation", "")
    away_abbr = away.get("team", {}).get("abbreviation", "")
    home_id = ESPN_ABBR_TO_TEAM_ID.get(home_abbr)
    away_id = ESPN_ABBR_TO_TEAM_ID.get(away_abbr)
    if not home_id or not away_id:
        return None

    try:
        home_score = int(home.get("score", 0))
        away_score = int(away.get("score", 0))
    except (ValueError, TypeError):
        return None

    # Prefer the ESPN series sub-object for cumulative wins when available.
    # ESPN returns {"home": {"wins": N}, "away": {"wins": N}} on the series field.
    series_field = competition.get("series")
    if series_field and "home" in series_field and "away" in series_field:
        return {
            "home_id": home_id,
            "away_id": away_id,
            "home_wins": int(series_field["home"].get("wins", 0)),
            "away_wins": int(series_field["away"].get("wins", 0)),
            "cumulative": True,
        }

    return {
        "home_id": home_id,
        "away_id": away_id,
        "home_won": home_score > away_score,
        "cumulative": False,
    }


def accumulate_series_wins(
    all_game_results: list[dict],
) -> dict[tuple[str, str], dict[str, int]]:
    """
    Return { (home_team_id, away_team_id): {home_wins, away_wins} }.

    Prefers cumulative data from ESPN's series field (takes the max seen across
    all dates so we don't regress if an early fetch lacked the series object).
    Falls back to counting individual game outcomes.
    """
    cumulative: dict[tuple[str, str], dict[str, int]] = {}
    incremental: dict[tuple[str, str], dict[str, int]] = {}

    for result in all_game_results:
        home_id = result["home_id"]
        away_id = result["away_id"]
        key = (home_id, away_id)
        reversed_key = (away_id, home_id)

        # Normalise to the canonical key (whichever appeared first)
        canonical = key if key in cumulative or key in incremental or reversed_key not in (cumulative | incremental) else reversed_key

        if result["cumulative"]:
            existing = cumulative.get(canonical, {"home_wins": 0, "away_wins": 0})
            if canonical == key:
                new_hw, new_aw = result["home_wins"], result["away_wins"]
            else:
                new_hw, new_aw = result["away_wins"], result["home_wins"]
            cumulative[canonical] = {
                "home_wins": max(existing["home_wins"], new_hw),
                "away_wins": max(existing["away_wins"], new_aw),
            }
        else:
            if canonical not in incremental:
                incremental[canonical] = {"home_wins": 0, "away_wins": 0}
            if canonical == key:
                if result["home_won"]:
                    incremental[canonical]["home_wins"] += 1
                else:
                    incremental[canonical]["away_wins"] += 1
            else:
                if result["home_won"]:
                    incremental[canonical]["away_wins"] += 1
                else:
                    incremental[canonical]["home_wins"] += 1

    merged = {**incremental, **cumulative}  # cumulative wins on same key
    return merged


def main() -> int:
    load_env()

    supabase_url = os.environ.get("SUPABASE_URL", "")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not supabase_key:
        raise SystemExit("ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in services/api/.env")

    client = create_client(supabase_url, supabase_key)

    matchups_resp = client.schema("nba_playoffs").from_("matchups").select(
        "id, pool_id, series_key, home_team_id, away_team_id, home_wins, away_wins, games_played, status"
    ).execute()
    matchups = matchups_resp.data or []

    if not matchups:
        print("[fetch_nba_results] No matchups found in nba_playoffs.matchups — nothing to update.")
        return 0

    today = date.today()
    dates_to_fetch = list(date_range(ROUND_1_START, today))
    print(f"[fetch_nba_results] Fetching ESPN scoreboard for {len(dates_to_fetch)} date(s): "
          f"{ROUND_1_START} → {today}")

    all_results: list[dict] = []
    for d in dates_to_fetch:
        events = fetch_playoff_events(d)
        for event in events:
            result = parse_game_result(event)
            if result:
                all_results.append(result)

    print(f"[fetch_nba_results] {len(all_results)} completed playoff game result(s) parsed.")

    if not all_results:
        print("[fetch_nba_results] No completed games yet — matchups unchanged.")
        return 0

    series_wins = accumulate_series_wins(all_results)

    updated = 0
    for matchup in matchups:
        home_id = matchup.get("home_team_id")
        away_id = matchup.get("away_team_id")
        if not home_id or not away_id:
            continue  # TBD team — skip until play-in resolves

        key = (home_id, away_id)
        alt_key = (away_id, home_id)
        wins_data = series_wins.get(key) or series_wins.get(alt_key)
        if not wins_data:
            continue

        if key in series_wins:
            home_wins = wins_data["home_wins"]
            away_wins = wins_data["away_wins"]
        else:
            home_wins = wins_data["away_wins"]
            away_wins = wins_data["home_wins"]

        winner_team_id = None
        status = matchup["status"]

        if home_wins >= WINS_TO_CLOSE:
            winner_team_id = home_id
            status = "completed"
        elif away_wins >= WINS_TO_CLOSE:
            winner_team_id = away_id
            status = "completed"
        elif home_wins > 0 or away_wins > 0:
            status = "in_progress"

        games_played = home_wins + away_wins

        payload: dict = {
            "home_wins": home_wins,
            "away_wins": away_wins,
            "games_played": games_played,
            "status": status,
        }
        if winner_team_id:
            payload["winner"] = winner_team_id
            payload["winner_team_id"] = winner_team_id

        client.schema("nba_playoffs").from_("matchups") \
            .update(payload) \
            .eq("id", matchup["id"]) \
            .execute()

        updated += 1
        label = f"{home_id} {home_wins}–{away_wins} {away_id}"
        suffix = f" ✓ {winner_team_id} wins" if winner_team_id else ""
        print(f"  {matchup['series_key']}: {label} [{status}]{suffix}")

    print(f"[fetch_nba_results] Updated {updated} matchup(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
