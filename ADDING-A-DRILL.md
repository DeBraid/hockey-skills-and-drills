# Adding a drill

The library is generated from [`drills.json`](drills.json). Add the media, add one registry entry, then rebuild the pages.

## 1. Add the media

Create `media/<slug>/` and put these files in it, using the slug as the file name:

| File | Role |
| --- | --- |
| `<slug>.png` | Still diagram. It is the home-page thumbnail. On an MP4 page it is the video poster. On a GIF page it is the fallback still. |
| `<slug>.gif` | Animation. Downloadable on every drill. When there is no MP4, the drill page plays this GIF inline. |
| `<slug>.excalidraw` | Source drawing, so someone can edit the diagram later. |
| `<slug>.mp4` | Optional. When this file is present, the drill page plays it and keeps the GIF as a download. H.264, silent is fine. This is the file to send on WhatsApp. Leave it out when the drill only has a GIF. |

Keep the exported sizes. The slug is lowercase words separated by hyphens, for example `net-front-walkout`.

## 2. Register it in `drills.json`

Add an object to the `drills` array:

- `slug` matches the folder and the file names.
- `title`, `subtitle`, `blurb`, and `diagramAlt` are the words on the card and the drill page.
- `tags` is a list of ids from the top-level `tags` array (`full-ice`, `half-ice`, `zone-entry`, `passing`, `shooting`, `defence`, `skating`, `breakout`, `small-area-game`). Add a new tag there first if you need a new chip on the home page. The home-page filters are generated from that list.
- `series` is optional. Set it to `"Low-to-high"` when the drill uses that same zone entry.
- `excalidrawUrl` is the public Excalidraw share link, or `null` when there is only the file.
- `coachingPoints` and `steps` are arrays of plain sentences, in skate order.
- `related` is a list of other slugs, or `[]`.

## 3. Rebuild

From the repository root:

```bash
python3 scripts/build_site.py
```

That rewrites:

- `index.html`
- `README.md` (from [`scripts/readme_template.md`](scripts/readme_template.md) plus the registry)
- `drills/<slug>.md` for the GitHub note
- `drills/<slug>/index.html` for the drill page

Change the library introduction in `scripts/readme_template.md`, then run the same command. A direct edit to `README.md` or a generated page is replaced on the next build.

## 4. Check it

Open `index.html` in a browser, or from the repo root run:

```bash
python3 -m http.server
```

Confirm the new card, the tag filters, the still diagram, and the download links. A drill with an MP4 plays that video, uses the PNG as the poster, and does not play the GIF inline. A drill without an MP4 shows the GIF in the Watch section, uses the PNG if the GIF cannot play, and does not show a video player or an MP4 download. Leave `excalidrawUrl` as `null` when there is no public Excalidraw share; the page then omits that link.

Commit `media/<slug>/`, `drills.json`, and the generated pages together.
