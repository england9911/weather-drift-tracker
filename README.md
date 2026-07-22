# Evercreech Forecast Drift Tracker

A small personal project to answer one question: **does BBC Weather quietly
revise its forecast temperatures upward as the date gets closer, and rarely
down?**

BBC Weather (like every forecast site) only ever shows you its *current*
prediction — there's no way to see how a forecast for a given day changed over
the two weeks leading up to it. This project closes that gap by polling BBC's
forecast every hour, keeping every distinct revision it makes for each
calendar date, and then checking the outcome against the real observed
temperature once the date has passed.

Live dashboard: **https://weather-drift-tracker.m-p-england.workers.dev**

## How it works

A single Cloudflare Worker does everything, on two schedules:

- **Every hour** — fetches BBC's forecast for
  [Evercreech](https://www.bbc.co.uk/weather/2649842) (an undocumented but
  public JSON endpoint, not an official API) and stores a new snapshot for
  each date *only if* the prediction actually changed since the last
  snapshot for that date (issue date, predicted high, or predicted low).
  This means the data is a record of real revisions, not just repeated polls.
  Hourly was chosen after observing BBC re-issue this forecast at intervals
  as short as ~30 minutes during the day (and BBC's own "Observations" panel
  updates on the hour too) — a slower cadence risked silently missing
  revisions.
- **Once a day** — for any date that's now in the past, fetches the real
  observed high/low from [Open-Meteo](https://open-meteo.com) (a free,
  no-key weather API) and stores it as ground truth.

Everything lands in a Cloudflare D1 (SQLite) database. A small `/api/data`
endpoint serves the joined data, and a static dashboard (vanilla HTML/SVG/JS,
no framework) renders four views:

- A **date-range picker** (next 14 days / last 14 / last 30 / all time /
  custom) sits above the first two views below and scopes both of them —
  so you're not limited to "next 14 days," you can look at any past period
  too. "Warm bias by lead time" deliberately ignores this picker and always
  aggregates every resolved date, since that's a different question.
- **Forecast outlook: current, first-seen & most extreme forecast** — every
  date in the selected period in one chart, three drawn reference points per
  temperature series: today's forecast (solid), the first-ever prediction
  for that date (dashed), and the most extreme prediction BBC has *ever*
  given in the "expected" direction — hottest high, coldest low, regardless
  of when (dotted). The shaded band spans the **full** range ever predicted
  in both directions, so a dip in the high (or a spike in the low) that
  later reverted stays visible even though it has no line of its own — hover
  a date, or use table view, for that opposite extreme's exact value. This
  is a **summary** view — a handful of sampled points, not the full story.
- **Shape of each day's revisions** — a compact table, one row per date in
  the selected period, each with a small sparkline of *every* snapshot
  recorded for that date. This exists because the summary chart above can't
  distinguish a steady creep from a dip-then-recovery — both can share the
  same first/extreme/current numbers but look completely different as a
  shape. Click a row to jump straight to that date in the chart below.
- **Revision history for a date** — every snapshot BBC gave for a chosen
  date, in order, so you can see it change (or not) as the date approached.
  This is the full-detail view behind both of the above. Once a date has
  an actual, its observed high/low are drawn as faint full-width reference
  lines (not just an endpoint marker), so the gap between prediction and
  outcome is visible at every point along the line, not only at the end.
- **Warm bias by lead time** — averaged across every date with a known
  actual, `predicted − actual` at each lead time (6 days out, 5 days out,
  ... day of). This is the chart that actually tests the hypothesis.

## Project layout

```
src/
  bbc.ts        fetch + parse the BBC forecast endpoint
  poller.ts     hourly cron: dedupe + store new revisions
  actuals.ts    daily cron: backfill real observed temps from Open-Meteo
  api.ts        GET /api/data
  index.ts      Worker entry point (fetch + scheduled handlers)
public/
  index.html    dashboard markup + styles
  app.js        chart rendering (hand-rolled SVG, no charting library)
migrations/
  0001_init.sql D1 schema
```

## Data notes

- BBC's forecast endpoint is unofficial and undocumented — it could change
  or disappear at any time. There's no SLA.
- "BBC's actual for the day" in the dashboard means BBC's own last forecast
  snapshot before the date passed (still a forecast, just their final one) —
  BBC doesn't publish a true retrospective daily high/low. The one genuinely
  independent ground truth is the Open-Meteo observed value.
- It takes a couple of weeks of the poller running before the "warm bias by
  lead time" chart has enough data to say anything meaningful — there's no
  shortcut to accumulating history.
- **Retention: indefinite.** Nothing ever deletes or expires rows — the goal
  is at least a year of history to see whether the bias holds up across
  seasons. At this poll rate (dedup'd revisions only) that's a few thousand
  rows a year, well within D1's free tier, so there's no pruning job and no
  plan to add one.
- **Mobile**: all tables scroll horizontally inside their own container
  (never the page), and chart tooltips respond to tap (`pointerdown`) as
  well as hover, with a tap outside a chart dismissing its tooltip.

## Local development

```bash
npm install
npm run dev        # wrangler dev --test-scheduled, http://localhost:8787
npm run typecheck
```

Trigger a cron handler manually against the local dev server:

```bash
curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"     # forecast poll
curl "http://localhost:8787/__scheduled?cron=0+6+*+*+*"     # actuals backfill
```

## Deploy

```bash
npm run deploy
```

Requires a Cloudflare account with a D1 database created (see
`wrangler.jsonc` for the binding) and migrations applied with
`wrangler d1 migrations apply weather-drift-tracker-db --remote`.
