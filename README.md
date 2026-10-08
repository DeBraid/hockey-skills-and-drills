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

### [Follow the Pass](drills/follow-the-pass.md)

Full ice, two-sided. Lines along each goal line; the front player at the boards passes first. Catch at cone 3, drive, shoot, and join the other line.

**Tags:** `full-ice`, `passing`, `shooting`

[Note](drills/follow-the-pass.md) · [Drill page](drills/follow-the-pass/) · [Animation](media/follow-the-pass/follow-the-pass-anim.html) · [PNG](media/follow-the-pass/follow-the-pass.png) · [Excalidraw](media/follow-the-pass/follow-the-pass.excalidraw) · [Edit in Excalidraw](https://excalidraw.com/#json=yZtRxgmM5Zzl64BXsT1-y,DNP04A28RrNvco2lrc3lyQ)

### [Low-to-High: D Shot](drills/low-to-high-shot.md)

Half-ice zone entry. Carry in, drive to the dot, curl toward the boards, and pass up to the D. The D shoots and the forward drives the net.

**Tags:** `half-ice`, `zone-entry`, `passing`, `shooting`, `defence`

[Note](drills/low-to-high-shot.md) · [Drill page](drills/low-to-high-shot/) · [Animation](media/low-to-high-shot/low-to-high-shot-anim.html) · [PNG](media/low-to-high-shot/low-to-high-shot.png) · [Excalidraw](media/low-to-high-shot/low-to-high-shot.excalidraw)

### [Low-to-High: Give-and-Go](drills/low-to-high-give-and-go.md)

Same zone entry. After the low-to-high pass, the D gives it back to the forward cutting the slot, and the forward shoots.

**Tags:** `half-ice`, `zone-entry`, `passing`, `shooting`, `defence`

[Note](drills/low-to-high-give-and-go.md) · [Drill page](drills/low-to-high-give-and-go/) · [Animation](media/low-to-high-give-and-go/low-to-high-give-and-go-anim.html) · [PNG](media/low-to-high-give-and-go/low-to-high-give-and-go.png) · [Excalidraw](media/low-to-high-give-and-go/low-to-high-give-and-go.excalidraw) · [Edit in Excalidraw](https://excalidraw.com/#json=PKA09mlyorcRyYW7XvmM5,sz7tsIEBbCT4iNpaD84QZA)

### [Low-to-High: D-to-D](drills/low-to-high-d-to-d.md)

Same zone entry. The bottom D passes across to the top D, the top D shoots, and the forward screens.

**Tags:** `half-ice`, `zone-entry`, `passing`, `shooting`, `defence`

[Note](drills/low-to-high-d-to-d.md) · [Drill page](drills/low-to-high-d-to-d/) · [Animation](media/low-to-high-d-to-d/low-to-high-d-to-d-anim.html) · [PNG](media/low-to-high-d-to-d/low-to-high-d-to-d.png) · [Excalidraw](media/low-to-high-d-to-d/low-to-high-d-to-d.excalidraw) · [Edit in Excalidraw](https://excalidraw.com/#json=bSyjPWAizPxD8DlFI9vmA,zrpEIlD7lgwLffcBUvRNrA)

### [1 Up / 1 Down](drills/one-up-one-down.md)

Corner 1v1. On 'Go' the D touches the goal line and the F touches the blue line. The coach puts the puck in, the F attacks for a shot and a rebound, and the D gaps up and angles.

**Tags:** `defence`, `small-area-game`

[Note](drills/one-up-one-down.md) · [Drill page](drills/one-up-one-down/) · [Animation](media/one-up-one-down/one-up-one-down-anim.html) · [PNG](media/one-up-one-down/one-up-one-down.png) · [Excalidraw](media/one-up-one-down/one-up-one-down.excalidraw)

### [Olympic Breakout Pass](drills/olympic-breakout-pass.md)

Continuous groups of three in one zone. F passes low to X, pivots on the wall, takes it back, one-touches across to O, and curls into the slot for a one-timer from X.

**Tags:** `passing`, `shooting`, `breakout`

[Note](drills/olympic-breakout-pass.md) · [Drill page](drills/olympic-breakout-pass/) · [Animation](media/olympic-breakout-pass/olympic-breakout-pass-anim.html) · [PNG](media/olympic-breakout-pass/olympic-breakout-pass.png) · [Excalidraw](media/olympic-breakout-pass/olympic-breakout-pass.excalidraw) · [Edit in Excalidraw](https://excalidraw.com/#json=1Cttzcue5rLcbEE9KRBvl,fSHHU7jO5wDHNoktif0FRw)

### [Zone Exits: Bounce Pass](drills/zone-exit-bounce-pass.md)

Defensive-zone exits from a line in each corner. Start with a self-pass off the boards around a cone, swap the cone for a coach as a soft D, then finish with a bounce stretch pass to a teammate past the D holding the line.

**Tags:** `passing`, `breakout`

[Note](drills/zone-exit-bounce-pass.md) · [Drill page](drills/zone-exit-bounce-pass/) · [Animation](media/zone-exit-bounce-pass/zone-exit-bounce-pass-anim.html) · [PNG](media/zone-exit-bounce-pass/zone-exit-bounce-pass.png) · [Excalidraw](media/zone-exit-bounce-pass/zone-exit-bounce-pass.excalidraw) · [Edit in Excalidraw](https://excalidraw.com/#json=LYlXdSwxemY2ccKBTi6_0,j1BlMvOLs4v_knxBVl3tlQ)

### [Tip-and-Dig Shooting](drills/tip-and-dig-shooting.md)

Zone shooting with two nets: an empty net at the hash marks and the regular net with a goalie. Tip the point shot into the empty net, dig it out, and shoot on the goalie.

**Tags:** `shooting`

[Note](drills/tip-and-dig-shooting.md) · [Drill page](drills/tip-and-dig-shooting/) · [Animation](media/tip-and-dig-shooting/tip-and-dig-shooting-anim.html) · [PNG](media/tip-and-dig-shooting/tip-and-dig-shooting.png) · [Excalidraw](media/tip-and-dig-shooting/tip-and-dig-shooting.excalidraw) · [Edit in Excalidraw](https://excalidraw.com/#json=963ZHchOsI-Ys_CZvIBWr,mw1tUKfsvbjCyeP7MTChCA)

### [4-Lane Warm-up](drills/four-lane-warmup.md)

Full-ice warm-up. Cones split the ice into four lanes and one line starts in the corner. Skate lane 1 on inside edges, lane 2 with crossovers, then carry a puck two-handed in lane 3 and one-handed in lane 4, with a shot at the end of each.

**Tags:** `full-ice`, `skating`, `shooting`

[Note](drills/four-lane-warmup.md) · [Drill page](drills/four-lane-warmup/) · [Animation](media/four-lane-warmup/four-lane-warmup-anim.html) · [PNG](media/four-lane-warmup/four-lane-warmup.png) · [Excalidraw](media/four-lane-warmup/four-lane-warmup.excalidraw) · [Edit in Excalidraw](https://excalidraw.com/#json=6H_H1FHA3XMtYoFA_wdPI,jMK9cMTpa2-BUzVrkgGTMg)

### [Crossover Circles](drills/crossover-circles.md)

A skating warm-up on the faceoff circles. Skaters do crossovers around the circle forwards, then backwards the other way, then repeat the set with a puck.

**Tags:** `skating`

[Note](drills/crossover-circles.md) · [Drill page](drills/crossover-circles/) · [Animation](media/crossover-circles/crossover-circles-anim.html) · [PNG](media/crossover-circles/crossover-circles.png) · [Excalidraw](media/crossover-circles/crossover-circles.excalidraw)

### [Stops and Starts](drills/stops-and-starts.md)

Waves of skaters start on the goal line, sprint to the far blue line, stop hard, sprint back to the near blue line, stop, then finish at the far end-zone dots. The far net stays free for the goalies.

**Tags:** `skating`, `full-ice`

[Note](drills/stops-and-starts.md) · [Drill page](drills/stops-and-starts/) · [Animation](media/stops-and-starts/stops-and-starts-anim.html) · [PNG](media/stops-and-starts/stops-and-starts.png) · [Excalidraw](media/stops-and-starts/stops-and-starts.excalidraw)

### [Edges: Cone Weave](drills/cone-weave.md)

Three or four lanes of cones run from the blue line to the goal line. Skaters weave through their lane on deep edges, then return up the outside to their line.

**Tags:** `skating`

[Note](drills/cone-weave.md) · [Drill page](drills/cone-weave/) · [Animation](media/cone-weave/cone-weave-anim.html) · [PNG](media/cone-weave/cone-weave.png) · [Excalidraw](media/cone-weave/cone-weave.excalidraw)

### [Lateral Step-overs with Pivots](drills/lateral-step-overs.md)

Skaters move sideways down a lane with crossover step-overs, pivoting at each cone so they face the benches, then away from the benches, then the benches again.

**Tags:** `skating`

[Note](drills/lateral-step-overs.md) · [Drill page](drills/lateral-step-overs/) · [Animation](media/lateral-step-overs/lateral-step-overs-anim.html) · [PNG](media/lateral-step-overs/lateral-step-overs.png) · [Excalidraw](media/lateral-step-overs/lateral-step-overs.excalidraw)

### [Cone Relay with Pucks](drills/cone-relay-with-pucks.md)

Three or four lines race at once, each with 3 or 4 cones. At each cone the skater makes one pass to the next player in line and gets it back, alternating forwards with tight turns and backwards with pivots.

**Tags:** `skating`, `passing`

[Note](drills/cone-relay-with-pucks.md) · [Drill page](drills/cone-relay-with-pucks/) · [Animation](media/cone-relay-with-pucks/cone-relay-with-pucks-anim.html) · [PNG](media/cone-relay-with-pucks/cone-relay-with-pucks.png) · [Excalidraw](media/cone-relay-with-pucks/cone-relay-with-pucks.excalidraw)

### [2v2 Point Shot Small Area Game](drills/two-v-two-point-shot.md)

Groups of five at each corner net: 2 O, 2 D and a point player. The point dumps the puck in and the 2v2 starts. The team with the puck can use the point for shots. On a change of possession, regroup up to the point.

**Tags:** `small-area-game`, `shooting`, `defence`

[Note](drills/two-v-two-point-shot.md) · [Drill page](drills/two-v-two-point-shot/) · [Animation](media/two-v-two-point-shot/two-v-two-point-shot-anim.html) · [PNG](media/two-v-two-point-shot/two-v-two-point-shot.png) · [Excalidraw](media/two-v-two-point-shot/two-v-two-point-shot.excalidraw)

### [2v2 Hard Rim](drills/two-v-two-hard-rim.md)

Two lines of forwards with pucks at the hash marks and two D at the dots. The first forward rims the puck hard behind the net to the partner on the far wall, and it's 2 on 2. The D must touch the top of the circle before they can defend.

**Tags:** `small-area-game`, `passing`, `defence`

[Note](drills/two-v-two-hard-rim.md) · [Drill page](drills/two-v-two-hard-rim/) · [Animation](media/two-v-two-hard-rim/two-v-two-hard-rim-anim.html) · [PNG](media/two-v-two-hard-rim/two-v-two-hard-rim.png) · [Excalidraw](media/two-v-two-hard-rim/two-v-two-hard-rim.excalidraw)

### [3v3 Circle Game](drills/three-v-three-circle-game.md)

Two nets face each other inside a faceoff circle. It's 3 on 3, but only one player per team can be inside the circle. Outside players try to work a pass into their inside player, and they can shoot too.

**Tags:** `small-area-game`, `passing`, `shooting`

[Note](drills/three-v-three-circle-game.md) · [Drill page](drills/three-v-three-circle-game/) · [Animation](media/three-v-three-circle-game/three-v-three-circle-game-anim.html) · [PNG](media/three-v-three-circle-game/three-v-three-circle-game.png) · [Excalidraw](media/three-v-three-circle-game/three-v-three-circle-game.excalidraw)

### [Half-ice 3v3](drills/half-ice-3v3.md)

3 on 3 in half the ice. The O try to score. The D try to win the puck and pass it to the coach at the blue line. Then the D come off, the O flip to D, and three fresh skaters come on as O.

**Tags:** `small-area-game`, `half-ice`, `defence`

[Note](drills/half-ice-3v3.md) · [Drill page](drills/half-ice-3v3/) · [Animation](media/half-ice-3v3/half-ice-3v3-anim.html) · [PNG](media/half-ice-3v3/half-ice-3v3.png) · [Excalidraw](media/half-ice-3v3/half-ice-3v3.excalidraw)

### [Defend the Cone](drills/defend-the-cone.md)

A backup when you run out of nets: defend a cone instead. 1 on 1 around a faceoff circle with a cone on the dot. The attacker tries to touch the cone with the puck; the defender stays between the attacker and the cone.

**Tags:** `small-area-game`, `defence`

[Note](drills/defend-the-cone.md) · [Drill page](drills/defend-the-cone/) · [Animation](media/defend-the-cone/defend-the-cone-anim.html) · [PNG](media/defend-the-cone/defend-the-cone.png) · [Excalidraw](media/defend-the-cone/defend-the-cone.excalidraw)

### [1-on-1 Shooting Warm-up to 2-on-1](drills/one-on-one-shooting-to-two-on-one.md)

A full-ice shooting warm-up. Lines start in opposite corners. A player leaves one corner skating hard, gets a hard pass from the front of the far line, goes in and shoots. The passer then leaves and gets a pass from the other corner. Progression: a 2-on-1 off the same pattern.

**Tags:** `full-ice`, `passing`, `shooting`

[Note](drills/one-on-one-shooting-to-two-on-one.md) · [Drill page](drills/one-on-one-shooting-to-two-on-one/) · [Animation](media/one-on-one-shooting-to-two-on-one/one-on-one-shooting-to-two-on-one-anim.html) · [PNG](media/one-on-one-shooting-to-two-on-one/one-on-one-shooting-to-two-on-one.png) · [Excalidraw](media/one-on-one-shooting-to-two-on-one/one-on-one-shooting-to-two-on-one.excalidraw) · [Edit in Excalidraw](https://excalidraw.com/#json=2xlS1tKKB3HOahKDD5QQ-,axKcPi8lBktI4T_JRWBTXw)

### [Mirror Angling 2v1](drills/mirror-angling-2v1.md)

A half-ice station. The F carries a loop around the cones while the D mirrors around the cone at the faceoff dot, working on angling. Then a second F joins and it's a quick 2v1 on net. Both attackers drive the net; the puck carrier can pass, shoot or delay on the wall. Uses 2 D and 4-6 F.

**Tags:** `small-area-game`, `defence`

[Note](drills/mirror-angling-2v1.md) · [Drill page](drills/mirror-angling-2v1/) · [Animation](media/mirror-angling-2v1/mirror-angling-2v1-anim.html) · [PNG](media/mirror-angling-2v1/mirror-angling-2v1.png) · [Excalidraw](media/mirror-angling-2v1/mirror-angling-2v1.excalidraw) · [Edit in Excalidraw](https://excalidraw.com/#json=PNj_Sj_tq-88-kGwGPLcF,9-JRM9DgIdxbd56pxisUjw)

### [1v1 Puck Race to 2v1](drills/puck-race-1v1-to-2v1.md)

Two players start side by side and race for a puck rimmed into the corner. The winner retrieves it and starts the attack with a low-to-high pass to a high player; the loser becomes the D. Then it's a 2v1 on net.

**Tags:** `small-area-game`, `defence`, `passing`

[Note](drills/puck-race-1v1-to-2v1.md) · [Drill page](drills/puck-race-1v1-to-2v1/) · [Animation](media/puck-race-1v1-to-2v1/puck-race-1v1-to-2v1-anim.html) · [PNG](media/puck-race-1v1-to-2v1/puck-race-1v1-to-2v1.png) · [Excalidraw](media/puck-race-1v1-to-2v1/puck-race-1v1-to-2v1.excalidraw) · [Edit in Excalidraw](https://excalidraw.com/#json=KL4tW9041BEB-XQh7Xgmf,-zxqXq6WmGDGtFSI1gIOYw)

### [Rebounds: In-tight Hands](drills/rebounds-in-tight.md)

A net-front station with small nets. Two cones sit on either side of the net. Facing the net, the player banks the puck off the net, gathers it in tight and shoots. A coach or the next player in line can bank it instead. 2-3 players per net.

**Tags:** `shooting`

[Note](drills/rebounds-in-tight.md) · [Drill page](drills/rebounds-in-tight/) · [Animation](media/rebounds-in-tight/rebounds-in-tight-anim.html) · [PNG](media/rebounds-in-tight/rebounds-in-tight.png) · [Excalidraw](media/rebounds-in-tight/rebounds-in-tight.excalidraw) · [Edit in Excalidraw](https://excalidraw.com/#json=u4NG-OQpm0b38sXS58YqP,Pr1iaBNiW94fWT4ydVqC0A)

### [Goalie Rebound Game](drills/goalie-rebound-game.md)

A goalie game for rebound control. Two nets sit side by side, each with a goalie. The coach shoots on one goalie, who tries to deflect the rebound into the other goalie's net. Switch nets after 5-10 shots and keep score.

**Tags:** `small-area-game`, `shooting`

[Note](drills/goalie-rebound-game.md) · [Drill page](drills/goalie-rebound-game/) · [Animation](media/goalie-rebound-game/goalie-rebound-game-anim.html) · [PNG](media/goalie-rebound-game/goalie-rebound-game.png) · [Excalidraw](media/goalie-rebound-game/goalie-rebound-game.excalidraw) · [Edit in Excalidraw](https://excalidraw.com/#json=kNeWmKZpnBiY3kItD8jnG,jPaA7y939n9TMuOjUR1B2A)

### [Rondo Passing Progressions](drills/rondo-passing.md)

A small-area passing game. 4-5 passers around a 20x20 ft circle (a faceoff circle works) keep the puck away from 1-2 defenders in the middle. A defender who intercepts swaps with the passer. Rotate defenders every 30-60 seconds; points for 5+ passes in a row. Build it up through the progressions.

**Tags:** `passing`, `small-area-game`

[Note](drills/rondo-passing.md) · [Drill page](drills/rondo-passing/) · [Animation](media/rondo-passing/rondo-passing-anim.html) · [PNG](media/rondo-passing/rondo-passing.png) · [Excalidraw](media/rondo-passing/rondo-passing.excalidraw) · [Edit in Excalidraw](https://excalidraw.com/#json=1iQYrQZ1I5S0RjrQhcTch,13-N7oyKVGGFOjJQSDirxg)

### [Zone Entries: Delay](drills/zone-entry-delay.md)

Two delay variations of the zone entry. Delay: carry in wide, stop and curl back up the wall to buy time, then attack the net. Delay, low-to-slot (dynamic): carry in and delay, then hit a catcher streaking to the net for a catch-and-shoot from the slot. The other two variations in this progression match Low-to-High: Give-and-Go and Low-to-High: D-to-D. Can also be run in the neutral zone or on small ice.

**Tags:** `zone-entry`, `half-ice`, `passing`, `shooting`

[Note](drills/zone-entry-delay.md) · [Drill page](drills/zone-entry-delay/) · [Animation](media/zone-entry-delay/zone-entry-delay-anim.html) · [PNG](media/zone-entry-delay/zone-entry-delay.png) · [Excalidraw](media/zone-entry-delay/zone-entry-delay.excalidraw) · [Edit in Excalidraw](https://excalidraw.com/#json=TJzl0IijD_CzkKYm4eW1D,6A0X16BgbiGJhEK0to_aoQ)


## Add a drill

See [ADDING-A-DRILL.md](ADDING-A-DRILL.md). Media lives in `media/<slug>/`. The registry is [`drills.json`](drills.json). Running `python3 scripts/build_site.py` rewrites the home page, the drill pages, the practice plan, and this README from [`scripts/readme_template.md`](scripts/readme_template.md).
