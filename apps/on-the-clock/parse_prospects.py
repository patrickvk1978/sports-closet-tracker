#!/usr/bin/env python3
"""Parse NFL Draft 2026 data from Excel into prospects JSON.

Sources are cleanly separated into:
  BIG BOARD RANKINGS  — quality rankings (best player)
  MOCK DRAFTS         — pick predictions (who each team selects, round 1 only)
"""

import json
import re
import unicodedata
from difflib import SequenceMatcher

import openpyxl

XLSX_PATH = "/Users/patrickvankeerbergen/Documents/Documents/Projects/SportsCloset/tournamenttracker/on-the-clock/NFL Draft Order.xlsx"
OUTPUT_PATH = "/Users/patrickvankeerbergen/Documents/Documents/Projects/SportsCloset/tournamenttracker/on-the-clock/src/data/prospects2026.json"

# ── Position standardization ──────────────────────────────────────────────────
#
# Short-form codes that need remapping (including PFF-specific codes)
POS_MAP = {
    "HB":   "RB",
    "OLB":  "LB",
    "ILB":  "LB",
    "DE":   "EDGE",
    "ED":   "EDGE",   # PFF uses "ED"
    "IOL":  "G",
    "DI":   "DT",     # PFF interior defensive lineman
    "T":    "OT",     # PFF offensive tackle
    "OG":   "G",
    "FB":   "RB",     # fullback → RB for simplicity
    "DB":   "S",
    "FS":   "S",
    "SS":   "S",
    "OL":   "OT",     # generic OL → OT
    "DL":   "EDGE",   # Athletic uses "DL" for edge rushers
}

# Long-form descriptions (Ringer uses full words)
LONG_POS_MAP = {
    "quarterback":       "QB",
    "running back":      "RB",
    "halfback":          "RB",
    "fullback":          "RB",
    "wide receiver":     "WR",
    "tight end":         "TE",
    "offensive tackle":  "OT",
    "offensive lineman": "OT",
    "offensive line":    "OT",
    "defensive end":     "EDGE",
    "defensive tackle":  "DT",
    "defensive line":    "EDGE",
    "linebacker":        "LB",
    "inside linebacker": "LB",
    "outside linebacker":"LB",
    "cornerback":        "CB",
    "safety":            "S",
    "free safety":       "S",
    "strong safety":     "S",
    "kicker":            "K",
    "punter":            "P",
    "center":            "C",
    "guard":             "G",
    "edge":              "EDGE",
    "edge rusher":       "EDGE",
    "edge/lb":           "EDGE",  # Athletic writes "edge/LB"
}


def std_pos(raw: str) -> str:
    """Standardize a raw position string to a canonical abbreviation."""
    if not raw:
        return raw
    raw = str(raw).strip()
    upper = raw.upper()
    if upper in POS_MAP:
        return POS_MAP[upper]
    lower = raw.lower()
    if lower in LONG_POS_MAP:
        return LONG_POS_MAP[lower]
    return upper


# ── ID / name helpers ─────────────────────────────────────────────────────────

def make_id(name: str) -> str:
    """Generate a URL-slug id from a player name.
    e.g. 'Rueben Bain Jr.' → 'rueben-bain-jr'
    """
    s = name.lower()
    s = unicodedata.normalize("NFD", s)
    s = s.encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"['.`'\u2019]", "", s)       # remove apostrophes / dots
    s = re.sub(r"[^a-z0-9\s-]", "", s)       # remove other non-alphanumeric
    s = re.sub(r"\s+", "-", s.strip())
    s = re.sub(r"-+", "-", s)
    return s


def norm_name(name: str) -> str:
    """Normalize a name for fuzzy matching: lowercase, ASCII, letters only."""
    s = str(name).strip().lower()
    s = unicodedata.normalize("NFD", s)
    s = s.encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^a-z\s]", "", s)
    return re.sub(r"\s+", " ", s).strip()


def name_similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, norm_name(a), norm_name(b)).ratio()


def find_player(name: str, player_map: dict, threshold: float = 0.85):
    """Return the player_map key that best matches *name*, or None."""
    key = norm_name(name)
    if key in player_map:
        return key
    best_score, best_key = 0.0, None
    for k in player_map:
        score = name_similarity(name, k)
        if score > best_score:
            best_score, best_key = score, k
    return best_key if best_score >= threshold else None


# ── Low-level sheet helpers ───────────────────────────────────────────────────

def col0_values(wb, sheet_name: str) -> list:
    """Return all non-None values from column A of a sheet."""
    ws = wb[sheet_name]
    return [row[0] for row in ws.iter_rows(values_only=True)
            if row and row[0] is not None]


def is_int_value(v) -> bool:
    """True if v is a plain integer stored as int or float (e.g. 3.0 → True)."""
    return (isinstance(v, (int, float))
            and not isinstance(v, bool)
            and v == int(v))


# ═══════════════════════════════════════════════════════════════════════════════
# BIG BOARD RANKINGS
# ═══════════════════════════════════════════════════════════════════════════════

def parse_espn_bigboard(wb) -> list[dict]:
    """ESPN_ScoutsINC_Top150 — clean table with header row.

    Columns: Rank | Player | School | Position
    Returns list of {rank, name, school, position}.
    """
    print("Parsing ESPN_ScoutsINC_Top150 (big board) ...")
    ws = wb["ESPN_ScoutsINC_Top150"]
    players = []
    for row in ws.iter_rows(values_only=True):
        rank, name, school, pos = row[0], row[1], row[2], row[3]
        if not is_int_value(rank):
            continue  # skip header row and any blank rows
        players.append({
            "rank":     int(rank),
            "name":     str(name).strip(),
            "school":   str(school).strip() if school else "",
            "position": std_pos(pos),
        })
    print(f"  {len(players)} players")
    return players


def parse_pff_bigboard(wb) -> list[dict]:
    """PFF_top250_April2nd — vertical stacked groups of 4: pick_num, name, pos, grade.

    Returns list of {rank (1-based order), name, position}.
    """
    print("Parsing PFF_top250_April2nd (big board) ...")
    values = col0_values(wb, "PFF_top250_April2nd")
    players = []
    i = 0
    while i < len(values):
        v = values[i]
        if is_int_value(v) and i + 3 < len(values):
            name_v  = values[i + 1]
            pos_v   = values[i + 2]
            grade_v = values[i + 3]
            if (isinstance(name_v,  str) and
                    isinstance(pos_v,   str) and
                    isinstance(grade_v, (int, float))):
                players.append({
                    "rank":     len(players) + 1,
                    "name":     name_v.strip(),
                    "position": std_pos(pos_v),
                })
                i += 4
                continue
        i += 1
    print(f"  {len(players)} players")
    return players


def parse_ringer_bigboard(wb) -> list[dict]:
    """Ringer_BigBoard_April01 — vertical stacked groups of 4: pick_num, name, 'pos, school', blurb.

    Returns list of {rank (1-based order), name, position, school}.
    """
    print("Parsing Ringer_BigBoard_April01 (big board) ...")
    values = col0_values(wb, "Ringer_BigBoard_April01")
    players = []
    i = 0
    while i < len(values):
        v = values[i]
        if is_int_value(v) and i + 2 < len(values):
            name_v     = values[i + 1]
            pos_sch_v  = values[i + 2]
            if isinstance(name_v, str) and isinstance(pos_sch_v, str):
                parts  = pos_sch_v.split(",", 1)
                pos    = parts[0].strip()
                school = parts[1].strip() if len(parts) > 1 else ""
                players.append({
                    "rank":     len(players) + 1,
                    "name":     name_v.strip(),
                    "position": std_pos(pos),
                    "school":   school,
                })
                i += 4   # skip blurb header row
                continue
        i += 1
    print(f"  {len(players)} players")
    return players


def parse_athletic_bigboard(wb) -> list[dict]:
    """Athletic_Top100Prospects_februa — each player occupies exactly 12 rows:
      [0] rank       [1] name       [2] position   [3] school
      [4] 'Height:'  [5] h_val      [6] 'Weight:'  [7] w_val
      [8] 'Class:'   [9] class_val  [10] pos        [11] class_abbr

    Only rank, name, position, school are extracted.
    Returns list of {rank (1-based order), name, position, school}.
    """
    print("Parsing Athletic_Top100Prospects_februa (big board) ...")
    values = col0_values(wb, "Athletic_Top100Prospects_februa")
    players = []
    i = 0
    while i < len(values):
        v = values[i]
        if is_int_value(v) and 1 <= v <= 500 and i + 3 < len(values):
            name_v   = values[i + 1]
            pos_v    = values[i + 2]
            school_v = values[i + 3]
            # school value is a plain string (not a measurement label)
            if (isinstance(name_v,   str) and
                    isinstance(pos_v,    str) and
                    isinstance(school_v, str) and
                    school_v.strip().lower() not in
                    {"height:", "weight:", "class:", "height", "weight", "class"}):
                players.append({
                    "rank":     len(players) + 1,
                    "name":     name_v.strip(),
                    "position": std_pos(pos_v),
                    "school":   school_v.strip().title(),
                })
                i += 12   # skip the full 12-row block
                continue
        i += 1
    print(f"  {len(players)} players")
    return players


# ═══════════════════════════════════════════════════════════════════════════════
# MOCK DRAFTS  (round 1 pick predictions)
# ═══════════════════════════════════════════════════════════════════════════════

def parse_ringer_mock(wb) -> list[dict]:
    """Ringer_MockDraft_v2 — same vertical-stacked format as Ringer big board:
    pick_num, player_name, 'pos, school', blurb.

    Only picks 1–32 are accepted (round 1).
    Returns list of {pick, name}.
    """
    print("Parsing Ringer_MockDraft_v2 (mock draft) ...")
    values = col0_values(wb, "Ringer_MockDraft_v2")
    picks = []
    i = 0
    while i < len(values):
        v = values[i]
        if is_int_value(v) and 1 <= int(v) <= 32 and i + 2 < len(values):
            pick_num  = int(v)
            name_v    = values[i + 1]
            pos_sch_v = values[i + 2]
            if isinstance(name_v, str) and isinstance(pos_sch_v, str):
                picks.append({
                    "pick": pick_num,
                    "name": name_v.strip(),
                })
                i += 4   # skip blurb row
                continue
        i += 1
    print(f"  {len(picks)} picks")
    return picks


# Matches lines like:
#   "1. Las Vegas Raiders: Fernando Mendoza, QB, Indiana"
#   "3. Dallas Cowboys (from Arizona)*: David Bailey, edge, Texas Tech"
#   "1. Las Vegas Raiders: QB Fernando Mendoza, Indiana"       (PFF — pos prefix)
#   "3. *TRADE* Dallas Cowboys: RB Jeremiyah Love, Notre Dame" (PFF — *TRADE*)
_MOCK_LINE_RE = re.compile(
    r"^(\d+)\."              # pick number
    r"\s+"
    r"(?:\*[^*]+\*\s+)?"    # optional *TRADE* or similar flag
    r"[^:]+:"               # team name (anything up to colon)
    r"\s+"
    r"(?:[A-Z/]+\s+)?"      # optional ALL-CAPS position prefix (PFF style)
    r"([A-Za-z][A-Za-z\s.\'\-]+?)"   # player name (lazy)
    r","                    # followed by a comma
)


def _parse_mock_line(line: str):
    """Parse a single mock-draft text line and return (pick_num, player_name) or None."""
    line = line.strip()
    m = _MOCK_LINE_RE.match(line)
    if not m:
        return None
    pick_num = int(m.group(1))
    # Re-extract the name more robustly from the part after ":"
    after_colon = line[line.index(":") + 1:].strip()
    # Strip optional ALL-CAPS position prefix (PFF: "QB Fernando", "EDGE Rueben")
    after_colon = re.sub(r"^[A-Z/]+\s+(?=[A-Z][a-z])", "", after_colon)
    # Name is everything up to the first ", <something>"
    name_m = re.match(r"^([A-Za-z][A-Za-z\s.\'\-]+?),", after_colon)
    if not name_m:
        return None
    player_name = name_m.group(1).strip()
    return pick_num, player_name


def parse_athletic_mock(wb) -> list[dict]:
    """Athletic_MockDraft_April01 — text lines like:
    "1. Las Vegas Raiders: Fernando Mendoza, QB, Indiana"

    Returns list of {pick, name}.
    """
    print("Parsing Athletic_MockDraft_April01 (mock draft) ...")
    ws = wb["Athletic_MockDraft_April01"]
    picks = []
    for row in ws.iter_rows(values_only=True):
        if not (row and isinstance(row[0], str)):
            continue
        result = _parse_mock_line(row[0])
        if result:
            picks.append({"pick": result[0], "name": result[1]})
    print(f"  {len(picks)} picks")
    return picks


def parse_pff_mock(wb) -> list[dict]:
    """PFF_MockDraft_March3 — text lines like:
    "1. Las Vegas Raiders: QB Fernando Mendoza, Indiana"

    Returns list of {pick, name}.
    """
    print("Parsing PFF_MockDraft_March3 (mock draft) ...")
    ws = wb["PFF_MockDraft_March3"]
    picks = []
    for row in ws.iter_rows(values_only=True):
        if not (row and isinstance(row[0], str)):
            continue
        result = _parse_mock_line(row[0])
        if result:
            picks.append({"pick": result[0], "name": result[1]})
    print(f"  {len(picks)} picks")
    return picks


def parse_consensus_mock(wb) -> list[dict]:
    """Consensus_MockDraft_April04 — vertical stacked groups of 5:
    [rank_number (separator)], name, position, school, score(0-1)
    The separator integer is skipped; list order gives the pick number.

    Returns list of {rank (1-based pick order), name, position, school, confidence}.
    """
    print("Parsing Consensus_MockDraft_April04 (mock draft + consensus rank) ...")
    values = col0_values(wb, "Consensus_MockDraft_April04")
    players = []
    i = 0
    while i < len(values):
        v = values[i]
        # Skip integer separators (1.0, 2.0, ... stored between entries)
        if is_int_value(v):
            i += 1
            continue
        # Expect: name (str), position (str), school (str), score (float)
        if isinstance(v, str) and i + 3 < len(values):
            pos_v    = values[i + 1]
            school_v = values[i + 2]
            score_v  = values[i + 3]
            if (isinstance(pos_v,    str) and
                    isinstance(school_v, str) and
                    isinstance(score_v,  float)):
                players.append({
                    "rank":       len(players) + 1,   # pick order = consensus_rank
                    "name":       v.strip(),
                    "position":   std_pos(pos_v),
                    "school":     school_v.strip(),
                    "confidence": round(float(score_v), 4),
                })
                i += 4
                continue
        i += 1
    print(f"  {len(players)} consensus picks")
    return players


# ═══════════════════════════════════════════════════════════════════════════════
# MERGE + BUILD OUTPUT
# ═══════════════════════════════════════════════════════════════════════════════

def merge_all(
    espn: list,
    pff_bb: list,
    ringer_bb: list,
    athletic_bb: list,
    consensus: list,
    ringer_mock: list,
    athletic_mock: list,
    pff_mock: list,
) -> dict:
    """Merge all sources into a single player_map keyed by norm_name.

    Build order (base list):
      1. ESPN Top 150
      2. PFF players not already in ESPN
      3. Mock-only players not in either board
    """
    # player_map: norm_name -> prospect dict
    player_map: dict[str, dict] = {}

    def get_or_create(name: str, position: str = None, school: str = None):
        key = find_player(name, player_map)
        if key:
            p = player_map[key]
            if position and not p.get("position"):
                p["position"] = position
            if school and not p.get("school"):
                p["school"] = school
            return key, p
        # New entry
        nkey = norm_name(name)
        p = {
            "name":           name,
            "position":       position or "",
            "school":         school or "",
            # big board rankings
            "espn_rank":      None,
            "pff_rank":       None,
            "ringer_rank":    None,
            "athletic_rank":  None,
            # consensus / mock
            "consensus_rank": None,
            "confidence":     None,
            # raw mock picks — used internally, removed in final output
            "_ringer_mock_pick":   None,
            "_athletic_mock_pick": None,
            "_pff_mock_pick":      None,
            "_consensus_mock_pick":None,
            "notes":          "",
        }
        player_map[nkey] = p
        return nkey, p

    # ── 1. ESPN as base ──────────────────────────────────────────────────────
    print("\nMerging ESPN big board ...")
    for entry in espn:
        _, p = get_or_create(entry["name"], entry["position"], entry["school"])
        p["espn_rank"] = entry["rank"]

    # ── 2. PFF big board ─────────────────────────────────────────────────────
    print("Merging PFF big board ...")
    new_from_pff = 0
    for entry in pff_bb:
        key, p = get_or_create(entry["name"], entry["position"])
        if p["pff_rank"] is None:
            p["pff_rank"] = entry["rank"]
            if p["espn_rank"] is None:
                new_from_pff += 1
    print(f"  {new_from_pff} new players added from PFF")

    # ── 3. Ringer big board ──────────────────────────────────────────────────
    print("Merging Ringer big board ...")
    for entry in ringer_bb:
        _, p = get_or_create(entry["name"], entry["position"], entry["school"])
        if p["ringer_rank"] is None:
            p["ringer_rank"] = entry["rank"]

    # ── 4. Athletic big board ────────────────────────────────────────────────
    print("Merging Athletic big board ...")
    for entry in athletic_bb:
        _, p = get_or_create(entry["name"], entry["position"], entry["school"])
        if p["athletic_rank"] is None:
            p["athletic_rank"] = entry["rank"]

    # ── 5. Consensus (gives both consensus_rank and confidence) ──────────────
    print("Merging Consensus ...")
    for entry in consensus:
        _, p = get_or_create(entry["name"], entry["position"], entry["school"])
        if p["consensus_rank"] is None:
            p["consensus_rank"] = entry["rank"]
            p["confidence"]     = entry["confidence"]

    # ── 6. Mock draft picks (tracked separately per source) ──────────────────
    print("Merging mock draft picks ...")

    def apply_mock(mock_list: list, field: str):
        new_players = 0
        for pick_entry in mock_list:
            key = find_player(pick_entry["name"], player_map)
            if key:
                if player_map[key][field] is None:
                    player_map[key][field] = pick_entry["pick"]
            else:
                # Player appears only in mock — add them if name looks valid
                name = pick_entry["name"].strip()
                if len(name) > 3 and " " in name:
                    nkey, p = get_or_create(name)
                    p[field] = pick_entry["pick"]
                    new_players += 1
        return new_players

    n = apply_mock(ringer_mock,   "_ringer_mock_pick")
    print(f"  Ringer mock:   {len(ringer_mock)} picks, {n} new players")
    n = apply_mock(athletic_mock, "_athletic_mock_pick")
    print(f"  Athletic mock: {len(athletic_mock)} picks, {n} new players")
    n = apply_mock(pff_mock,      "_pff_mock_pick")
    print(f"  PFF mock:      {len(pff_mock)} picks, {n} new players")

    # Consensus mock pick = consensus_rank (position in consensus list = pick prediction)
    for p in player_map.values():
        if p["consensus_rank"] is not None:
            p["_consensus_mock_pick"] = p["consensus_rank"]

    return player_map


def compute_predicted_range(picks: list[int]):
    """Derive predicted_range from the mock picks a player appears in.

    - 0 mocks  → None
    - 1 mock   → pick ±1 (floor at 1)
    - 2+ mocks → "min-max"
    """
    valid = [p for p in picks if p is not None]
    if not valid:
        return None
    if len(valid) == 1:
        p = valid[0]
        return f"{max(1, p - 1)}-{p + 1}"
    return f"{min(valid)}-{max(valid)}"


def build_output(player_map: dict) -> list[dict]:
    """Convert the internal player_map into the final output list."""
    prospects = []
    for p in player_map.values():
        mock_picks = [
            p["_ringer_mock_pick"],
            p["_athletic_mock_pick"],
            p["_pff_mock_pick"],
            p["_consensus_mock_pick"],
        ]
        prospects.append({
            "id":                  make_id(p["name"]),
            "name":                p["name"],
            "position":            p["position"],
            "school":              p["school"],
            # big board rankings
            "espn_rank":           p["espn_rank"],
            "pff_rank":            p["pff_rank"],
            "ringer_rank":         p["ringer_rank"],
            "athletic_rank":       p["athletic_rank"],
            # consensus
            "consensus_rank":      p["consensus_rank"],
            # mock picks per source
            "ringer_mock_pick":    p["_ringer_mock_pick"],
            "athletic_mock_pick":  p["_athletic_mock_pick"],
            "pff_mock_pick":       p["_pff_mock_pick"],
            "consensus_mock_pick": p["_consensus_mock_pick"],
            # derived
            "predicted_range":     compute_predicted_range(mock_picks),
            "notes":               "",
        })

    def sort_key(x):
        c  = x["consensus_rank"] if x["consensus_rank"]  is not None else 99999
        e  = x["espn_rank"]      if x["espn_rank"]       is not None else 99999
        pf = x["pff_rank"]       if x["pff_rank"]        is not None else 99999
        return (c, e, pf)

    prospects.sort(key=sort_key)
    return prospects


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print(f"Loading workbook: {XLSX_PATH}\n")
    wb = openpyxl.load_workbook(XLSX_PATH, read_only=True, data_only=True)

    # ── Big board rankings ────────────────────────────────────────────────────
    print("=" * 60)
    print("BIG BOARD RANKINGS")
    print("=" * 60)
    espn        = parse_espn_bigboard(wb)
    pff_bb      = parse_pff_bigboard(wb)
    ringer_bb   = parse_ringer_bigboard(wb)
    athletic_bb = parse_athletic_bigboard(wb)

    # ── Mock drafts ───────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("MOCK DRAFTS")
    print("=" * 60)
    ringer_mock   = parse_ringer_mock(wb)
    athletic_mock = parse_athletic_mock(wb)
    pff_mock      = parse_pff_mock(wb)
    consensus     = parse_consensus_mock(wb)

    # ── Merge ─────────────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("MERGING")
    print("=" * 60)
    player_map = merge_all(
        espn, pff_bb, ringer_bb, athletic_bb,
        consensus,
        ringer_mock, athletic_mock, pff_mock,
    )

    prospects = build_output(player_map)

    # ── Write output ──────────────────────────────────────────────────────────
    output = {"prospects": prospects}
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print(f"\nWrote {len(prospects)} prospects to:\n  {OUTPUT_PATH}")

    # ── Summary ───────────────────────────────────────────────────────────────
    has_espn          = sum(1 for p in prospects if p["espn_rank"]           is not None)
    has_pff           = sum(1 for p in prospects if p["pff_rank"]            is not None)
    has_ringer        = sum(1 for p in prospects if p["ringer_rank"]         is not None)
    has_athletic      = sum(1 for p in prospects if p["athletic_rank"]       is not None)
    has_consensus     = sum(1 for p in prospects if p["consensus_rank"]      is not None)
    has_ringer_mock   = sum(1 for p in prospects if p["ringer_mock_pick"]    is not None)
    has_athletic_mock = sum(1 for p in prospects if p["athletic_mock_pick"]  is not None)
    has_pff_mock      = sum(1 for p in prospects if p["pff_mock_pick"]       is not None)
    has_consensus_mock= sum(1 for p in prospects if p["consensus_mock_pick"] is not None)
    has_range         = sum(1 for p in prospects if p["predicted_range"]     is not None)

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"  Total prospects:          {len(prospects)}")
    print()
    print("  BIG BOARD RANKINGS")
    print(f"    Has espn_rank:          {has_espn}")
    print(f"    Has pff_rank:           {has_pff}")
    print(f"    Has ringer_rank:        {has_ringer}")
    print(f"    Has athletic_rank:      {has_athletic}")
    print(f"    Has consensus_rank:     {has_consensus}")
    print()
    print("  MOCK DRAFT PICKS")
    print(f"    Has ringer_mock_pick:   {has_ringer_mock}")
    print(f"    Has athletic_mock_pick: {has_athletic_mock}")
    print(f"    Has pff_mock_pick:      {has_pff_mock}")
    print(f"    Has consensus_mock_pick:{has_consensus_mock}")
    print()
    print(f"  Has predicted_range:      {has_range}")
    print("=" * 60)

    # ── Top 10 preview ────────────────────────────────────────────────────────
    print("\nTop 10 prospects (sorted by consensus_rank):\n")
    header = (
        f"  {'#':>3}  {'Name':<28} {'Pos':<5} "
        f"{'ESPN':>5} {'PFF':>5} {'RNR':>5} {'ATH':>5} {'CON':>5}  "
        f"{'R-MK':>5} {'A-MK':>5} {'P-MK':>5} {'C-MK':>5}  "
        f"Range"
    )
    print(header)
    print("  " + "-" * (len(header) - 2))
    for p in prospects[:10]:
        def fmt(v): return str(v) if v is not None else "-"
        print(
            f"  {fmt(p['consensus_rank']):>3}  "
            f"{p['name']:<28} "
            f"{p['position']:<5} "
            f"{fmt(p['espn_rank']):>5} "
            f"{fmt(p['pff_rank']):>5} "
            f"{fmt(p['ringer_rank']):>5} "
            f"{fmt(p['athletic_rank']):>5} "
            f"{fmt(p['consensus_rank']):>5}  "
            f"{fmt(p['ringer_mock_pick']):>5} "
            f"{fmt(p['athletic_mock_pick']):>5} "
            f"{fmt(p['pff_mock_pick']):>5} "
            f"{fmt(p['consensus_mock_pick']):>5}  "
            f"{p['predicted_range'] or '-'}"
        )


if __name__ == "__main__":
    main()
