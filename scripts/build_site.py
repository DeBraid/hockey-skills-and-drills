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
REQUIRED_MEDIA = ("png", "excalidraw")
LINK_RE = re.compile(r"(?:href|src|poster)=\"([^\"]+)\"|\[[^\]]*\]\(([^)\s]+)\)")
VIEWBOX_RE = re.compile(r"<svg\b[^>]*\bviewBox=\"([^\"]+)\"")
FONT_FILES = ("Virgil.woff2", "Virgil-OFL.txt")
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


def media_path(slug: str, ext: str) -> Path:
    return ROOT / "media" / slug / media_name(slug, ext)


def anim_name(slug: str) -> str:
    return f"{slug}-anim.html"


def anim_rel(slug: str) -> str:
    return f"media/{slug}/{anim_name(slug)}"


def anim_path(slug: str) -> Path:
    return ROOT / "media" / slug / anim_name(slug)


def css_num(value: float) -> str:
    return f"{value:.4f}".rstrip("0").rstrip(".")


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
        for ext in REQUIRED_MEDIA:
            path = media_path(slug, ext)
            if not path.is_file():
                raise SystemExit(f"Missing media file: {path.relative_to(ROOT)}")
        anim = anim_path(slug)
        if not anim.is_file():
            raise SystemExit(f"Missing media file: {anim.relative_to(ROOT)}")
        anim_size(anim)
    for name in FONT_FILES:
        font = ROOT / "media" / "fonts" / name
        if not font.is_file():
            raise SystemExit(f"Missing media file: {font.relative_to(ROOT)}")
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


def anim_size(path: Path) -> tuple[float, float]:
    match = VIEWBOX_RE.search(path.read_text(encoding="utf-8"))
    if not match:
        raise SystemExit(f"{path.relative_to(ROOT)} is missing an SVG viewBox")
    parts = match.group(1).split()
    if len(parts) != 4:
        raise SystemExit(f"{path.relative_to(ROOT)} has a bad viewBox")
    try:
        width = float(parts[2])
        height = float(parts[3])
    except ValueError as error:
        raise SystemExit(f"{path.relative_to(ROOT)} has a bad viewBox") from error
    if width <= 0 or height <= 0:
        raise SystemExit(f"{path.relative_to(ROOT)} has a bad viewBox")
    return width, height


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
    </div>
  </header>
{body}
  <footer class="site-footer">
    <div class="wrap">
      <p>Hockey Skills &amp; Drills</p>
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
      <p class="lede">Diagrams, animations, and bench-side steps. Each drill page plays a looping HTML animation. The PNG is the card thumbnail and the still diagram.</p>
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
        related_heading = "Same series" if drill.get("series") else "Related drills"
        related_html = f"""
    <section class="panel">
      <h2>{related_heading}</h2>
      <ul class="related">
{links}
      </ul>
    </section>"""
    edit_note = ""
    if not drill.get("excalidrawUrl"):
        edit_note = '\n      <p class="file-note">Open the Excalidraw file in Excalidraw to change the diagram.</p>'
    poster = f"{prefix}{media_rel(slug, 'png')}"
    anim_width, anim_height = anim_size(anim_path(slug))
    anim_w = css_num(anim_width)
    anim_h = css_num(anim_height)
    anim_src = f"{prefix}{anim_rel(slug)}"
    watch = f"""    <section class="panel" aria-labelledby="watch-heading">
      <h2 id="watch-heading">Watch</h2>
      <div class="anim-frame" style="--anim-w: {anim_w}; --anim-h: {anim_h}">
        <iframe class="drill-anim" src="{anim_src}" title="Animation of {esc(drill['title'])}" style="aspect-ratio: {anim_w} / {anim_h}" loading="lazy" scrolling="no" data-anim-w="{anim_w}" data-anim-h="{anim_h}"></iframe>
      </div>
      <p class="anim-open"><a href="{anim_src}">Open full screen</a></p>
    </section>"""
    body = f"""  <main id="content" class="wrap-read">
    <p class="back"><a href="{prefix}index.html">All drills</a></p>
    <header class="drill-head">{kicker}
      <h1>{esc(drill['title'])}</h1>
      <p class="lede">{esc(drill['subtitle'])}</p>
      {tag_list(drill, labels)}{series}
    </header>

{watch}

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
        f"[Drill page]({page_prefix}{slug}/index.html)",
        f"[Animation]({root_prefix}{anim_rel(slug)})",
        f"[PNG]({root_prefix}{media_rel(slug, 'png')})",
        f"[Excalidraw]({root_prefix}{media_rel(slug, 'excalidraw')})",
    ]
    if drill.get("excalidrawUrl"):
        parts.append(f"[Edit in Excalidraw]({drill['excalidrawUrl']})")
    return " · ".join(parts)


def media_block(drill: dict) -> str:
    slug = drill["slug"]
    png = f"![{drill['diagramAlt']}](../{media_rel(slug, 'png')})"
    return (
        f"{png}\n\n"
        "The drill page embeds the HTML animation. The PNG is the still diagram and the home-page thumbnail."
    )


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
        related_heading = "Same series" if drill.get("series") else "Related drills"
        related = f"\n## {related_heading}\n\n{lines}\n"
    edit_note = ""
    if not drill.get("excalidrawUrl"):
        edit_note = "\nOpen the Excalidraw file above in [Excalidraw](https://excalidraw.com) to change the diagram.\n"
    text = f"""# {drill['title']}

{drill['subtitle']}

**Tags:** {tags}
{series}
[All drills](../README.md) · {md_links(drill, '../', '')}

{media_block(drill)}

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
        anim = f"../../media/{slug}/{slug}-anim.html"
        width, height = anim_size(anim_path(slug))
        if poster not in page:
            raise SystemExit(f"{slug} page is missing the PNG")
        if f'src="{anim}"' not in page or 'class="drill-anim"' not in page:
            raise SystemExit(f"{slug} page is missing the HTML animation")
        if f"aspect-ratio: {css_num(width)} / {css_num(height)}" not in page:
            raise SystemExit(f"{slug} page is missing the animation aspect ratio")
        if f'href="{anim}">Open full screen</a>' not in page:
            raise SystemExit(f"{slug} page is missing the full-screen animation link")
        if "<video" in page or ".gif" in page or ".mp4" in page:
            raise SystemExit(f"{slug} page still links a GIF or MP4")
        url = drill.get("excalidrawUrl")
        if url and url not in page:
            raise SystemExit(f"{slug} is missing its Excalidraw link")
        if not url and "excalidraw.com/#json" in page:
            raise SystemExit(f"{slug} should not link a public Excalidraw share")
        note = (ROOT / "drills" / f"{slug}.md").read_text(encoding="utf-8")
        if f"../media/{slug}/{slug}.png" not in note:
            raise SystemExit(f"{slug} markdown is missing the PNG")
        if f"../media/{slug}/{slug}-anim.html" not in note:
            raise SystemExit(f"{slug} markdown is missing the animation link")
        if ".gif" in note or ".mp4" in note:
            raise SystemExit(f"{slug} markdown still links a GIF or MP4")
    home = (ROOT / "index.html").read_text(encoding="utf-8")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    for label, text in (("home page", home), ("README", readme)):
        if ".gif" in text or ".mp4" in text or "<video" in text:
            raise SystemExit(f"{label} still links a GIF or MP4")
    if "Fork or star" in home or "Add a drill" in home:
        raise SystemExit("home page should stay read-only")


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
