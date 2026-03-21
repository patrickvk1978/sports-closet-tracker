#!/usr/bin/env python3
"""
Seed the Supabase games table with R64 bracket data pulled live from ESPN.
Run once after Selection Sunday to populate all 32 R64 slots automatically.

Usage:
  python api/seed_bracket.py           # upsert to Supabase
  python api/seed_bracket.py --dry-run # print mapping table only, no DB writes

Requirements:
  pip install -r api/requirements.txt
  cp api/.env.example api/.env  # fill in SUPABASE_SERVICE_ROLE_KEY
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path
from urllib.request import urlopen

from dotenv import load_dotenv
from supabase import create_client

# ─── Environment ──────────────────────────────────────────────────────────────

_script_dir = Path(__file__).parent
load_dotenv(_script_dir / '.env')
load_dotenv(_script_dir.parent / '.env')

SUPABASE_URL = os.environ.get('SUPABASE_URL', '')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')

# ─── Bracket topology ─────────────────────────────────────────────────────────

REGION_BASE = {'Midwest': 0, 'West': 15, 'South': 30, 'East': 45}

# Slot offset within a region for each seed pairing (lower seed first)
SEED_PAIR_OFFSET = {
    (1, 16): 0,
    (8,  9): 1,
    (5, 12): 2,
    (4, 13): 3,
    (6, 11): 4,
    (3, 14): 5,
    (7, 10): 6,
    (2, 15): 7,
}

# What seed a given seed is paired with in R64
SEED_COMPLEMENT = {
    1: 16, 16: 1,
    8:  9,  9: 8,
    5: 12, 12: 5,
    4: 13, 13: 4,
    6: 11, 11: 6,
    3: 14, 14: 3,
    7: 10, 10: 7,
    2: 15, 15: 2,
}

# R64 dates (First Four TBD slots appear here too)
R64_DATES = ['20260319', '20260320']

# ─── ESPN helpers ─────────────────────────────────────────────────────────────

ESPN_SCOREBOARD = (
    'https://site.api.espn.com/apis/site/v2/sports/basketball/'
    'mens-college-basketball/scoreboard?groups=100&limit=50&dates={date}'
)

def fetch_events(date):
    url = ESPN_SCOREBOARD.format(date=date)
    with urlopen(url, timeout=10) as r:
        return json.loads(r.read()).get('events', [])

def extract_region(comp):
    for note in comp.get('notes', []):
        m = re.search(r'(Midwest|West|South|East)', note.get('headline', ''))
        if m:
            return m.group(1)
    return None

def resolve_slot(s1, s2, region):
    """
    Given two seeds (one may be 99 for First Four TBD) and a region name,
    return the slot index (0-59) or None if unresolvable.
    """
    base = REGION_BASE.get(region)
    if base is None:
        return None

    # Handle First Four TBD teams (seed shows as 99)
    if s1 == 99 and 1 <= s2 <= 16:
        s1 = SEED_COMPLEMENT.get(s2)
    elif s2 == 99 and 1 <= s1 <= 16:
        s2 = SEED_COMPLEMENT.get(s1)

    if not s1 or not s2:
        return None

    pair = (min(s1, s2), max(s1, s2))
    offset = SEED_PAIR_OFFSET.get(pair)
    return base + offset if offset is not None else None

# ─── Main ─────────────────────────────────────────────────────────────────────

def build_rows(events):
    rows = []
    for e in events:
        comp = e['competitions'][0]
        region = extract_region(comp)
        if not region:
            continue

        teams = comp['competitors']
        away  = next((t for t in teams if t.get('homeAway') == 'away'), {})
        home  = next((t for t in teams if t.get('homeAway') == 'home'), {})

        t1 = away.get('team', {}).get('location') or away.get('team', {}).get('displayName') or 'TBD'
        t2 = home.get('team', {}).get('location') or home.get('team', {}).get('displayName') or 'TBD'
        s1 = int(away.get('curatedRank', {}).get('current') or 0)
        s2 = int(home.get('curatedRank', {}).get('current') or 0)

        slot = resolve_slot(s1, s2, region)
        if slot is None:
            continue

        rows.append({
            'espn_id':      e['id'],
            'slot_index':   slot,
            'round':        'R64',
            'region':       region,
            'teams': {
                'team1': t1, 'seed1': s1 if s1 != 99 else SEED_COMPLEMENT.get(s2),
                'team2': t2, 'seed2': s2 if s2 != 99 else SEED_COMPLEMENT.get(s1),
            },
            'status':        'pending',
            'winner':        None,
            'win_prob_home': None,
        })

    return sorted(rows, key=lambda r: r['slot_index'])


def print_table(rows):
    regions = ['Midwest', 'West', 'South', 'East']
    print(f"\n{'Slot':>5}  {'ESPN ID':<12}  {'Seeds':<6}  {'Region':<8}  Matchup")
    print('─' * 80)
    current_region = None
    for r in rows:
        if r['region'] != current_region:
            current_region = r['region']
            print()
        t = r['teams']
        s1, s2 = t['seed1'], t['seed2']
        seeds  = f"({s1}) v ({s2})"
        t1     = t['team1'] if t['team1'] != 'TBD' else 'First Four winner'
        t2     = t['team2'] if t['team2'] != 'TBD' else 'First Four winner'
        print(f"  {r['slot_index']:>3}  {r['espn_id']:<12}  {seeds:<12}  {r['region']:<8}  {t1} vs {t2}")


def main():
    parser = argparse.ArgumentParser(description='Seed R64 bracket from ESPN into Supabase.')
    parser.add_argument('--dry-run', action='store_true', help='Print mapping, do not write to DB')
    args = parser.parse_args()

    if not args.dry_run and (not SUPABASE_URL or not SUPABASE_KEY):
        print('ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in api/.env', file=sys.stderr)
        sys.exit(1)

    print('Fetching R64 games from ESPN...')
    all_events = []
    for date in R64_DATES:
        events = fetch_events(date)
        all_events.extend(events)
        print(f'  {date}: {len(events)} games found')

    rows = build_rows(all_events)
    print(f'\n{len(rows)} R64 slots resolved.')
    print_table(rows)

    if args.dry_run:
        print('\n[DRY RUN] No database writes.')
        return

    client = create_client(SUPABASE_URL, SUPABASE_KEY)
    client.table('games').upsert(rows, on_conflict='espn_id').execute()
    print(f'\n✓ Upserted {len(rows)} rows to games table.')
    print('Next steps:')
    print('  1. Open AdminPage → verify team names match your bracket entry')
    print('  2. Set ESPN ID → slot mapping in AdminPage for the poller')
    print('  3. Run: python api/simulate.py --pool-id YOUR_UUID --dry-run')


if __name__ == '__main__':
    main()
