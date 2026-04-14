"""
Reads the March 29 replay output and writes a clean comparison doc.
Usage: python3 api/format_replay.py
"""

import re

REPLAY_FILE = (
    '/Users/patrickvankeerbergen/.claude/projects/'
    '-Users-patrickvankeerbergen-Documents-Documents-Projects-SportsCloset-tournamenttracker/'
    '523b34f2-5a82-4a6a-a40e-ccaf7c248624/tool-results/buoptrzpd.txt'
)
OUT_FILE = 'march29_comparison.txt'

PERSONA = {'stat_nerd': 'Mo', 'color_commentator': 'Zelda', 'barkley': 'Davin'}


def parse_replay(path):
    with open(path) as f:
        lines = f.readlines()

    scenarios = []
    cur = None
    section = None   # 'v1' or 'v2'
    pending_player = None
    pending_persona = None
    pending_words = None

    def flush_entry():
        nonlocal pending_player, pending_persona, pending_words
        pending_player = pending_persona = pending_words = None

    for line in lines:
        stripped = line.rstrip('\n')

        # New scenario block
        m = re.match(r'^LOG (\d+) \| (\S+) ET \| (\S+) \| (.+)$', stripped)
        if m:
            if cur:
                scenarios.append(cur)
            cur = {
                'id': m.group(1), 'time': m.group(2),
                'type': m.group(3).lower().replace('_', ' '),
                'message': m.group(4).strip(),
                'live': '', 'v1': [], 'v2': [], 'suppressed': '',
            }
            section = None
            flush_entry()
            continue

        if cur is None:
            continue

        # Live games line
        m = re.match(r"^  Live: \['(.+?)'\]$", stripped)
        if m and 'No games' not in m.group(1):
            cur['live'] = m.group(1)
            continue

        # Section headers
        if re.match(r'^  V1 OUTPUT', stripped):
            section = 'v1'
            flush_entry()
            continue

        if re.match(r'^  V2 OUTPUT', stripped):
            section = 'v2'
            flush_entry()
            continue

        # Suppression
        m = re.match(r'^    \[SUPPRESSED\] (.+)$', stripped)
        if m and section == 'v2':
            cur['suppressed'] = m.group(1).strip()
            continue

        # Entry header: "    [persona → player] (Nw)"
        m = re.match(r'^    \[(\S+) → (.+?)\] \((\d+)w\)$', stripped)
        if m and section in ('v1', 'v2'):
            pending_persona = m.group(1)
            pending_player  = m.group(2)
            pending_words   = m.group(3)
            continue

        # Entry content (the line after the header)
        if pending_player and section in ('v1', 'v2') and stripped.startswith('    ') and not stripped.startswith('    [') and not stripped.startswith('    →'):
            content = stripped.strip()
            if content:
                cur[section].append({
                    'persona': pending_persona,
                    'player':  pending_player,
                    'words':   pending_words,
                    'content': content,
                })
            flush_entry()
            continue

        # Skip v2 pipeline log lines
        if stripped.startswith('  [v2]') or stripped.startswith('    →') or stripped.startswith('    '):
            if section == 'v2' and pending_player is None:
                continue

    if cur:
        scenarios.append(cur)

    return scenarios


def write_doc(scenarios, path):
    p = {'stat_nerd': 'Mo', 'color_commentator': 'Zelda', 'barkley': 'Davin'}

    with open(path, 'w') as f:
        f.write('MARCH 29 REPLAY — v1 vs v2\n')
        f.write('=' * 78 + '\n')
        f.write('Mo = stat_nerd   Zelda = color_commentator   Davin = barkley\n')
        f.write('=' * 78 + '\n\n')

        for i, s in enumerate(scenarios, 1):
            f.write('─' * 78 + '\n')
            type_label = s['type'].upper()
            f.write(f'#{i}  {s["time"]} ET  |  {type_label}  |  Log {s["id"]}\n')
            if s['live']:
                f.write(f'    {s["live"]}\n')
            f.write('─' * 78 + '\n\n')

            f.write(f'V1  ({len(s["v1"])} entries)\n')
            f.write('· ' * 19 + '\n')
            if s['v1']:
                for e in s['v1']:
                    persona = p.get(e['persona'], e['persona'])
                    f.write(f'  {persona} → {e["player"]} ({e["words"]}w)\n')
                    f.write(f'  {e["content"]}\n\n')
            else:
                f.write('  (none)\n\n')

            f.write(f'V2  ({len(s["v2"])} entries)\n')
            f.write('· ' * 19 + '\n')
            if s['suppressed']:
                f.write(f'  [—]  {s["suppressed"]}\n\n')
            elif s['v2']:
                for e in s['v2']:
                    persona = p.get(e['persona'], e['persona'])
                    f.write(f'  {persona} → {e["player"]} ({e["words"]}w)\n')
                    f.write(f'  {e["content"]}\n\n')
            else:
                f.write('  (none)\n\n')

            f.write('\n')

        # Summary
        f.write('=' * 78 + '\n')
        f.write('SUMMARY\n')
        f.write('=' * 78 + '\n')
        f.write(f'{"#":<4} {"Time":<7} {"Type":<12} {"v1":>4} {"v2":>4}\n')
        f.write('-' * 36 + '\n')
        total_v1 = total_v2 = 0
        for i, s in enumerate(scenarios, 1):
            total_v1 += len(s['v1'])
            total_v2 += len(s['v2'])
            sup = '  ← suppressed' if s['suppressed'] else ''
            f.write(f'{i:<4} {s["time"]:<7} {s["type"]:<12} {len(s["v1"]):>4} {len(s["v2"]):>4}{sup}\n')
        f.write('-' * 36 + '\n')
        pct = round((1 - total_v2 / total_v1) * 100) if total_v1 else 0
        f.write(f'{"TOTAL":<24} {total_v1:>4} {total_v2:>4}  ({total_v1 - total_v2} fewer, {pct}% reduction)\n')


if __name__ == '__main__':
    scenarios = parse_replay(REPLAY_FILE)
    write_doc(scenarios, OUT_FILE)
    v1_total = sum(len(s['v1']) for s in scenarios)
    v2_total = sum(len(s['v2']) for s in scenarios)
    print(f'Written to {OUT_FILE}')
    print(f'{len(scenarios)} scenarios | v1: {v1_total} entries | v2: {v2_total} entries')
