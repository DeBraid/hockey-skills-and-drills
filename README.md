# Hockey Skills & Drills

A private coaching library of on-ice drills: one full-ice passing circuit and three half-ice low-to-high entries. Each drill has a rink diagram, a short silent MP4, a GIF, the Excalidraw source, and the steps in plain language.

This repository is private. Share it by inviting collaborators.

## How to read it

On GitHub, open a drill note below. The diagram, the steps, and the file links render on github.com. The MP4 link opens GitHub's video player.

The phone-friendly pages live in [`index.html`](index.html). Each one embeds the MP4, uses the PNG as the poster, and keeps the GIF as a download. Clone the repo and open `index.html`, or from the repo root run `python3 -m http.server` and visit the site in a browser. Send the MP4 when you share a drill on WhatsApp.

## If the repo becomes public

GitHub Pages can serve this site from the **main** branch, **root** folder. [`index.html`](index.html) is the home page. [`.nojekyll`](.nojekyll) is already in the root so Pages serves the HTML, CSS, and media as files.

## Drills

### [Follow the Pass](drills/follow-the-pass.md)

Full ice, two-sided. Lines along each goal line; the front player at the boards passes first. Catch at cone 3, drive, shoot, and join the other line.

**Tags:** `full-ice`, `passing`, `shooting`

[Note](drills/follow-the-pass.md) · [Video page](drills/follow-the-pass/index.html) · [MP4](media/follow-the-pass/follow-the-pass.mp4) · [GIF](media/follow-the-pass/follow-the-pass.gif) · [PNG](media/follow-the-pass/follow-the-pass.png) · [Excalidraw](media/follow-the-pass/follow-the-pass.excalidraw) · [Edit in Excalidraw](https://excalidraw.com/#json=yZtRxgmM5Zzl64BXsT1-y,DNP04A28RrNvco2lrc3lyQ)

### [Low-to-High: D Shot](drills/low-to-high-shot.md)

Half-ice zone entry. Carry in, drive to the dot, curl toward the boards, and pass up to the D. The D shoots and the forward drives the net.

**Tags:** `half-ice`, `zone-entry`, `passing`, `shooting`, `defence`

[Note](drills/low-to-high-shot.md) · [Video page](drills/low-to-high-shot/index.html) · [MP4](media/low-to-high-shot/low-to-high-shot.mp4) · [GIF](media/low-to-high-shot/low-to-high-shot.gif) · [PNG](media/low-to-high-shot/low-to-high-shot.png) · [Excalidraw](media/low-to-high-shot/low-to-high-shot.excalidraw)

### [Low-to-High: Give-and-Go](drills/low-to-high-give-and-go.md)

Same zone entry. After the low-to-high pass, the D gives it back to the forward cutting the slot, and the forward shoots.

**Tags:** `half-ice`, `zone-entry`, `passing`, `shooting`, `defence`

[Note](drills/low-to-high-give-and-go.md) · [Video page](drills/low-to-high-give-and-go/index.html) · [MP4](media/low-to-high-give-and-go/low-to-high-give-and-go.mp4) · [GIF](media/low-to-high-give-and-go/low-to-high-give-and-go.gif) · [PNG](media/low-to-high-give-and-go/low-to-high-give-and-go.png) · [Excalidraw](media/low-to-high-give-and-go/low-to-high-give-and-go.excalidraw) · [Edit in Excalidraw](https://excalidraw.com/#json=PKA09mlyorcRyYW7XvmM5,sz7tsIEBbCT4iNpaD84QZA)

### [Low-to-High: D-to-D](drills/low-to-high-d-to-d.md)

Same zone entry. The bottom D passes across to the top D, the top D shoots, and the forward screens.

**Tags:** `half-ice`, `zone-entry`, `passing`, `shooting`, `defence`

[Note](drills/low-to-high-d-to-d.md) · [Video page](drills/low-to-high-d-to-d/index.html) · [MP4](media/low-to-high-d-to-d/low-to-high-d-to-d.mp4) · [GIF](media/low-to-high-d-to-d/low-to-high-d-to-d.gif) · [PNG](media/low-to-high-d-to-d/low-to-high-d-to-d.png) · [Excalidraw](media/low-to-high-d-to-d/low-to-high-d-to-d.excalidraw) · [Edit in Excalidraw](https://excalidraw.com/#json=bSyjPWAizPxD8DlFI9vmA,zrpEIlD7lgwLffcBUvRNrA)


## Add a drill

See [ADDING-A-DRILL.md](ADDING-A-DRILL.md). Media lives in `media/<slug>/`. The registry is [`drills.json`](drills.json). Running `python3 scripts/build_site.py` rewrites the home page, the drill pages, and this README from [`scripts/readme_template.md`](scripts/readme_template.md).
