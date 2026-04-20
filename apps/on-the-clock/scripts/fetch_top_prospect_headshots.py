#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "src" / "data" / "prospects2026.json"
OUT_DIR = ROOT / "public" / "prospect-headshots" / "2026"
MANIFEST_PATH = OUT_DIR / "manifest.json"

TRACKER_URL = "https://www.nfl.com/draft/tracker/2026/prospects/all_all?collegeClass=all&page=1&status=all"
FORMAT_INSTRUCTIONS = "w_400,h_400,c_fill,g_face,f_png,q_auto"
NAME_ALIASES = {
    "kevin concepcion": ["kc concepcion"],
}


def norm_rank(value):
    return 9999 if value in (None, "") else int(value)


def normalize_name(name: str) -> str:
    cleaned = (
        name.lower()
        .replace(".", "")
        .replace(",", "")
        .replace("'", "")
        .replace("-", " ")
    )
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def load_top_60():
    raw = json.loads(DATA_PATH.read_text())
    rows = raw["prospects"] if isinstance(raw, dict) and "prospects" in raw else raw
    rows = [row for row in rows if isinstance(row, dict)]
    rows.sort(
        key=lambda row: (
            norm_rank(row.get("consensus_rank")),
            norm_rank(row.get("espn_rank")),
            norm_rank(row.get("pff_rank")),
            row.get("name", ""),
        )
    )
    return rows[:60]


def fetch_text(url: str) -> str:
    with urllib.request.urlopen(url) as response:
        return response.read().decode("utf-8", errors="ignore")


def extract_headshot_map(html: str):
    pattern = re.compile(
        r'\\"displayName\\":\\"([^\\]+)\\".*?\\"headshot\\":\\"([^\\]+)\\"',
        re.S,
    )
    headshots = {}
    for display_name, templated_url in pattern.findall(html):
        headshots[normalize_name(display_name)] = templated_url.replace(
            "{formatInstructions}", FORMAT_INSTRUCTIONS
        )
    return headshots


def download_binary(url: str) -> bytes:
    with urllib.request.urlopen(url) as response:
        return response.read()


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    prospects = load_top_60()
    html = fetch_text(TRACKER_URL)
    headshot_map = extract_headshot_map(html)

    manifest = []
    missing = []

    for prospect in prospects:
        normalized = normalize_name(prospect["name"])
        source_url = headshot_map.get(normalized)
        if not source_url:
            for alias in NAME_ALIASES.get(normalized, []):
                source_url = headshot_map.get(alias)
                if source_url:
                    break
        filename = f"{prospect['id']}.png"
        relative_path = f"/prospect-headshots/2026/{filename}"
        local_path = OUT_DIR / filename

        if not source_url:
          missing.append(prospect["name"])
          manifest.append(
              {
                  "id": prospect["id"],
                  "name": prospect["name"],
                  "school": prospect.get("school"),
                  "status": "missing",
                  "path": relative_path,
                  "source_url": None,
              }
          )
          continue

        image_bytes = download_binary(source_url)
        local_path.write_bytes(image_bytes)
        manifest.append(
            {
                "id": prospect["id"],
                "name": prospect["name"],
                "school": prospect.get("school"),
                "status": "downloaded",
                "path": relative_path,
                "source_url": source_url,
            }
        )
        print(f"Downloaded {prospect['name']} -> {filename}")

    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2))

    print(f"\nSaved {sum(item['status'] == 'downloaded' for item in manifest)} headshots to {OUT_DIR}")
    if missing:
        print("\nMissing:")
        for name in missing:
            print(f"- {name}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
