# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Jaka1603/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Jaka1603/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

LaunchScope is a token launch radar. It reads the sealed DefiLlama snapshot of every protocol and ranks the ones that record no token yet by what their launch would be worth, each with a concrete farm plan. The board covers the whole 40-protocol watchlist and adds every earlier pre-token protocol the same rule keeps — 198 rows on this snapshot — while the 416 protocols whose token already trades are set aside and shown with the market's own values.

No multiple on the board was picked by hand. The model calibrates itself from the snapshot: the live tokens' market-cap-to-TVL ratios give a market median (×0.246 from 119 witnesses on this snapshot) and one median per category, each shrunk toward the market median by its sample size. A row's implied value is its TVL times its category's multiple, adjusted for seven-day growth (clamped, weight 0.45), for maturity (how long the protocol has run with no token, saturating near two years), and for breadth across chains. Every factor is rounded before it multiplies, and the dashboard recomputes each row from the same figures — the page and board.json agree to the dollar on all 198 rows. Farm plans are derived per protocol from its category, first chain, TVL and age: a primary position, a second qualifying action, a weekly cadence, a hold window, an announcement watch and an exit, each with what it costs and how long it takes.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to>/snapshot.json
# Writes out/board.json, out/data.js, out/dashboard/, out/screenshots/ and out/dossier.json.
# In the grader's container the snapshot is at /input and the output at /output:
#   node main.ts
```

## Screenshots

The three screenshots are taken from the generated dashboard at a 1440×900 viewport, each kept between 300 and 350 KB so the dossier stays within its cap:

1. `screenshots/1-board.png` — open `out/dashboard/index.html` (the board).
2. `screenshots/2-detail.png` — open `out/dashboard/index.html#p=steakhouse-financial` (the top row's detail view; any row's slug works).
3. `screenshots/3-filtered.png` — open `out/dashboard/index.html#segment=watchlist` (the watchlist-only filter).

After replacing the images in `screenshots/`, run the program once more so `dossier.json` is rebuilt from them.

---

<sub>Entered on [make.fun](https://make.fun/?ref=md16tqa0&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
