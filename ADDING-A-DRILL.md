# Adding a drill

The library is generated from [`drills.json`](drills.json). Add the media, add one registry entry, then rebuild the pages.

## 1. Add the media

Create `media/<slug>/` and put four files in it, using the slug as the file name:

| File | Role |
| --- | --- |
| `<slug>.png` | Still diagram. The video uses it as the poster, and the home page uses it as the thumbnail. |
| `<slug>.mp4` | The clip the drill page plays. H.264 MP4, silent is fine. This is the file to send on WhatsApp. |
| `<slug>.gif` | Downloadable animation. The pages link it; they do not play it inline. |
| `<slug>.excalidraw` | Source drawing, so someone can edit the diagram later. |

Keep the exported sizes. The slug is lowercase words separated by hyphens, for example `net-front-walkout`.

## 2. Register it in `drills.json`

Add an object to the `drills` array:

- `slug` matches the folder and the file names.
- `title`, `subtitle`, `blurb`, and `diagramAlt` are the words on the card and the drill page.
- `tags` is a list of ids from the top-level `tags` array (`full-ice`, `half-ice`, `zone-entry`, `passing`, `shooting`, `defence`). Add a new tag there first if you need a new chip on the home page.
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
- `drills/<slug>/index.html` for the video page

Change the library introduction in `scripts/readme_template.md`, then run the same command. A direct edit to `README.md` or a generated page is replaced on the next build.

## 4. Check it

Open `index.html` in a browser, or from the repo root run:

```bash
python3 -m http.server
```

Confirm the new card, the tag filters, the MP4 with the PNG poster, the still diagram, and the download links. On a phone, the MP4 should play with controls. The GIF stays a download.

Commit `media/<slug>/`, `drills.json`, and the generated pages together.
