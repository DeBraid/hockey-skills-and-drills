# Adding a drill

The library is generated from [`drills.json`](drills.json). Add the media, add one registry entry, then rebuild the pages.

## 1. Add the media

Create `media/<slug>/` and put these files in it, using the slug as the file name:

| File | Role |
| --- | --- |
| `<slug>.png` | Still diagram. It is the home-page thumbnail and the still image on the drill page. |
| `<slug>-anim.html` | Looping HTML animation. The drill page embeds this file. It is a standalone page (inline SVG and CSS, with Pause and Replay) and it loads the shared font from `../fonts/Virgil.woff2`. |
| `<slug>.excalidraw` | Source drawing, so someone can edit the diagram later. |

The shared font files stay in `media/fonts/`: `Virgil.woff2` and `Virgil-OFL.txt` (SIL Open Font License 1.1). Do not copy the font into each drill folder.

Keep the exported sizes. The slug is lowercase words separated by hyphens, for example `net-front-walkout`. The build reads the animation SVG `viewBox` and sizes the embedded frame to that aspect ratio, so a wide full-ice diagram stays landscape and a tall zone diagram stays portrait.

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

That rewrites the pages in the repo and a `public/` copy that Vercel publishes. The `public/` folder is not committed. It rewrites:

- `index.html`
- `README.md` (from [`scripts/readme_template.md`](scripts/readme_template.md) plus the registry)
- `drills/<slug>.md` for the GitHub note
- `drills/<slug>/index.html` for the drill page
- `plan/index.html` for the practice plan

The practice plan is built from the same registry, so a new drill can be added from the site. Plans live in the browser and in share links, not in the repo.

Change the library introduction in `scripts/readme_template.md`, then run the same command. A direct edit to `README.md` or a generated page is replaced on the next build.

## 4. Check it

Open `index.html` in a browser, or from the repo root run:

```bash
python3 -m http.server
```

Confirm the new card, the tag filters, the still diagram, and the download links. The Watch section embeds `<slug>-anim.html`, Pause and Replay work, and the full-screen link opens that animation page. The PNG stays the thumbnail and the still image. Leave `excalidrawUrl` as `null` when there is no public Excalidraw share; the page then omits that link.

Commit `media/<slug>/`, `drills.json`, and the generated pages together.
