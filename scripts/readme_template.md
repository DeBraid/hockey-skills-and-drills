# Hockey Skills & Drills

A coaching library of on-ice drills. Each drill has a rink diagram, an animation (a silent MP4 or a GIF), the Excalidraw source, and the steps in plain language.

## How to read it

On GitHub, open a drill note below. The diagram, the steps, and the file links render on github.com. When a drill has an MP4, that link opens GitHub's video player. When it does not, the note shows the GIF.

The phone-friendly pages live in [`index.html`](index.html). A page with an MP4 plays that video and uses the PNG as the poster. A page without an MP4 shows the GIF inline, with the PNG as the fallback still and the home-page thumbnail. Clone the repo and open `index.html`, or from the repo root run `python3 -m http.server` and visit the site in a browser. Send the MP4 when a drill has one.

## GitHub Pages

Once GitHub Pages is enabled from the **main** branch, **root** folder, the public site will be [https://debraid.github.io/hockey-skills-and-drills/](https://debraid.github.io/hockey-skills-and-drills/). [`index.html`](index.html) is the home page. [`.nojekyll`](.nojekyll) is already in the root so Pages serves the HTML, CSS, and media as files.

## Drills

{{DRILLS}}

## Add a drill

See [ADDING-A-DRILL.md](ADDING-A-DRILL.md). Media lives in `media/<slug>/`. The registry is [`drills.json`](drills.json). Running `python3 scripts/build_site.py` rewrites the home page, the drill pages, and this README from [`scripts/readme_template.md`](scripts/readme_template.md).
