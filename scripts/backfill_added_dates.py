#!/usr/bin/env python3
"""Fill missing `added` dates in drills.json from git history.

For each drill with no `added` date, this uses the earlier of:

- the commit that first added `drills/<slug>.md`
  (`git log --diff-filter=A --follow --format=%aI -- drills/<slug>.md`)
- the commit that first added that drill's `"slug"` entry in `drills.json`

Only the calendar day (YYYY-MM-DD) is stored. Commit messages and author
names are never read or written. Drills that already have a valid date
are left unchanged.
"""

from __future__ import annotations

import datetime as dt
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DRILLS_PATH = ROOT / "drills.json"
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
# %aI is a strict ISO 8601 author timestamp. The date is the part we keep.
STAMP_RE = re.compile(
    r"^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$"
)


def valid_date(value: object) -> bool:
    if not isinstance(value, str) or not DATE_RE.match(value):
        return False
    try:
        dt.date.fromisoformat(value)
    except ValueError:
        return False
    return True


def git_stamps(args: list[str]) -> list[str]:
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as error:
        raise SystemExit("git is required to backfill added dates") from error
    if result.returncode != 0:
        raise SystemExit("git log failed while reading a drill date")
    stamps = []
    for line in result.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        if not STAMP_RE.match(line):
            raise SystemExit("git returned a value that is not an ISO timestamp")
        stamps.append(line)
    return stamps


def calendar_day(stamp: str) -> str:
    match = STAMP_RE.match(stamp)
    if not match:
        raise SystemExit("git returned a value that is not an ISO timestamp")
    day = match.group(1)
    try:
        dt.date.fromisoformat(day)
    except ValueError as error:
        raise SystemExit(f"git returned a calendar day that does not exist: {day}") from error
    return day


def first_added(slug: str) -> str:
    """Earliest calendar day the drill's note or registry entry was added."""
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
        raise SystemExit(f"Invalid slug: {slug!r}")
    days: list[str] = []
    md_stamps = git_stamps(
        [
            "log",
            "--diff-filter=A",
            "--follow",
            "--format=%aI",
            "--",
            f"drills/{slug}.md",
        ]
    )
    # git log is newest first. The last line is the first time the file was added.
    if md_stamps:
        days.append(calendar_day(md_stamps[-1]))
    json_stamps = git_stamps(
        [
            "log",
            "-S",
            f'"slug": "{slug}"',
            "--format=%aI",
            "--",
            "drills.json",
        ]
    )
    if json_stamps:
        days.append(calendar_day(json_stamps[-1]))
    if not days:
        raise SystemExit(f"No git history for {slug}")
    return min(days)


def insert_added(text: str, slug: str, day: str) -> str:
    slug_line = f'"slug": "{slug}"'
    pattern = re.compile(
        rf'^([ \t]*){re.escape(slug_line)},\n(?:\1"added": "[^"]*",\n)?',
        re.MULTILINE,
    )
    match = pattern.search(text)
    if not match:
        raise SystemExit(f"Could not find the drills.json entry for {slug}")
    indent = match.group(1)
    replacement = f'{indent}{slug_line},\n{indent}"added": "{day}",\n'
    return text[: match.start()] + replacement + text[match.end() :]


def main() -> None:
    try:
        data = json.loads(DRILLS_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise SystemExit(f"drills.json is not valid JSON: {error}") from error
    drills = data.get("drills")
    if not isinstance(drills, list):
        raise SystemExit("drills.json needs a drills array")

    text = DRILLS_PATH.read_text(encoding="utf-8")
    filled: list[tuple[str, str]] = []
    for drill in drills:
        if not isinstance(drill, dict):
            raise SystemExit("Each drill must be an object")
        slug = drill.get("slug")
        if not isinstance(slug, str):
            raise SystemExit("A drill is missing its slug")
        if valid_date(drill.get("added")):
            continue
        day = first_added(slug)
        text = insert_added(text, slug, day)
        filled.append((slug, day))

    if not filled:
        print("backfill_added_dates: nothing to fill")
        return

    DRILLS_PATH.write_text(text, encoding="utf-8")
    checked = json.loads(DRILLS_PATH.read_text(encoding="utf-8"))
    by_slug = {drill["slug"]: drill.get("added") for drill in checked["drills"]}
    for slug, day in filled:
        if by_slug.get(slug) != day:
            raise SystemExit(f"Failed to store the added date for {slug}")
    print(f"backfill_added_dates: set {len(filled)} dates")
    for slug, day in filled:
        print(f"  {slug} {day}")


if __name__ == "__main__":
    try:
        main()
    except BrokenPipeError:
        sys.exit(0)
