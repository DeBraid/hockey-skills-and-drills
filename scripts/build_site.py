#!/usr/bin/env python3
"""Generate the hockey drill library from drills.json."""

from __future__ import annotations

import html
import json
import re
import shutil
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "public"
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


def plan_button(slug: str, title: str) -> str:
    return (
        '<button class="btn plan-toggle" type="button" '
        f'data-plan-slug="{esc(slug)}" data-plan-title="{esc(title)}" aria-pressed="false">'
        "Add to plan</button>"
    )


# Vercel Web Analytics: cookieless page views, served from the same origin.
# Enabled per project in Vercel; the script is a no-op 404 on other hosts.
ANALYTICS_SNIPPET = """  <script>window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };</script>
  <script defer src="/_vercel/insights/script.js"></script>"""


def page_shell(title: str, prefix: str, body: str, page: str = "other", drill: str = "") -> str:
    drill_attr = f' data-drill="{esc(drill)}"' if drill else ""
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
{ANALYTICS_SNIPPET}
</head>
<body data-page="{page}"{drill_attr}>
  <a class="skip" href="#content">Skip to content</a>
  <header class="site-header">
    <div class="header-inner">
      <a class="brand" href="{prefix or "./"}">
        <span class="mark" aria-hidden="true"><span></span></span>
        <span class="brand-text">
          <span class="brand-kicker">Coaching library</span>
          <span class="brand-name">Hockey Skills &amp; Drills</span>
        </span>
      </a>
      <nav class="header-actions" aria-label="Site">
        <a class="plan-nav" href="{prefix}plan/">Practice plan <span data-plan-count>(0)</span></a>
        <div class="account-slot" data-account-slot hidden></div>
      </nav>
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
            f"""      <article class="card" data-tags="{' '.join(drill['tags'])}">
        <a class="card-link" href="drills/{slug}/">
          <span class="card-media">
            <img src="{media_rel(slug, 'png')}" alt="">
          </span>
          <div class="card-body">{series}
            <h2>{esc(drill['title'])}</h2>
            <p class="blurb">{esc(drill['blurb'])}</p>
            {tag_list(drill, labels)}
          </div>
        </a>
        <div class="card-actions">
          {plan_button(slug, drill['title'])}
        </div>
      </article>"""
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
    text = page_shell(data["title"], "", body, page="home")
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
            f'        <li><a href="../{other}/">{esc(by_slug[other]["title"])}</a></li>'
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
    <p class="back"><a href="{prefix}">All drills</a></p>
    <header class="drill-head">{kicker}
      <h1>{esc(drill['title'])}</h1>
      <p class="lede">{esc(drill['subtitle'])}</p>
      {tag_list(drill, labels)}{series}
      <div class="plan-row">{plan_button(slug, drill['title'])}</div>
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
    (out_dir / "index.html").write_text(page_shell(title, prefix, body, page="drill", drill=slug), encoding="utf-8")


def md_links(drill: dict, root_prefix: str, page_prefix: str) -> str:
    slug = drill["slug"]
    parts = [
        f"[Drill page]({page_prefix}{slug}/)",
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


def write_plan(data: dict, labels: dict[str, str]) -> None:
    catalog = []
    for drill in data["drills"]:
        slug = drill["slug"]
        catalog.append(
            {
                "slug": slug,
                "title": drill["title"],
                "series": drill.get("series") or "",
                "tags": [labels[tag] for tag in drill["tags"]],
                "png": f"../{media_rel(slug, 'png')}",
                "page": f"../drills/{slug}/",
                "alt": drill["diagramAlt"],
                "points": drill["coachingPoints"],
            }
        )
    blob = json.dumps(catalog, ensure_ascii=False).replace("<", "\\u003c")
    body = f"""  <main id="content" class="wrap plan-page">
    <header class="drill-head">
      <p class="kicker">On-ice coaching</p>
      <h1>Practice plan</h1>
      <p class="lede plan-lede">Add drills from the library, set a time for each, and print the sheet for the bench. A share link sends the drills, times, and title. Notes stay with the plan in this browser, and in your account when you save.</p>
    </header>
    <div class="plan-banner" id="plan-shared" hidden>
      <p id="plan-shared-text"></p>
      <button class="btn primary" type="button" id="plan-load">Load into my plan</button>
    </div>
    <div class="plan-banner" id="plan-import" hidden>
      <p id="plan-import-text">Save the practice plan in this browser to your account?</p>
      <div class="plan-actions">
        <button class="btn primary" type="button" id="plan-import-yes">Save it</button>
        <button class="btn" type="button" id="plan-import-no">Not now</button>
      </div>
    </div>
    <div class="plan-banner" id="plan-signin" hidden>
      <p id="plan-signin-text">Sign in to save this plan to your account. The copy in this browser stays either way.</p>
      <a class="btn primary" id="plan-signin-link" href="../account/">Sign in</a>
    </div>
    <p class="plan-print-title" id="plan-print-title"></p>
    <p class="plan-print-notes" id="plan-print-notes"></p>
    <div class="plan-tools" id="plan-tools">
      <label class="plan-title-label" for="plan-title">Plan title
        <input id="plan-title" type="text" maxlength="80" placeholder="Tuesday practice" autocomplete="off">
      </label>
      <label class="plan-title-label" for="plan-notes">Practice notes
        <textarea id="plan-notes" maxlength="2000" rows="3" placeholder="Optional, for the bench"></textarea>
      </label>
      <div class="plan-actions" id="plan-save" hidden>
        <button class="btn primary" type="button" id="plan-save-btn">Save</button>
        <button class="btn" type="button" id="plan-save-new">Save as new</button>
      </div>
      <p class="plan-account-state" id="plan-account-state" hidden></p>
      <div class="plan-actions">
        <button class="btn primary" type="button" id="plan-share">Copy share link</button>
        <button class="btn" type="button" id="plan-print">Print</button>
        <button class="btn danger" type="button" id="plan-clear">Clear plan</button>
      </div>
      <p class="plan-status" id="plan-status" role="status"></p>
      <input class="plan-share-fallback" id="plan-share-fallback" type="text" readonly hidden>
    </div>
    <p class="plan-total" id="plan-total" hidden>0 drills · 0 min</p>
    <p class="empty" id="plan-empty" hidden>No drills in this plan yet. <a href="../">Browse drills</a> and use Add to plan.</p>
    <p class="empty" id="plan-shared-empty" hidden>Nothing in this link matched a drill in the library.</p>
    <ol class="plan-list" id="plan-list" aria-label="Drills in this plan"></ol>
  </main>
  <script type="application/json" id="drill-catalog">{blob}</script>
"""
    out = ROOT / "plan"
    out.mkdir(parents=True, exist_ok=True)
    title = "Practice plan · Hockey Skills & Drills"
    (out / "index.html").write_text(page_shell(title, "../", body, page="plan"), encoding="utf-8")


def write_account() -> None:
    body = """  <main id="content" class="wrap-read account-page">
    <header class="drill-head">
      <p class="kicker">On-ice coaching</p>
      <h1>My plans</h1>
      <p class="lede" id="account-intro">Sign in to save practice plans across phones and browsers. With no account, a plan stays in this browser, and share links still work.</p>
    </header>
    <div id="account-unavailable" hidden>
      <p>Saving plans to an account is not available on this copy of the site. You can still build a practice plan in this browser.</p>
      <p><a class="btn" href="../plan/">Open the practice plan</a></p>
    </div>
    <div id="account-out" hidden>
      <div class="account-methods">
        <button class="btn primary" type="button" id="account-google" hidden>Continue with Google</button>
        <form id="account-email" hidden>
          <label class="plan-title-label" for="account-email-input">Email
            <input id="account-email-input" type="email" autocomplete="email" inputmode="email" required placeholder="you@example.com">
          </label>
          <button class="btn primary" type="submit">Email me a sign-in link</button>
        </form>
      </div>
    </div>
    <div id="account-in" hidden>
      <p class="account-user" id="account-user"></p>
      <div class="plan-banner" id="account-import" hidden>
        <p>Save the practice plan in this browser to your account?</p>
        <div class="plan-actions">
          <button class="btn primary" type="button" id="account-import-yes">Save it</button>
          <button class="btn" type="button" id="account-import-no">Not now</button>
        </div>
      </div>
      <p class="empty" id="account-empty" hidden>No saved plans yet. <a href="../plan/">Build one</a>, then tap Save.</p>
      <ul class="account-list" id="account-list"></ul>
      <div class="account-actions account-footer-actions">
        <a class="btn" href="../plan/">Practice plan</a>
        <button class="btn" type="button" id="account-signout">Sign out</button>
        <button class="btn danger" type="button" id="account-delete">Delete account and saved plans</button>
      </div>
    </div>
    <section class="account-privacy">
      <h2>Privacy</h2>
      <p>An account stores the name, email address, and profile photo from the sign-in provider, plus the practice plans you save. Share links do not include your notes. Saved plans are visible only to you. Delete account removes that profile and every plan saved to it.</p>
      <p>To see which drills get used, the site counts page views and plan actions with a random ID kept in this browser. It does not use cookies for this and does not record your email, IP address, or device details.</p>
    </section>
    <p class="plan-status" id="account-status" role="status"></p>
  </main>
"""
    out = ROOT / "account"
    out.mkdir(parents=True, exist_ok=True)
    title = "My plans · Hockey Skills & Drills"
    (out / "index.html").write_text(page_shell(title, "../", body, page="account"), encoding="utf-8")


def local_targets(text: str) -> list[str]:
    targets = []
    for href, md in LINK_RE.findall(text):
        url = href or md
        if not url or url.startswith(("http://", "https://", "mailto:", "#", "/_vercel/")):
            continue
        targets.append(url.split("#", 1)[0])
    return targets


def check_output(drills: list[dict]) -> None:
    files = [
        ROOT / "index.html",
        ROOT / "README.md",
        ROOT / "plan" / "index.html",
        ROOT / "account" / "index.html",
    ]
    for drill in drills:
        files.append(ROOT / "drills" / f"{drill['slug']}.md")
        files.append(ROOT / "drills" / drill["slug"] / "index.html")
    missing = []
    for path in files:
        text = path.read_text(encoding="utf-8")
        for url in local_targets(text):
            target = (path.parent / url).resolve()
            if target.is_dir():
                target = target / "index.html"
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
        if f'data-plan-slug="{slug}"' not in page or 'href="../../plan/"' not in page:
            raise SystemExit(f"{slug} page is missing the practice plan controls")
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
    if 'href="plan/"' not in home or "data-plan-count" not in home:
        raise SystemExit("home page is missing the plan link")
    for drill in drills:
        if f'data-plan-slug="{drill["slug"]}"' not in home:
            raise SystemExit(f"home page is missing Add to plan for {drill['slug']}")
    plan_text = (ROOT / "plan" / "index.html").read_text(encoding="utf-8")
    match = re.search(
        r'<script type="application/json" id="drill-catalog">(.*?)</script>',
        plan_text,
    )
    if not match:
        raise SystemExit("plan page is missing the drill catalog")
    catalog = json.loads(match.group(1))
    if [item["slug"] for item in catalog] != [drill["slug"] for drill in drills]:
        raise SystemExit("plan catalog slugs do not match drills.json")
    for item in catalog:
        if not item.get("points"):
            raise SystemExit(f"plan catalog is missing coaching points for {item['slug']}")
        png = (ROOT / "plan" / item["png"]).resolve()
        page = (ROOT / "plan" / item["page"]).resolve()
        if page.is_dir():
            page = page / "index.html"
        if not png.is_file() or not page.is_file():
            raise SystemExit(f"plan catalog has a missing file for {item['slug']}")
    if "Fork or star" in plan_text or "Add a drill" in plan_text:
        raise SystemExit("plan page should stay read-only")
    if 'id="plan-save" hidden' not in plan_text or 'id="plan-notes"' not in plan_text:
        raise SystemExit("plan page is missing the hidden save controls")
    if "data-account-slot hidden" not in home:
        raise SystemExit("home page should hide account controls until the API is available")
    if "Sign in" in home or "My plans" in home:
        raise SystemExit("home page should not show account controls until the API is available")
    account = (ROOT / "account" / "index.html").read_text(encoding="utf-8")
    if "Fork or star" in account or "Add a drill" in account:
        raise SystemExit("account page should stay read-only")
    if 'id="account-out" hidden' not in account or "data-account-slot hidden" not in account:
        raise SystemExit("account page should hide sign-in until the API is available")
    if "Privacy" not in account or 'id="account-delete"' not in account:
        raise SystemExit("account page is missing the privacy note or delete button")
    html_pages = [
        ROOT / "index.html",
        ROOT / "plan" / "index.html",
        ROOT / "account" / "index.html",
    ]
    html_pages.extend(ROOT / "drills" / drill["slug"] / "index.html" for drill in drills)
    for html_path in html_pages:
        text = html_path.read_text(encoding="utf-8")
        if "index.html" in text:
            raise SystemExit(f"{html_path.relative_to(ROOT)} still links index.html")
        if 'src="/_vercel/insights/script.js"' not in text:
            raise SystemExit(f"{html_path.relative_to(ROOT)} is missing the Vercel Web Analytics script")
        if "/admin" in text:
            raise SystemExit(f"{html_path.relative_to(ROOT)} should not link the admin page")


def publish_site() -> None:
    if SITE.exists():
        shutil.rmtree(SITE)
    SITE.mkdir()
    for name in ("css", "js", "media"):
        shutil.copytree(ROOT / name, SITE / name)
    for name in ("favicon.svg", "robots.txt", ".nojekyll"):
        source = ROOT / name
        if source.is_file():
            shutil.copy2(source, SITE / name)
    shutil.copy2(ROOT / "index.html", SITE / "index.html")
    for name in ("plan", "account"):
        shutil.copytree(ROOT / name, SITE / name)
    drills = SITE / "drills"
    drills.mkdir()
    for entry in (ROOT / "drills").iterdir():
        page = entry / "index.html"
        if entry.is_dir() and page.is_file():
            dest = drills / entry.name
            dest.mkdir()
            shutil.copy2(page, dest / "index.html")
    banned_names = {
        "package.json",
        "package-lock.json",
        "tsconfig.json",
        "vercel.json",
        "drills.json",
        ".env",
        ".env.example",
        ".env.local",
        "README.md",
        "SETUP-VERCEL.md",
        "ADDING-A-DRILL.md",
        ".gitignore",
    }
    banned_dirs = {"lib", "db", "scripts", "api", "node_modules", ".git"}
    for path in SITE.rglob("*"):
        relative = path.relative_to(SITE)
        if path.name in banned_names or relative.parts[:1] and relative.parts[0] in banned_dirs:
            raise SystemExit(f"public/ must not contain {relative}")
        if path.suffix.lower() in {".md", ".ts", ".py", ".sql", ".mjs"}:
            raise SystemExit(f"public/ must not contain {relative}")
    required = [
        SITE / "index.html",
        SITE / "plan" / "index.html",
        SITE / "account" / "index.html",
        SITE / "js" / "site.js",
        SITE / "css" / "styles.css",
        SITE / "media" / "fonts" / "Virgil.woff2",
        SITE / "media" / "cone-weave" / "cone-weave-anim.html",
        SITE / "drills" / "cone-weave" / "index.html",
    ]
    missing = [str(path.relative_to(ROOT)) for path in required if not path.is_file()]
    if missing:
        raise SystemExit("public/ is missing site files:\n" + "\n".join(missing))


def main() -> None:
    data = load()
    labels = tag_labels(data)
    by_slug = {drill["slug"]: drill for drill in data["drills"]}
    write_index(data, labels)
    for drill in data["drills"]:
        write_drill_html(drill, by_slug, labels)
        write_drill_md(drill, by_slug, labels)
    write_readme(data["drills"], labels)
    write_plan(data, labels)
    write_account()
    check_output(data["drills"])
    publish_site()
    print(f"Built {len(data['drills'])} drills")


if __name__ == "__main__":
    try:
        main()
    except BrokenPipeError:
        sys.exit(0)
