# Tennis Legends — The Eternal Tour

Your own tennis world. No ageing, no seasons, no clock — just the all-time greats you rate yourself, the tournaments you decide to hold, and records that build for as long as you keep playing.

Everything runs in the browser from static files. No frameworks, no build step, no backend.

## Getting it onto GitHub Pages

1. Create a new repository on GitHub (e.g. `tennis-legends`).
2. Upload everything in this folder — `index.html`, the `css/` and `js/` folders. (The `tools/` folder is optional; it's only for testing on a computer.)
3. In the repo: **Settings → Pages → Source: Deploy from a branch → main → / (root) → Save**.
4. Open `https://<your-username>.github.io/tennis-legends/` on your phone. Add it to your home screen and it behaves like an app.

## First steps

1. **Players tab → Add player.** Set the Overall, the three surface ratings, and as many of the 37 attributes as you care to — anything left blank takes the Overall value.
2. Or **Import JSON** to add players in bulk (format below).
3. **Tour tab → New tournament.** Name it, pick the surface, draw size (4–128), best of 3 or 5, and the champion's points (2000 for a major, 250 for a small one — the presets are there).
4. **Start tournament**, then play every match yourself with the **Play match** button, round by round, all the way to the final.
5. Crown the champion and the points, titles, rankings, Elo, head-to-heads and streaks all update.

## Player JSON format

Single object or an array. Only `name` and `overall` are required — missing attributes default to the Overall, missing surfaces default to 80.

```json
{
  "name": "Prime Novak Djokovic",
  "country": "SRB",
  "overall": 98,
  "surfaces": { "hard": 99, "clay": 95, "grass": 97 },
  "attrs": {
    "forehand": 95, "backhand": 99, "serve": 92, "firstServe": 94,
    "returnServe": 99, "volley": 88, "smash": 94, "slice": 92,
    "passing": 99, "consistency": 99, "power": 92, "depth": 98,
    "angle": 95, "defense": 99, "coverage": 99, "footwork": 99,
    "speed": 97, "acceleration": 96, "agility": 99, "balance": 99,
    "flexibility": 99, "endurance": 99, "recovery": 99, "mental": 99,
    "composure": 99, "concentration": 98, "spirit": 99, "tactical": 99,
    "adaptability": 99, "shotSelection": 99, "anticipation": 99,
    "bigPoint": 99, "tiebreak": 99, "clutchServe": 98, "clutchReturn": 95,
    "tournamentConsistency": 99, "injuryResistance": 94
  }
}
```

## How the tour works

**Entries mimic real life.** The top of the rankings enters directly. Everyone outside the cut fights through qualifying — simulated instantly in the background, so the qualifiers change every edition and carry a **Q** tag in the draw. A few wildcards (**WC**) are drawn at random, weighted towards better players. Seeds are placed like a real draw: 1 and 2 in opposite halves, the 3–4, 5–8, 9–16 and 17–32 bands shuffled within their slots.

**Surfaces genuinely matter.** Each player has a hard, clay and grass rating, and every point is fought on the tournament's surface. As a worked example, with Nadal rated clay 99 / hard 92 / grass 84 against a grass-courter Haas rated clay 79 / hard 90 / grass 93, twenty thousand simulated best-of-five matches per surface came out:

| Surface | Nadal wins |
|---|---|
| Clay | 96.5% |
| Hard | 88.0% |
| Grass | 77.9% |

Grass also plays quicker (serves and aces count for more, shorter matches); clay slower and longer.

**Nothing is ever impossible.** Every point has a floor — even the most hopeless mismatch on the wrong surface wins the occasional match (measured at roughly 1 in 100,000 for a 74-rated journeyman against a peak 98 on his best surface). Upsets are flagged on the scoreboard when they happen.

**Rankings** work like the tour's rolling 12 months, but measured in tournaments: points from your last 20 events count (change the window under **More**, or set 0 for all-time). Every round pays a share of the champion's points — final 60%, semis 36%, quarters 18% and so on down to first-round losers.

**Elo** runs alongside: everyone starts at 1500, bigger events swing it harder, and peak Elo is recorded forever.

**Records** keep themselves: titles (overall, per event, and at 1500+ point "majors"), finals, win percentages, streaks, tie-break and deciding-set records, wins over the top 10, weeks — well, *tournaments* — at No.1, every head-to-head, and a champions wall of every edition ever played.

## Match engine, briefly

Every match is played point by point. Serve and return quality set the baseline; groundstrokes, movement, physicality and consistency shape each rally; momentum shifts with breaks; fatigue builds in long matches (endurance and recovery push back); the mentality attributes — big points, tie-breaks, clutch serving and returning, composure — decide the moments that matter; deciding sets lean harder on fatigue and nerve; and low injury resistance occasionally costs a player mid-match. Two equal players are a coin flip; the calibration anchors, measured over 20,000 best-of-five matches on a neutral surface:

| Match-up | Measured |
|---|---|
| 98 Djokovic v 91 Kafelnikov | 85.2% |
| 98 Nadal v 90 Haas | 86.3% |
| 98 Djokovic v 98 Nadal | 50.8% |
| 98 v flat 74 | 99.9% |
| flat 88 v flat 84 | 70.8% |

Best-of-3 tightens everything up (the favourite drops ~4–6 points of win probability), so smaller events produce more shocks — exactly as they should.

## Back up your world

The whole simulation lives in this browser's storage. It autosaves after every action (with a rolling backup copy), **but browser storage can be wiped** — by clearing site data, or by iOS/Android reclaiming space from sites you haven't visited in a while.

**More tab → Export backup** downloads a single JSON file that *is* your entire world. Export regularly — after every big tournament is a good habit. **Import backup** restores it on any device.

## For tinkerers

- `tools/calibrate.mjs` — re-measure the engine (`node tools/calibrate.mjs`, add `--surfaces` for the per-surface split).
- `tools/smoketest.mjs` / `tools/uitest.mjs` — logic and headless UI test suites.
- Engine constants live at the top of `js/engine.js` if you ever want a faster grass or crueller fatigue.

Built for the long haul. Enjoy the eternal tour. 🎾
