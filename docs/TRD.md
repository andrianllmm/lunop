# TRD: LUNOP

> Technical design for [PRD.md](PRD.md). Status: revised, 2026-10-24.

## 1. Architecture

```
Offline / daily (Python)                       Vercel (Next.js)                       Neon (Postgres)
────────────────────────                       ────────────────                       ───────────────
make data train (laptop): CCHAIN → fit → model.json
make replay / evaluate → replay/*.json,        pages read static JSON
                         performance.json  ──► from web/public/data/
GitHub Action, 06:00 PHT daily:
  Open-Meteo rain → GLM → forecast.json    ──► commit → Vercel redeploys
                                               /api/reports (route handler)  ◄──►  flood_reports
                                               priority, recommendations,
                                               chronic spots (TypeScript)
                                                        ▲
Browser (PWA)                                           │
─────────────                                           │
service worker cache: app shell, JSON, tiles ───────────┘
IndexedDB outbox: reports filed offline ──► POST on reconnect
decision engine runs on cached data when offline
```

**Principles**
- **Python never runs at request time.** The forecast changes only when the rain does, once a day, so a scheduled job computes it and writes a file. Evaluating the GLM is a few multiplications.
- **One deploy, one table.** Next.js on Vercel serves the pages and the only write path (community reports). The database stores reports and nothing else.
- **One decision engine, two modes.** Priority, recommendations and chronic spots are small TypeScript functions. Live mode feeds them today's forecast plus database reports; replay feeds them a past event's forecast plus its simulated reports.
- **Degrades gracefully.** If the daily job fails, the last committed `forecast.json` keeps serving with its date. Replay needs no network at all.
- **Offline after first visit.** Everything the app shows is static files plus one reports endpoint, so a service worker can cache it all. The decision engine is pure TypeScript and runs in the browser on cached data (§10.1).

## 2. Stack

| Layer | Choice |
|---|---|
| Offline model | Python 3.11, pandas, statsmodels, geopandas, managed with `uv` |
| Web | Next.js (App Router), TypeScript, MapLibre GL via [mapcn](https://mapcn.dev) (MIT, shadcn registry), Recharts, Tailwind + shadcn/ui |
| DB | Neon Postgres via the Vercel integration; `@neondatabase/serverless` with plain SQL |
| Geometry in TS | `@turf/boolean-point-in-polygon` (GPS → barangay) |
| PWA | Serwist (`@serwist/next`) service worker; `app/manifest.ts` |
| Offline storage | IndexedDB via `idb-keyval` (report outbox) |
| Daily job | GitHub Actions cron |
| Deploy | Vercel (project root `web/`) |
| Basemap | OpenFreeMap `positron` (light) and `dark`: no API key, no usage limits. Not mapcn's default CARTO tiles, which have usage terms |

## 3. Repository layout

```
pjdsc-26/
├── docs/                    PRD.md, TRD.md, FINDINGS.md, DATA.md
├── eda/                     EDA notebooks (Jupytext .py + .ipynb), reports/ HTML; own uv project
├── pipeline/                uv project (Cookiecutter Data Science layout)
│   ├── lunop/               package, one module per stage
│   │   ├── config.py        paths and constants
│   │   ├── dataset.py       download CCHAIN from HDX; build processed tables and barangays.geojson
│   │   ├── features.py      design matrices per horizon and variant
│   │   ├── rain_check.py    CCHAIN vs Open-Meteo archive (§5.5)
│   │   ├── modeling/
│   │   │   ├── train.py     fit the deployed variants → models/model.json
│   │   │   ├── forecast.py  intervals, baseline ratios, alert levels
│   │   │   ├── evaluate.py  back-test, event study, LOEO, Zamboanga check → performance.json
│   │   │   └── predict.py   daily: Open-Meteo → forecast.json
│   │   └── replay.py        per-event bundles → replay/*.json
│   ├── tests/               pytest
│   ├── models/              model.json, thresholds.json, rain_scale.json (committed; the daily job reads them)
│   ├── reports/             backtest.md, figures
│   └── pyproject.toml
├── web/
│   ├── app/                 (dashboard)/{dashboard, replay, priority, methods}, (public)/{page, report}
│   ├── app/api/reports/     route.ts (GET, POST)
│   ├── app/                 manifest.ts, sw.ts (service worker), ~offline/ fallback page
│   ├── lib/                 priority.ts, recommend.ts, spots.ts, db.ts,
│   │                        locate.ts (GPS → barangay), outbox.ts (offline reports)
│   └── public/data/         forecast.json, barangays.geojson, performance.json,
│                            config.json, replay/*.json   (all committed)
├── data/                    raw/, interim/, processed/, external/ (gitignored; shared by eda/ and pipeline/)
├── .github/workflows/       forecast.yml
└── Makefile                 setup, data, train, evaluate, replay, live, web, test, all
```

A monorepo: `pipeline/` (Python) and `web/` (Next.js) are separate projects. `pipeline/` follows [Cookiecutter Data Science](https://cookiecutter-data-science.drivendata.org/): one importable package with a module per stage, plus `models/` and `reports/`. `data/` stays at the root because `eda/` uses it too. `eda/` plays the role of `notebooks/`; new notebooks import from `lunop` instead of copying loaders. The root `Makefile` drives both projects.

**Data stages:** `raw/` is CCHAIN as downloaded and never edited; `interim/` holds caches (city daily rain); `processed/` holds model-ready tables (`panel.parquet`, `events.parquet`, `zamboanga_brgy.parquet`); `external/` holds non-CCHAIN pulls (Open-Meteo archive).

## 4. Data

| Data | Source | Granularity | Use |
|---|---|---|---|
| Leptospirosis cases | CCHAIN `disease_pidsr_totals` | City × week, 12 cities, 2008–2022 | Training, back-test, replay |
| Barangay cases | CCHAIN `disease_lgu_disaggregated_totals` | Barangay × week (only Zamboanga usable, 2013–2022) | Ranking check only |
| Rain (history) | CCHAIN `climate_atmosphere.pr` | Barangay × day, 2003–2022 | Training, replay |
| Rain (live) | Open-Meteo forecast + archive APIs | Point × day | Live forecast |
| Flood hazard | CCHAIN `project_noah_hazards` | Barangay; 100-yr low/med/high % area | Exposure |
| Population | CCHAIN `worldpop_population` | Barangay × year, to 2020 (later years reuse 2020) | Exposure, doses |
| Boundaries | CCHAIN `brgy_geography` | Barangay polygons | Map, GPS lookup |
| Hospital access | CCHAIN `geoportal_doh_poi_health`, `mapbox_health_facility_brgy_isochrones` | Barangay | Access column and flag |
| Infrastructure context | CCHAIN `osm_poi_water_body`, `google_open_buildings` | Barangay | Chronic-spot context (not scored) |
| Flood reports | `POST /api/reports` | Point × time | Exposure, corroboration, chronic spots |

Iloilo City is PSGC `PH063022000`, with 180 barangays.

**Calendar:** PIDSR weeks start Monday and use 52-week years, so the weeks of 2012-12-31 and 2018-01-01 are missing. `pipeline/lunop/dataset.py` reindexes each city to the full weekly calendar so a row shift is always a one-week lag. EDA and data checks: [FINDINGS.md](FINDINGS.md). Column definitions for every output: [DATA.md](DATA.md).

**Build** (`make data` = `python -m lunop.dataset download verify build`):
- `verify` checks every raw CSV against `pipeline/raw.sha256`, so a rebuild uses the same HDX snapshot. Rebuilds are byte-identical.
- `build` checks each table's assumptions (unique keys, Monday weeks, no negative counts or rain, codes found in `location`) and stops with `DataError` if one fails.
- Rain: barangay-day → city-day mean (cached in `interim/`) → Monday-week sum; a week with fewer than 7 days is NaN. One Zamboanga barangay has no rain and is skipped.
- `panel.parquet` runs from 2003-01-06 so lags exist at 2008. `level_c` uses only weeks ≤ t. `rain_clim` uses 2003–2017 only, so it never sees validation years.
- `events.parquet`: each city's top-2% rain weeks, 2008–2022 (16 for Iloilo), with `window_start/end` at −2/+8 weeks.

**Static outputs** (committed to `web/public/data/`):
- `barangays.geojson`: simplified polygons (~1e-4°, 5 decimals) with `psgc, name, area_km2, pop` (WorldPop 2020), `hazard_pct` (NOAH 100-yr low + med + high), `access30_pct` (pop % within 30 min of a hospital), `travel_min` (first isochrone of 5/15/30 min reaching half the pop; null if > 30), `hospital_dist_m`, `water_dist_m` (nearest river, stream, canal or drain), `bldg_density` (per km²). CCHAIN caps distances at 10 km.
- `config.json`: every weight and assumption used by the TypeScript functions, so the UI can display them.

## 5. Forecast model

### 5.1 Specification

A **negative binomial GLM** fitted on all 12 cities together. It was chosen over tree ensembles because the data is small, mostly zeros and has rare large outbreaks. In our earlier dengue work, random forest and XGBoost did no better than repeating last week. A GLM also gives an explainable lag curve that can be compared with the literature.

```
cases[c, t+h] ~ NegBin(μ, α)
log μ = city_c + s(woy_{t+h}) + Σ_{k=0..8} β_k · log1p(rain[c, t+h−k]) + γ · log1p(recent_cases[c, t]) + level_c
```

- `s(woy)`: 2 sine/cosine harmonic pairs of week of year.
- Rain lags after week t use Open-Meteo forecast rain (up to 16 days), then the seasonal mean rain for that week.
- `level_c`: mean log cases over the city's past 52 weeks, to absorb long-term trends.
- `recent_cases[c, t]`: mean cases over weeks t−1..t, so a skipped PIDSR week doesn't drop the row.
- One model per horizon h ∈ {1, 2, 3, 4}. α is fitted by profile likelihood over IRLS fits (`statsmodels` `NegativeBinomial`'s joint Newton fit diverged).
- **Variants**, fitted in the same loop (`features.VARIANTS`):
  - `with_cases` includes γ and `level_c`. It is used for replay and the back-test.
  - `rain_only` drops both, since they need recent cases. It is used live, where there are no current case counts.
  - `seasonal` (city + woy) is the baseline that `ratio` is taken against. `cases` (seasonal + γ + `level_c`) is a back-test baseline only.
- **Training window: 2013 onward** (`TRAIN_START_YEAR`). Fit on 2013–2017, validate on 2018–2022, refit on 2013–2022 for deployment. Fitted from 2008, the 2011–12 outbreaks push Iloilo's level to about twice the 2018–2022 level (5.9 vs 2.7 cases/week): `rain_only` then does worse than seasonal, and `with_cases` loses 6–16% on Iloilo deviance. This choice was made after seeing the 2018–2022 results, so the back-test is mildly optimistic; the 2008 fits stay in `reports/backtest.md` as ablations. 2008–2012 events are still forecast in LOEO, out of sample.
- Back-test stand-in for forecast rain: observed rain for weeks t+1..t+2 (the 16-day window), `rain_clim` after. The same rule builds the training features, so coefficients match what the live model sees.
- **Result** (Iloilo, 2018–2022, Poisson deviance at h = 1/2/3/4): seasonal 3.18; seasonal + recent cases 2.01/2.44/2.80/2.91; `with_cases` 1.72/2.05/2.35/2.42 (−15/−16/−16/−17%). `rain_only` 2.82/2.82/2.81/2.80 vs seasonal (−11%), and −7 to −8% when fed Open-Meteo rain. The EDA's h = 3 loss is gone. An Iloilo × rain slope doesn't help (h = 3–4 slightly worse), so it isn't used.
- The rain lag curve peaks at lag 3 (rate ratio per log unit of rain), matching the EDA.

**Dropped, with reasons recorded on the Methods page:**
- River discharge (GloFAS) added about 1% on top of rain, so it was dropped.
- The DLNM upgrade is extra complexity for a lag curve the linear version already captures.
- Gradient boosting runs as a benchmark in `modeling/evaluate.py` only if time allows.

### 5.2 Outputs (`forecast.json`)

```json
{ "issued": "2026-10-22", "data_as_of": "2026-10-21", "variant": "rain_only",
  "level": "High", "rain_peak_date": "2026-10-19",
  "weeks": [{ "week_start": "...", "expected": 0, "lo": 0, "hi": 0, "baseline": 0, "ratio": 0 }],
  "drivers": ["Rain in the week of Oct 13 was 3.1× normal"] }
```

`lo` and `hi` are the 10th and 90th percentiles of the predictive distribution. `baseline` is the `seasonal` model's mean for that week. `ratio = expected / baseline`.

### 5.3 Alert levels

Applied to the maximum `ratio` over weeks +1 to +4. Thresholds are tuned per variant on the 2018–2022 Iloilo back-test so each level or higher fires in 15% (Elevated), 5% (High) and 1% (Severe) of weeks. They are stored in `pipeline/models/thresholds.json`.

| Level | `rain_only` (live) | `with_cases` (replay) |
|---|---|---|
| Elevated | ratio ≥ 1.69 | ratio ≥ 1.69 |
| High | ratio ≥ 1.94 | ratio ≥ 2.6 |
| Severe | ratio ≥ 2.14, or P(cases ≥ city p95) ≥ 0.5 | ratio ≥ 3.7, or P(cases ≥ city p95) ≥ 0.5 |

`rain_only` ratios span a narrow range, because rain alone moves the forecast less than recent cases do, so its levels sit close together. City p95 is computed over 2013–2022 (Iloilo: 9 cases/week).

### 5.4 Evaluation (`modeling/evaluate.py` → `performance.json`, `reports/backtest.md`)

**Headline (event-conditional, Iloilo)**
- **Leave-one-event-out (LOEO)** over the 16 Iloilo top-2% rain events: refit without each event's window (−2 to +8 weeks), then forecast it.
- Peak-timing error (weeks) per event.
- Error in weeks +1 to +6 after each event, against (a) seasonal only and (b) seasonal + recent cases.
- Alert hit rate and false-alarm rate.

**Secondary**
- All-weeks Poisson deviance and MAE on 2018–2022, per horizon, for all cities and for Iloilo, reporting the Iloilo h = 3 loss openly. EDA baseline: ~9–11% gain across cities; Iloilo +9%, +4%, −10% at h = 1–3.
- Ablations: without rain (`cases`); training from 2008, with and without the Sendong-era weeks (CDO, Iloilo 2011–12); an Iloilo-specific rain slope; `rain_only` fed Open-Meteo rain.
- Event-study curve: cases ÷ seasonal norm at weeks −2 to +6 after heavy rain.

**Barangay check:** score Zamboanga barangays with hazard × population and report the Spearman ρ against the observed case rate, with a bootstrap 95% CI, and the partial ρ controlling for population (population alone tracks the rate).

The LOEO results choose the three replay events: two hits and one miss or false alarm, from different storms. Picked: 2011-08-15 (hit), 2012-05-28 (hit), 2009-07-27 (miss).

**Results** (`reports/backtest.md`):
- LOEO, 16 Iloilo events: mean absolute peak-timing error 1.3 weeks. Weeks +1..+6 MAE, mean over events at h = 1/2: `with_cases` 13.4/12.1 vs seasonal 15.3 and seasonal + recent cases 24.7/15.7. The 2011 outbreak dominates the mean; by **median**, seasonal (3.5) beats `with_cases` (4.0–4.4) on typical events.
- Alerts at the event week, `with_cases`: High or Severe on 6 of 7 surges (observed ≥ 1.5× baseline over weeks +1..+4), with 1 false alarm among 7 alerts. `rain_only`: 1 of 8.
- Weekly, Iloilo 2018–2022: `with_cases` High+ catches 19% of surge weeks, and 23% of its High+ alerts are false. `rain_only` High+ catches 2%.
- Event study: cases reach 3.3× the seasonal norm 2–3 weeks after heavy rain (all cities and Iloilo).
- Zamboanga: ρ = 0.52 (95% CI 0.37–0.66) for `hazard_pct` (100-yr, any level), 0.37 (0.19–0.54) net of population; population alone 0.47; hazard × population 0.57. The old 25-yr medium + high layer: 0.23, but 0.05 net of population.

### 5.5 Rain source check (`pipeline/lunop/rain_check.py`)

The model is trained on CCHAIN rain and run live on Open-Meteo rain, so we check before building any calibration:
- Compare weekly Iloilo rain sums, CCHAIN vs Open-Meteo archive at the same points, 2008–2022.
- If **r ≥ 0.9 and the ratio of means is in 0.9–1.1**, use Open-Meteo as is.
- Otherwise store **one scale factor** (ratio of means) in `pipeline/models/model.json` and apply it to live rain.
- The scatter plot and the result are shown on the Methods page.
- **Result:** r = 0.71, ratio of means 1.09, so live rain is scaled by 1.092. Open-Meteo's ERA5 gives the same r (0.73), so CCHAIN's rain is probably not ERA5; its daily pattern (dry days with isolated events) looks like satellite rain. A scale factor can't fix the weak correlation, so the back-test also runs `rain_only` on Open-Meteo rain for Iloilo: it keeps a 7–8% gain over seasonal (vs 11% on CCHAIN rain).
- Points: a 3 × 3 grid over Iloilo's bounding box, averaged. The archive pull is cached in `data/external/`.

### 5.6 Known limitations

- **PIDSR week meaning** (symptom onset vs report) is unknown, which affects how the lag is read.
- **Live alerts are weak.** Without recent cases, `rain_only` beats seasonal on average but rarely flags surges (2% of surge weeks at High+). Most outbreak signal comes from recent cases, which live mode doesn't have. The UI should present the live level as "rain risk", not as an outbreak detector.
- **Overshoot at outbreak peaks:** γ is above 1 at h = 1 (cases forecast to grow faster than they are), so during the 2011 outbreak `with_cases` forecast 241 for a week that had 113.
- **Typical events:** by median LOEO error, seasonal beats `with_cases`; the gains come from big events.
- **Barangay check is one city:** Zamboanga only, and the 100-yr layer was picked from about 12 variants on the same data, so ρ = 0.37 net of population is somewhat optimistic.
- **Non-stationarity:** cases dropped after 2012 (possibly Iloilo's flood control works, to be verified). Training from 2013 handles it for now; an Iloilo post-2012 indicator is moot once 2008–2012 are excluded.
- **Rain source mismatch:** r = 0.71 between CCHAIN and Open-Meteo (§5.5).
- **Data ends in 2022;** live mode runs without current cases.

## 6. Decision engine (TypeScript, `web/lib/`)

All weights live in `config.json` and are shown in the UI as assumptions.

### 6.1 Priority (`priority.ts`)

```
H_b = pct_area_flood_100yr_low + _med + _high, capped at 100     (0–100)
R_b = min(1, Σ_{reports, observed_at in last 7 days} w_depth · w_wade / 10)
      w_depth: ankle 0.25, knee 0.5, waist 1.0, chest+ 1.5;  w_wade: 1.5 if waded else 1.0
W_b = (H_b / 100 + 0.5 · R_b) · pop_b
rank by W_b; priority shown as a 0–100 percentile
excess_b = city excess cases (Σ_weeks expected − baseline) · W_b / Σ W
```

There is no poverty term, because its association flips sign between cities.

**Access flag:** set when `priority` is in the top 25% and `access30_pct` < 50%.

### 6.2 Doses (planning range)

```
exposed_b = pop_b · D_b/100 · f_contact,   f_contact ∈ [0.1, 0.3]
D_b       = pct_area_flood_100yr_high (deep water; H_b would put 42% of the city in a flood area)
doses_b   = exposed_b · courses_per_person (default 1)     → shown as a range
```

Dosing rules (adult vs child, exclusions) appear as text from DOH guidance, not as computed advice.

### 6.3 Corroboration and countdown

A barangay's 72-hour prophylaxis countdown starts when either holds:
- ≥3 reports at knee depth or deeper from distinct `ip_hash` values within 24 h of `observed_at`, or
- ≥1 such report while the city alert is Elevated or higher.

A single report only raises R_b. The countdown runs from the first qualifying report's `observed_at`. Reports still queued on a device don't count until they reach the server.

### 6.4 Recommendations (`recommend.ts`)

Inputs: alert level, days since rain peak `d`, priority list, access flags, forecast peak week, chronic spots.

| Trigger | Action | Fields |
|---|---|---|
| level ≥ Elevated and d ≤ 3, or barangay countdown active | Prophylaxis to the top N (Elevated 5, High 10, Severe 20) plus counted-down barangays | barangays, dose range, deadline |
| same | Avoid-wading / seek-care advisory | barangays, message (EN/FIL) |
| level ≥ High and 3 < d ≤ 10 | Active case finding | top barangays, dates; access-flagged ones first |
| level ≥ Elevated | Hospital readiness | peak week, expected cases (80% interval), stock checklist |
| forecast rain only (storm not yet arrived) | Pre-position stock | peak window, stock range |
| d > 10 and chronic spots exist | Drain clearing and rodent control | spots |

Each rule returns `{id, action, target, quantity, deadline, rationale, source}`.

- Top N counts only barangays with W_b > 0.
- Deadlines are PHT midnights: prophylaxis at rain peak + 72 h (or the countdown's own deadline), case finding through day 10, pre-positioning by the rain peak, hospital readiness by the start of the peak week.

### 6.5 Chronic flood spots (`spots.ts`)

- Group knee-or-deeper reports into ~150 m cells (geohash precision 7).
- A cell is a **chronic spot** if it has reports on **≥3 distinct `observed_at` dates** in the past 12 months.
- Each spot carries its barangay's `water_dist_m`, `bldg_density` and `hazard_pct` as context. These are not scored.
- Until real reports accumulate, the list is seeded from barangays with `hazard_pct` ≥ 90 (15 barangays) and the replay's simulated reports, both labelled.

## 7. API

Pages render a server shell, and client components load data from `/data/*.json` and `GET /api/reports`, then run the decision engine in the browser. The same code path works online and from the service worker cache offline. Reports refetch every 60 s while online, so new reports appear within a minute. The only route handlers are:

| Method | Path | Description |
|---|---|---|
| POST | `/api/reports` | `{client_id, observed_at, lat?, lon?, psgc?, depth, duration_h, waded, website}` → `{id, psgc}`. `client_id` is a UUID made on the device, so a resent report is a no-op (`on conflict do nothing`, returns the existing row). `observed_at` is rejected if in the future or older than 7 days. `website` is the honeypot: if filled, return 200 and drop the report. GPS is converted to psgc on the device and re-checked server-side. Returns 429 after 5 reports per `ip_hash` per hour |
| GET | `/api/reports?since=` | GeoJSON points (no `ip_hash`) |

## 8. Database

```sql
create table flood_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique,
  created_at timestamptz not null default now(),
  observed_at timestamptz not null,
  lat double precision, lon double precision,
  psgc text not null,
  depth text not null check (depth in ('ankle','knee','waist','chest')),
  duration_h real, waded boolean not null,
  ip_hash text not null
);
create index on flood_reports (observed_at);
create index on flood_reports (psgc, observed_at);
```

`observed_at` is when the person saw the flood; `created_at` is when the server received it. They differ for reports queued offline, so all scoring windows use `observed_at`. `ip_hash = sha256(IP_SALT || ip)`. Simulated replay reports live in `replay/*.json`, never in the database.

## 9. Daily job (`.github/workflows/forecast.yml`)

- Cron `0 22 * * *` (06:00 PHT), plus manual dispatch.
- `uv run python -m lunop.modeling.predict`: fetch Open-Meteo observed rain (past 9 weeks) and forecast rain (16 days) for Iloilo points, apply the §5.5 result, run `rain_only`, and write `forecast.json`.
- Commit only if the file changed; Vercel redeploys on push.
- On failure, the job fails loudly and the site keeps the previous file, showing its date.

## 10. Frontend

Two route groups, with every page usable on a phone:

- `(dashboard)`: sidebar layout for officers.
- `(public)`: minimal header (logo, EN/FIL, theme), no sidebar, for residents. Shares the offline banner and report outbox.

| Route | Content |
|---|---|
| `/` (public) | Landing page: short intro, links to Report and the dashboard, EN/FIL |
| `/dashboard` Overview | Alert banner and data date; surge chart (expected, 80% band, baseline); priority map; **one decision card** (current-phase recommendation); past performance |
| `/replay` | Event picker (3 events); daily rain animation on the map; forecast vs actual chart; decision card evolving by day; simulated reports labelled |
| `/priority` Priority areas | Ranked table (priority, pop, hazard, reports, dose range, access flag); detail panel; **Chronic flood spots** tab |
| `/reports` Flood reports | Map of `GET /api/reports` pins sized by depth (24 h / 7 d / 1 yr, default 7 d); pins marked when they feed a countdown or repeat flood spot; list and detail (depth, duration, waded, barangay, time). No `ip_hash` or `client_id` shown |
| `/report` (public) | Mobile-first form in English and Filipino, using GPS with a barangay dropdown fallback |
| `/methods` | Event study, LOEO table, back-test vs baselines, rain check, Zamboanga ρ with CI, dropped features and why, limitations |

- Every number has a tooltip showing its source and date. Every weight is labelled as an assumption.
- Uses a color-blind-safe sequential palette, with values also shown as text.

### 10.1 Offline (PWA)

**Install.** `app/manifest.ts` (name, icons from the shared logo, `display: standalone`). Serwist builds `app/sw.ts` into `public/sw.js`.

**Caching**

| What | Strategy | Notes |
|---|---|---|
| App shell (JS, CSS, fonts, page HTML, `~offline` page, `maplibre-gl-worker.mjs`) | Precache at install | Every route opens offline |
| `barangays.geojson`, `config.json`, `performance.json`, `replay/*.json` | Precache at install | Change only on deploy |
| `forecast.json` | Network first, cache fallback | Daily file; offline shows the cached copy and its `issued` date |
| `GET /api/reports` | Network first, cache fallback | Offline shows the last fetched reports |
| Basemap style, sprites, fonts and tiles (OpenFreeMap) | Cache first; Iloilo bounding box at z11–15 pre-warmed after install | Capped by a tile count limit; other areas cache as viewed |

**Map offline.** MapLibre's worker is served from `public/` (copied from `node_modules` by `npm run worker` before `dev` and `build`), not from unpkg as mapcn does by default. Barangay polygons are our own GeoJSON layer, so they draw without basemap tiles; a page opened offline skips the basemap style entirely.

**Report outbox (`lib/outbox.ts`)**
- Every report gets `client_id` and `observed_at` on the device, then goes into an IndexedDB outbox before any network call.
- The outbox flushes on submit, on the `online` event, on app open, and via Background Sync where supported (Chromium). iOS Safari has no Background Sync, so it relies on the other triggers.
- An entry is removed on 2xx or on a 4xx other than 429. 429 and network errors retry with backoff. `client_id` makes retries safe.
- The Report page shows "Saved. Will send when online (n pending)".

**On-device lookup (`lib/locate.ts`).** GPS → barangay with `@turf/boolean-point-in-polygon` on the cached `barangays.geojson`, so the form confirms the barangay offline. The server repeats the lookup.

**Offline state.** A banner shows "Offline. Data from {date}" using `navigator.onLine` plus failed fetches. Decision cards computed offline are labelled as using cached reports.

## 11. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance | First map paint < 3 s on 4G; Overview < 2 s |
| Availability | Stale forecast shows a "data from {date}" banner; replay works offline |
| Offline | After one online visit, every page loads in airplane mode; precache stays under ~25 MB excluding tiles |
| Privacy | No names; IPs stored only as salted hashes; no photos |
| Reproducibility | `make all` rebuilds every artifact from HDX; seed 42; `uv.lock` and `package-lock.json` pinned |
| Explainability | Every number traceable to inputs; assumptions visible |

## 12. Testing

- **Model (pytest):** the back-test runs end to end; a leakage check confirms rain features never use data unavailable at forecast time; `modeling/predict.py` output matches the schema.
- **Decision engine (vitest):** priority and doses against hand-calculated examples; table-driven tests for each recommendation trigger and for corroboration (2 reports → no countdown, 3 → countdown, 1 + Elevated → countdown); the chronic-spot date rule; the outbox (queued → sent, duplicate send → one row, 429 → retried, 400 → dropped) with `fake-indexeddb`; `locate.ts` against known barangay points.
- **Offline (Playwright):** load each page online, call `context.setOffline(true)`, reload, and assert data renders; submit a report offline, go online, and assert exactly one row.
- **Before submission:** a manual smoke check on a phone: load Overview, submit a report, see it within 1 minute, play every replay event; repeat in airplane mode after installing, then reconnect and confirm the queued report arrives; then a fresh-clone `make all`.

## 13. Deployment

- Vercel project with root `web/`. Env vars: `DATABASE_URL` (set by the Neon integration) and `IP_SALT`.
- Schema applied once with `web/db/schema.sql`.
- The GitHub Action needs only `contents: write`.

## 14. Risks

| Risk | Mitigation |
|---|---|
| Open-Meteo and CCHAIN rain differ | Rain check, then a single scale factor if needed (§5.5) |
| Daily job breaks | Previous forecast keeps serving with its date; manual dispatch |
| Overfitting the lag structure | Pooled 12-city model, fixed lags 0–8, LOEO and held-out years |
| Barangay ranking weakly supported | "Estimated exposure" label; Zamboanga CI; weights visible |
| One bad report triggers action | Corroboration rule (§6.3) |
| Hazard maps predate flood control | Stated limitation; post-2012 test; reports carry more weight over time |
| Demo network failure | Replay is bundled static data; the whole app is precached (§10.1) |
| Serwist and Next 16 Turbopack builds | Check compatibility first; fall back to `next build --webpack` |
| Browser evicts cached data (iOS Safari clears storage for sites unused for a while) | Ask for `navigator.storage.persist()`; installed home-screen apps are evicted less; the app re-caches on next online visit |
| Queued reports never sent (device stays offline, app uninstalled) | Pending count is visible; accepted as a known loss |
