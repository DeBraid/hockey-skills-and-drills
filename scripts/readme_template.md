# Hockey Skills & Drills

A coaching library of on-ice drills: one full-ice passing circuit and three half-ice low-to-high entries. Each drill has a rink diagram, a short silent MP4, a GIF, the Excalidraw source, and the steps in plain language.

Fork or star the repository to keep a copy or follow updates.

## How to read it

On GitHub, open a drill note below. The diagram, the steps, and the file links render on github.com. The MP4 link opens GitHub's video player.

The phone-friendly pages live in [`index.html`](index.html). Each one embeds the MP4, uses the PNG as the poster, and keeps the GIF as a download. Clone the repo and open `index.html`, or from the repo root run `python3 -m http.server` and visit the site in a browser. Send the MP4 when you share a drill on WhatsApp.

## GitHub Pages

Once GitHub Pages is enabled from the **main** branch, **root** folder, the public site will be [https://debraid.github.io/hockey-skills-and-drills/](https://debraid.github.io/hockey-skills-and-drills/). [`index.html`](index.html) is the home page. [`.nojekyll`](.nojekyll) is already in the root so Pages serves the HTML, CSS, and media as files.

## Drills

{{DRILLS}}

## Add a drill

See [ADDING-A-DRILL.md](ADDING-A-DRILL.md). Media lives in `media/<slug>/`. The registry is [`drills.json`](drills.json). Running `python3 scripts/build_site.py` rewrites the home page, the drill pages, and this README from [`scripts/readme_template.md`](scripts/readme_template.md).
