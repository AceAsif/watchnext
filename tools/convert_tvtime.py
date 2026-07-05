#!/usr/bin/env python3
"""
Convert a TV Time GDPR export (gdpr-data.zip) into a WatchNext import file.

Usage:
    python tools/convert_tvtime.py path/to/gdpr-data.zip -o data/tvtime_import.json

Reads only from the zip; nothing is uploaded anywhere. Output JSON structure:

{
  "source": "tvtime-gdpr",
  "generatedAt": "...",
  "shows": [
    {
      "tvdbId": 73244,
      "name": "The Office (US)",
      "followed": true,
      "watches": [
        {"season": 2, "episode": 19, "watchedAt": "2022-10-11T10:46:00", "runtimeMin": 24}
      ]
    }
  ],
  "movies": [
    {"name": "The Batman", "watchedAt": "2023-01-05T09:12:00", "runtimeMin": 175}
  ]
}
"""
import argparse
import csv
import io
import json
import sys
import zipfile
from collections import defaultdict
from datetime import datetime, timezone


def read_csv(zf: zipfile.ZipFile, name: str):
    """Yield dict rows from a CSV inside the zip. Returns [] if missing."""
    try:
        raw = zf.read(name)
    except KeyError:
        return []
    text = raw.decode("utf-8-sig", errors="replace")
    return list(csv.DictReader(io.StringIO(text)))


def to_int(value, default=None):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def norm_ts(value):
    """Normalise TV Time timestamps ('YYYY-MM-DD HH:MM:SS') to ISO 8601."""
    if not value:
        return None
    value = value.strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt).isoformat()
        except ValueError:
            continue
    return None


def convert(zip_path: str) -> dict:
    shows = {}  # tvdbId -> show dict
    movies = []

    with zipfile.ZipFile(zip_path) as zf:
        # ------------------------------------------------------------------
        # 1. Episode watch history (v2 records: one row per episode watch)
        # ------------------------------------------------------------------
        for row in read_csv(zf, "tracking-prod-records-v2.csv"):
            key = row.get("key", "")
            if not (key.startswith("watch-episode") or key.startswith("rewatch-episode")):
                continue
            tvdb_id = to_int(row.get("s_id"))
            season = to_int(row.get("season_number"))
            episode = to_int(row.get("episode_number"))
            if tvdb_id is None or season is None or episode is None:
                continue
            show = shows.setdefault(tvdb_id, {
                "tvdbId": tvdb_id,
                "name": row.get("series_name") or f"TVDB {tvdb_id}",
                "followed": False,
                "watches": [],
            })
            runtime_sec = to_int(row.get("runtime"), 0) or 0
            show["watches"].append({
                "season": season,
                "episode": episode,
                "watchedAt": norm_ts(row.get("created_at")),
                "runtimeMin": round(runtime_sec / 60) if runtime_sec else None,
                "rewatch": key.startswith("rewatch-episode"),
            })

        # ------------------------------------------------------------------
        # 2. Follow status (user-series rows in v2, plus followed_tv_show.csv)
        # ------------------------------------------------------------------
        for row in read_csv(zf, "tracking-prod-records-v2.csv"):
            if not row.get("key", "").startswith("user-series"):
                continue
            tvdb_id = to_int(row.get("s_id"))
            if tvdb_id is None:
                continue
            followed = str(row.get("is_followed", "")).strip().lower() == "true"
            show = shows.setdefault(tvdb_id, {
                "tvdbId": tvdb_id,
                "name": row.get("series_name") or f"TVDB {tvdb_id}",
                "followed": False,
                "watches": [],
            })
            show["followed"] = show["followed"] or followed

        for row in read_csv(zf, "followed_tv_show.csv"):
            tvdb_id = to_int(row.get("tv_show_id"))
            if tvdb_id is None:
                continue
            if str(row.get("archived", "0")).strip() == "1":
                continue
            show = shows.setdefault(tvdb_id, {
                "tvdbId": tvdb_id,
                "name": row.get("tv_show_name") or f"TVDB {tvdb_id}",
                "followed": False,
                "watches": [],
            })
            show["followed"] = True

        # ------------------------------------------------------------------
        # 3. Movies (older-format tracking file)
        # ------------------------------------------------------------------
        seen_movies = set()
        for row in read_csv(zf, "tracking-prod-records.csv"):
            if row.get("type") != "watch":
                continue
            name = (row.get("movie_name") or "").strip()
            if not name:
                continue
            watched_at = norm_ts(row.get("watch_date")) or norm_ts(row.get("created_at"))
            dedupe_key = (name, watched_at)
            if dedupe_key in seen_movies:
                continue
            seen_movies.add(dedupe_key)
            runtime_sec = to_int(row.get("runtime"), 0) or 0
            movies.append({
                "name": name,
                "watchedAt": watched_at,
                "runtimeMin": round(runtime_sec / 60) if runtime_sec else None,
            })

    # Sort watches chronologically inside each show
    for show in shows.values():
        show["watches"].sort(key=lambda w: (w["watchedAt"] or "", w["season"], w["episode"]))

    show_list = sorted(shows.values(), key=lambda s: s["name"].lower())
    movies.sort(key=lambda m: m["watchedAt"] or "")

    return {
        "source": "tvtime-gdpr",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "shows": show_list,
        "movies": movies,
    }


def main():
    parser = argparse.ArgumentParser(description="Convert TV Time GDPR export to WatchNext import JSON")
    parser.add_argument("zip_path", help="Path to gdpr-data.zip")
    parser.add_argument("-o", "--output", default="tvtime_import.json", help="Output JSON path")
    args = parser.parse_args()

    data = convert(args.zip_path)

    total_watches = sum(len(s["watches"]) for s in data["shows"])
    followed = sum(1 for s in data["shows"] if s["followed"])
    print(f"Shows:            {len(data['shows'])}")
    print(f"  followed:       {followed}")
    print(f"Episode watches:  {total_watches}")
    print(f"Movies watched:   {len(data['movies'])}")

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()
