#!/usr/bin/env python3
"""Generate the hockey drill library from drills.json."""

from __future__ import annotations

import html
import json
import re
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
MEDIA_EXTS = ("png", "gif", "mp4", "excalidraw")
LINK_RE = re.compile(r"(?:href|src|poster)=\"([^\"]+)\"|\[[^\]]*\]\(([^)\s]+)\)")
SERIES_NOTE = (
    "Same entry for every low-to-high drill: carry in, drive to the dot, "
    "curl toward the boards, and pass up the wall. Only the finish changes."
)


def esc(value: str) -> str:
    return html.escape(value, quote=True)


def media_name(slug: str, ext: str) -> str:
    return f"{slug}.{ext}"


def media_rel(slug: str, ext: str) -> str:
    return f"media/{slug}/{media_name(slug, ext)}"


def load() -> dict:
    path = ROOT / "drills.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise SystemExit(f"drills.json is not valid JSON: {error}") from error
    validate(data)
    return data


def validate(data: dict) -> None:
    tags = data.get("tags")
    drills = data.get("drills")
    if not isinstance(tags, list) or not tags:
        raise SystemExit("drills.json needs a non-empty tags array")
    if not isinstance(drills, list) or not drills:
        raise SystemExit("drills.json needs a non-empty drills array")

    tag_ids = []
    for tag in tags:
        tag_id = tag.get("id")
        label = tag.get("label")
        if not isinstance(tag_id, str) or not SLUG_RE.match(tag_id):
            raise SystemExit(f"Invalid tag id: {tag_id!r}")
        if not isinstance(label, str) or not label.strip():
            raise SystemExit(f"Tag {tag_id} needs a label")
        tag_ids.append(tag_id)
    if len(tag_ids) != len(set(tag_ids)):
        raise SystemExit("Tag ids must be unique")

    slugs = []
    for drill in drills:
        slug = drill.get("slug")
        if not isinstance(slug, str) or not SLUG_RE.match(slug):
            raise SystemExit(f"Invalid slug: {slug!r}")
        slugs.append(slug)
        for key in ("title", "subtitle", "blurb", "diagramAlt"):
            if not isinstance(drill.get(key), str) or not drill[key].strip():
                raise SystemExit(f"{slug} is missing {key}")
        drill_tags = drill.get("tags")
        if not isinstance(drill_tags, list) or not drill_tags:
            raise SystemExit(f"{slug} needs tags")
        unknown = [tag for tag in drill_tags if tag not in tag_ids]
        if unknown:
            raise SystemExit(f"{slug} has unknown tags: {', '.join(unknown)}")
        for key in ("coachingPoints", "steps"):
            values = drill.get(key)
            if not isinstance(values, list) or not values or not all(isinstance(item, str) and item.strip() for item in values):
                raise SystemExit(f"{slug} needs non-empty {key}")
        url = drill.get("excalidrawUrl", None)
        if url is not None and (not isinstance(url, str) or not url.startswith("https://excalidraw.com/")):
            raise SystemExit(f"{slug} excalidrawUrl must be an excalidraw.com link or null")
        for ext in MEDIA_EXTS:
            path = ROOT / "media" / slug / media_name(slug, ext)
            if not path.is_file():
                raise SystemExit(f"Missing media file: {path.relative_to(ROOT)}")
    if len(slugs) != len(set(slugs)):
        raise SystemExit("Drill slugs must be unique")
    known = set(slugs)
    for drill in drills:
        related = drill.get("related", [])
        if not isinstance(related, list):
            raise SystemExit(f"{drill['slug']} related must be a list")
        for slug in related:
            if slug not in known or slug == drill["slug"]:
                raise SystemExit(f"{drill['slug']} has a bad related slug: {slug}")


def png_size(path: Path) -> tuple[int, int]:
    data = path.read_bytes()[:24]
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise SystemExit(f"Not a PNG: {path}")
    return struct.unpack(">II", data[16:24])


def tag_labels(data: dict) -> dict[str, str]:
    return {tag["id"]: tag["label"] for tag in data["tags"]}


def page_shell(title: str, prefix: str, body: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="theme-color" content="#10243c" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#0c141c" media="(prefers-color-scheme: dark)">
  <title>{esc(title)}</title>
  <link rel="icon" href="{prefix}favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="{prefix}css/styles.css">
</head>
<body>
  <a class="skip" href="#content">Skip to content</a>
  <header class="site-header">
    <div class="header-inner">
      <a class="brand" href="{prefix}index.html">
        <span class="mark" aria-hidden="true"><span></span></span>
        <span class="brand-text">
          <span class="brand-kicker">Coaching library</span>
          <span class="brand-name">Hockey Skills &amp; Drills</span>
        </span>
      </a>
      <p class="header-note">Fork or star the repo</p>
    </div>
  </header>
{body}
  <footer class="site-footer">
    <div class="wrap">
      <p>Coaching library. Fork or star the repository.</p>
      <p><a href="{prefix}ADDING-A-DRILL.md">Add a drill</a></p>
    </div>
  </footer>
  <script src="{prefix}js/site.js"></script>
</body>
</html>
"""


def tag_list(drill: dict, labels: dict[str, str]) -> str:
    items = "\n".join(
        f'          <li><span class="tag">{esc(labels[tag])}</span></li>'
        for tag in drill["tags"]
    )
    return f'<ul class="tag-row">\n{items}\n        </ul>'


def write_index(data: dict, labels: dict[str, str]) -> None:
    filters = ['        <button class="filter" type="button" data-filter="all" aria-pressed="true">All</button>']
    for tag in data["tags"]:
        filters.append(
            f'        <button class="filter" type="button" data-filter="{esc(tag["id"])}" aria-pressed="false">{esc(tag["label"])}</button>'
        )
    cards = []
    for drill in data["drills"]:
        slug = drill["slug"]
        series = ""
        if drill.get("series"):
            series = f'\n          <p class="series">{esc(drill["series"])}</p>'
        cards.append(
            f"""      <a class="card" href="drills/{slug}/index.html" data-tags="{' '.join(drill['tags'])}">
        <span class="card-media">
          <img src="{media_rel(slug, 'png')}" alt="">
        </span>
        <div class="card-body">{series}
          <h2>{esc(drill['title'])}</h2>
          <p class="blurb">{esc(drill['blurb'])}</p>
          {tag_list(drill, labels)}
        </div>
      </a>"""
        )
    count = len(data["drills"])
    body = f"""  <main id="content" class="wrap">
    <section class="hero">
      <p class="kicker">On-ice coaching</p>
      <h1>{esc(data['title'])}</h1>
      <p class="lede">Diagrams, silent MP4s, and bench-side steps for full-ice work and half-ice low-to-high entries. Each drill page plays the MP4 and uses the PNG as the poster.</p>
    </section>
    <div class="toolbar">
      <p class="drill-count" id="drill-count">{count} drills</p>
      <div class="filters" role="group" aria-label="Filter drills by tag">
{chr(10).join(filters)}
      </div>
    </div>
    <p class="empty" id="empty-filter" hidden>No drills use that tag.</p>
    <div class="grid">
{chr(10).join(cards)}
    </div>
  </main>
"""
    text = page_shell(data["title"], "", body)
    (ROOT / "index.html").write_text(text, encoding="utf-8")


def download_links(drill: dict, prefix: str) -> str:
    slug = drill["slug"]
    items = [
        ("PNG diagram", "png", False),
        ("GIF animation", "gif", False),
        ("MP4 video", "mp4", True),
        ("Excalidraw file", "excalidraw", False),
    ]
    parts = []
    for label, ext, primary in items:
        href = f"{prefix}{media_rel(slug, ext)}"
        class_attr = ' class="primary"' if primary else ""
        parts.append(
            f'        <li><a{class_attr} href="{href}" download="{media_name(slug, ext)}">{label}</a></li>'
        )
    url = drill.get("excalidrawUrl")
    if url:
        parts.append(
            f'        <li><a href="{esc(url)}" target="_blank" rel="noopener noreferrer">Edit in Excalidraw</a></li>'
        )
    return "\n".join(parts)


def write_drill_html(drill: dict, by_slug: dict[str, dict], labels: dict[str, str]) -> None:
    slug = drill["slug"]
    prefix = "../../"
    png = ROOT / "media" / slug / media_name(slug, "png")
    width, height = png_size(png)
    points = "\n".join(f"        <li>{esc(point)}</li>" for point in drill["coachingPoints"])
    steps = "\n".join(f"        <li>{esc(step)}</li>" for step in drill["steps"])
    series = ""
    if drill.get("series"):
        series = f'\n      <p class="series-note">{esc(SERIES_NOTE)}</p>'
    kicker = ""
    if drill.get("series"):
        kicker = f'\n      <p class="kicker">{esc(drill["series"])}</p>'
    related_html = ""
    if drill.get("related"):
        links = "\n".join(
            f'        <li><a href="../{other}/index.html">{esc(by_slug[other]["title"])}</a></li>'
            for other in drill["related"]
        )
        related_html = f"""
    <section class="panel">
      <h2>Same series</h2>
      <ul class="related">
{links}
      </ul>
    </section>"""
    edit_note = ""
    if not drill.get("excalidrawUrl"):
        edit_note = '\n      <p class="file-note">Open the Excalidraw file in Excalidraw to change the diagram.</p>'
    video_src = f"{prefix}{media_rel(slug, 'mp4')}"
    poster = f"{prefix}{media_rel(slug, 'png')}"
    gif = f"{prefix}{media_rel(slug, 'gif')}"
    body = f"""  <main id="content" class="wrap-read">
    <p class="back"><a href="{prefix}index.html">All drills</a></p>
    <header class="drill-head">{kicker}
      <h1>{esc(drill['title'])}</h1>
      <p class="lede">{esc(drill['subtitle'])}</p>
      {tag_list(drill, labels)}{series}
    </header>

    <section class="panel" aria-labelledby="watch-heading">
      <h2 id="watch-heading">Watch</h2>
      <figure class="video-frame">
        <video class="drill-video" controls loop playsinline preload="metadata" poster="{poster}" aria-label="Silent animation of {esc(drill['title'])}">
          <source src="{video_src}" type="video/mp4">
          <p>Play the <a href="{video_src}">MP4</a>. The still diagram is below, and the <a href="{gif}">GIF</a> is a download.</p>
        </video>
        <figcaption>Silent MP4. The PNG is the poster until the video plays, and it is the still diagram below. The GIF stays a download.</figcaption>
      </figure>
    </section>

    <section class="panel" aria-labelledby="diagram-heading">
      <h2 id="diagram-heading">Diagram</h2>
      <figure class="diagram">
        <img src="{poster}" width="{width}" height="{height}" alt="{esc(drill['diagramAlt'])}">
      </figure>
    </section>

    <section class="panel" aria-labelledby="points-heading">
      <h2 id="points-heading">Coaching points</h2>
      <ul class="points">
{points}
      </ul>
    </section>

    <section class="panel" aria-labelledby="steps-heading">
      <h2 id="steps-heading">How it runs</h2>
      <ol class="steps">
{steps}
      </ol>
    </section>

    <section class="panel" aria-labelledby="files-heading">
      <h2 id="files-heading">Downloads</h2>
      <ul class="downloads">
{download_links(drill, prefix)}
      </ul>{edit_note}
    </section>{related_html}
  </main>
"""
    out_dir = ROOT / "drills" / slug
    out_dir.mkdir(parents=True, exist_ok=True)
    title = f"{drill['title']} · Hockey Skills & Drills"
    (out_dir / "index.html").write_text(page_shell(title, prefix, body), encoding="utf-8")


def md_links(drill: dict, root_prefix: str, page_prefix: str) -> str:
    slug = drill["slug"]
    parts = [
        f"[Video page]({page_prefix}{slug}/index.html)",
        f"[MP4]({root_prefix}{media_rel(slug, 'mp4')})",
        f"[GIF]({root_prefix}{media_rel(slug, 'gif')})",
        f"[PNG]({root_prefix}{media_rel(slug, 'png')})",
        f"[Excalidraw]({root_prefix}{media_rel(slug, 'excalidraw')})",
    ]
    if drill.get("excalidrawUrl"):
        parts.append(f"[Edit in Excalidraw]({drill['excalidrawUrl']})")
    return " · ".join(parts)


def write_drill_md(drill: dict, by_slug: dict[str, dict], labels: dict[str, str]) -> None:
    slug = drill["slug"]
    tags = ", ".join(f"`{tag}`" for tag in drill["tags"])
    points = "\n".join(f"- {point}" for point in drill["coachingPoints"])
    steps = "\n".join(f"{index}. {step}" for index, step in enumerate(drill["steps"], start=1))
    series = ""
    if drill.get("series"):
        series = f"\n{SERIES_NOTE}\n"
    related = ""
    if drill.get("related"):
        lines = "\n".join(f"- [{by_slug[other]['title']}]({other}.md)" for other in drill["related"])
        related = f"\n## Same series\n\n{lines}\n"
    edit_note = ""
    if not drill.get("excalidrawUrl"):
        edit_note = "\nOpen the Excalidraw file above in [Excalidraw](https://excalidraw.com) to change the diagram.\n"
    text = f"""# {drill['title']}

{drill['subtitle']}

**Tags:** {tags}
{series}
[All drills](../README.md) · {md_links(drill, '../', '')}

![{drill['diagramAlt']}](../{media_rel(slug, 'png')})

The video page embeds the MP4 and uses this PNG as the poster. On GitHub, the MP4 link above opens the video. The GIF is the downloadable animation.

## Coaching points

{points}

## How it runs

{steps}
{edit_note}{related}
"""
    (ROOT / "drills" / f"{slug}.md").write_text(text, encoding="utf-8")


def write_readme(drills: list[dict], labels: dict[str, str]) -> None:
    template_path = ROOT / "scripts" / "readme_template.md"
    template = template_path.read_text(encoding="utf-8")
    if "{{DRILLS}}" not in template:
        raise SystemExit("scripts/readme_template.md is missing {{DRILLS}}")
    blocks = []
    for drill in drills:
        slug = drill["slug"]
        tag_line = ", ".join(f"`{tag}`" for tag in drill["tags"])
        blocks.append(
            f"### [{drill['title']}](drills/{slug}.md)\n\n"
            f"{drill['blurb']}\n\n"
            f"**Tags:** {tag_line}\n\n"
            f"[Note](drills/{slug}.md) · {md_links(drill, '', 'drills/')}\n"
        )
    readme = template.replace("{{DRILLS}}", "\n".join(blocks).rstrip() + "\n")
    (ROOT / "README.md").write_text(readme, encoding="utf-8")


def local_targets(text: str) -> list[str]:
    targets = []
    for href, md in LINK_RE.findall(text):
        url = href or md
        if not url or url.startswith(("http://", "https://", "mailto:", "#")):
            continue
        targets.append(url.split("#", 1)[0])
    return targets


def check_output(drills: list[dict]) -> None:
    files = [ROOT / "index.html", ROOT / "README.md"]
    for drill in drills:
        files.append(ROOT / "drills" / f"{drill['slug']}.md")
        files.append(ROOT / "drills" / drill["slug"] / "index.html")
    missing = []
    for path in files:
        text = path.read_text(encoding="utf-8")
        for url in local_targets(text):
            target = (path.parent / url).resolve()
            if not target.is_file():
                missing.append(f"{path.relative_to(ROOT)} -> {url}")
    if missing:
        raise SystemExit("Broken relative links:\n" + "\n".join(missing))

    for drill in drills:
        page = (ROOT / "drills" / drill["slug"] / "index.html").read_text(encoding="utf-8")
        slug = drill["slug"]
        poster = f"../../media/{slug}/{slug}.png"
        video = f"../../media/{slug}/{slug}.mp4"
        if f'poster="{poster}"' not in page or f'src="{video}"' not in page:
            raise SystemExit(f"{slug} page is missing the MP4 or PNG poster")
        if "playsinline" not in page or "controls" not in page:
            raise SystemExit(f"{slug} video is missing controls or playsinline")
        url = drill.get("excalidrawUrl")
        if url and url not in page:
            raise SystemExit(f"{slug} is missing its Excalidraw link")
        if not url and "excalidraw.com/#json" in page:
            raise SystemExit(f"{slug} should not link a public Excalidraw share")
        note = (ROOT / "drills" / f"{slug}.md").read_text(encoding="utf-8")
        if f"../media/{slug}/{slug}.png" not in note or f"../media/{slug}/{slug}.mp4" not in note:
            raise SystemExit(f"{slug} markdown is missing media links")


def main() -> None:
    data = load()
    labels = tag_labels(data)
    by_slug = {drill["slug"]: drill for drill in data["drills"]}
    write_index(data, labels)
    for drill in data["drills"]:
        write_drill_html(drill, by_slug, labels)
        write_drill_md(drill, by_slug, labels)
    write_readme(data["drills"], labels)
    check_output(data["drills"])
    print(f"Built {len(data['drills'])} drills")


if __name__ == "__main__":
    try:
        main()
    except BrokenPipeError:
        sys.exit(0)
