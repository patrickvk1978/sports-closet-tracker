#!/usr/bin/env python3
"""
ESPN BPI Page Parser
Converts a copy-paste of espn.com/mens-college-basketball/bpi into api/ratings.json.

Usage:
  1. Go to espn.com/mens-college-basketball/bpi
  2. Select All (Cmd+A), Copy (Cmd+C)
  3. Paste into api/bpi_raw.txt
  4. python api/parse_bpi.py

Output: api/ratings.json  — { "Team Name": bpi_value, ... } for all ~365 D1 teams

Optional flags:
  --input  PATH   read from a different file (default: api/bpi_raw.txt)
  --output PATH   write to a different file (default: api/ratings.json)
  --verify        print top 20 + count without writing
"""

import argparse
import json
import re
import sys
from pathlib import Path

_script_dir = Path(__file__).parent


def parse_teams(lines):
    """
    Extract team names from the team block.

    ESPN's BPI page renders each team name twice (link text + visible text),
    followed immediately by the conference name. We detect this by looking
    for two consecutive identical lines.

    Returns: list of team names in rank order.
    """
    teams = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line:
            i += 1
            continue
        # Two consecutive identical lines → team name (rendered twice)
        if i + 1 < len(lines) and lines[i + 1] == line:
            teams.append(line)
            i += 2
            # Skip the conference name that follows
            while i < len(lines) and not lines[i]:
                i += 1
            i += 1  # consume the conference line
        else:
            i += 1
    return teams


def parse_bpi_values(lines):
    """
    Extract BPI values from the stats block.

    The stats table has 10 fields per team in this order:
      W-L | BPI | BPI RK | TREND | OFF | DEF | OVR W-L | CONF W-L | WIN CONF% | SOS RK

    Strategy: find lines matching an integer W-L record (e.g. "31-2", "14-17").
    The very next line is always the BPI value (a float, possibly negative).

    This pattern is unambiguous because:
    - Real W-L records use plain integers: "31-2"
    - Projected W-L records use decimals:  "31.8-2.2"  ← won't match
    - Conference W-L records use decimals: "17.0-1.0"  ← won't match
    """
    wl_re  = re.compile(r'^\d{1,3}-\d{1,3}$')          # integer-only W-L
    bpi_re = re.compile(r'^-?\d{1,2}\.\d+$')            # float, possibly negative

    values = []
    i = 0
    while i < len(lines):
        if wl_re.match(lines[i]):
            # next non-empty line should be BPI
            j = i + 1
            while j < len(lines) and not lines[j]:
                j += 1
            if j < len(lines) and bpi_re.match(lines[j]):
                values.append(float(lines[j]))
                i = j + 1
                continue
        i += 1
    return values


def build_ratings(teams, bpi_values):
    n_t = len(teams)
    n_b = len(bpi_values)

    if n_t != n_b:
        print(f'WARNING: {n_t} teams parsed, {n_b} BPI values parsed — counts differ.')
        print('         Check bpi_raw.txt for incomplete copy-paste.')
        n = min(n_t, n_b)
        teams     = teams[:n]
        bpi_values = bpi_values[:n]

    return {team: bpi for team, bpi in zip(teams, bpi_values)}


def main():
    parser = argparse.ArgumentParser(description='Parse ESPN BPI page into ratings.json')
    parser.add_argument('--input',  default=str(_script_dir / 'bpi_raw.txt'),
                        help='Path to pasted ESPN BPI text (default: api/bpi_raw.txt)')
    parser.add_argument('--output', default=str(_script_dir / 'ratings.json'),
                        help='Output path (default: api/ratings.json)')
    parser.add_argument('--verify', action='store_true',
                        help='Print top 20 teams and exit without writing')
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f'ERROR: input file not found: {input_path}', file=sys.stderr)
        print('       Paste the ESPN BPI page content into that file and re-run.', file=sys.stderr)
        sys.exit(1)

    raw = input_path.read_text(encoding='utf-8', errors='ignore')

    # Clean lines: strip whitespace, preserve empty lines for structure detection
    lines = [line.strip() for line in raw.splitlines()]

    teams      = parse_teams(lines)
    bpi_values = parse_bpi_values(lines)
    ratings    = build_ratings(teams, bpi_values)

    print(f'Parsed {len(ratings)} teams.')

    if args.verify or True:  # always print top 20 as a sanity check
        print('\nTop 20 by BPI:')
        for i, (team, bpi) in enumerate(list(ratings.items())[:20], 1):
            bar = '█' * max(1, int((bpi + 5) / 2))
            print(f'  {i:>3}. {team:<40} {bpi:+.1f}  {bar}')

    if args.verify:
        return

    output_path = Path(args.output)
    output_path.write_text(
        json.dumps(ratings, indent=2, ensure_ascii=False),
        encoding='utf-8'
    )
    print(f'\nWrote {len(ratings)} ratings to {output_path}')
    print('Run the simulation: python api/simulate.py --pool-id YOUR_POOL_UUID')


if __name__ == '__main__':
    main()
