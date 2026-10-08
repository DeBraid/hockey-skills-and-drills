# Hockey Skills & Drills

A coaching library of on-ice drills. Each drill has a rink diagram, an HTML animation, the Excalidraw source, and the steps in plain language.

## How to read it

On GitHub, open a drill note below. The diagram, the steps, and the file links render on github.com.

The phone-friendly pages live in [`index.html`](index.html). Each drill page embeds the HTML animation and keeps the PNG as the still diagram and the home-page thumbnail. Clone the repo and open `index.html`, or from the repo root run `python3 -m http.server` and visit the site in a browser.

[`plan/index.html`](plan/index.html) is the practice plan. Add drills from the home page or a drill page. The plan stays in the browser. Copy share link builds a URL with the drill list, optional minutes, and an optional title. Opening that link does not replace a plan already saved in the browser until you choose Load into my plan. Share links work without an account.

## Accounts

On the Vercel deployment, a coach can sign in with Google or an email link and save plans. Setup is in [SETUP-VERCEL.md](SETUP-VERCEL.md). Until that is in place, including on GitHub Pages, the site stays a browser practice plan and the account buttons stay hidden.

## GitHub Pages

Leave GitHub Pages off once [https://hockey.derekbraid.com/](https://hockey.derekbraid.com/) is live. The steps are in [SETUP-VERCEL.md](SETUP-VERCEL.md). Pages does not run the account API.

Do not publish this repository's root folder. That folder also contains the API source and the database schema. The build writes a `public/` folder with only the site (pages, CSS, JS, and media). If you need a static fallback, publish `public/`, not the root.

## Drills

{{DRILLS}}

## Add a drill

See [ADDING-A-DRILL.md](ADDING-A-DRILL.md). Media lives in `media/<slug>/`. The registry is [`drills.json`](drills.json). Running `python3 scripts/build_site.py` rewrites the home page, the drill pages, the practice plan, and this README from [`scripts/readme_template.md`](scripts/readme_template.md).
