# TRD: LUNOP

> Technical design for [PRD.md](PRD.md). Status: revised, 2026-10-22.

## 1. Architecture

```
Offline / daily (Python)                       Vercel (Next.js)                       Neon (Postgres)
────────────────────────                       ────────────────                       ───────────────
make model (laptop): CCHAIN → fit → model.json
make replay / evaluate → replay/*.json,        pages read static JSON
                         performance.json  ──► from web/public/data/
GitHub Action, 06:00 PHT daily:
  Open-Meteo rain → GLM → forecast.json    ──► commit → Vercel redeploys
                                               /api/reports (route handler)  ◄──►  flood_reports
                                               priority, recommendations,
                                               chronic spots (TypeScript)
```

**Principles**
- **Python never runs at request time.** The forecast changes only when the rain does, once a day, so a scheduled job computes it and writes a file. Evaluating the GLM is a few multiplications.
- **One deploy, one table.** Next.js on Vercel serves the pages and the only write path (community reports). The database stores reports and nothing else.
- **One decision engine, two modes.** Priority, recommendations and chronic spots are small TypeScript functions. Live mode feeds them today's forecast plus database reports; replay feeds them a past event's forecast plus its simulated reports.
- **Degrades gracefully.** If the daily job fails, the last committed `forecast.json` keeps serving with its date. Replay needs no network at all.

## 2. Stack

| Layer | Choice |
|---|---|
| Offline model | Python 3.11, pandas, statsmodels, geopandas, managed with `uv` |
| Web | Next.js (App Router), TypeScript, MapLibre GL, Recharts, Tailwind + shadcn/ui |
| DB | Neon Postgres via the Vercel integration; `@neondatabase/serverless` with plain SQL |
| Geometry in TS | `@turf/boolean-point-in-polygon` (GPS → barangay) |
| Daily job | GitHub Actions cron |
| Deploy | Vercel (project root `web/`) |
| Basemap | OpenFreeMap |

## 3. Repository layout

```
pjdsc-26/
├── docs/                    PRD.md, TRD.md
├── eda-experiment/          exploratory scripts (existing)
├── model/                   uv project
│   ├── download.py          fetch CCHAIN tables from HDX → data/raw/
│   ├── build.py             weekly city panel; barangays.geojson with static attributes
│   ├── rain_check.py        CCHAIN vs Open-Meteo archive (§5.5)
│   ├── fit.py               fit both model variants → artifacts/model.json
│   ├── evaluate.py          back-test, event study, LOEO, Zamboanga check → performance.json
│   ├── replay.py            per-event bundles → replay/*.json
│   ├── live.py              daily: Open-Meteo → forecast.json
│   └── tests/
├── web/
│   ├── app/                 (dashboard)/{page, replay, barangays, report, methods}
│   ├── app/api/reports/     route.ts (GET, POST)
│   ├── lib/                 priority.ts, recommend.ts, spots.ts, db.ts
│   └── public/data/         forecast.json, barangays.geojson, performance.json,
│                            config.json, replay/*.json   (all committed)
├── data/                    raw/ (gitignored), processed/
├── artifacts/               model.json
├── .github/workflows/       forecast.yml
└── Makefile                 setup, data, model, evaluate, replay, live, web, test, all
```

## 4. Data

| Data | Source | Granularity | Use |
|---|---|---|---|
| Leptospirosis cases | CCHAIN `disease_pidsr_totals` | City × week, 12 cities, 2008–2022 | Training, back-test, replay |
| Barangay cases | CCHAIN `disease_lgu_disaggregated_totals` | Barangay × week (Zamboanga, CDO) | Ranking check only |
| Rain (history) | CCHAIN `climate_atmosphere.pr` | Barangay × day, 2003–2022 | Training, replay |
| Rain (live) | Open-Meteo forecast + archive APIs | Point × day | Live forecast |
| Flood hazard | CCHAIN `project_noah_hazards` | Barangay; 25-yr low/med/high % area | Exposure |
| Population | CCHAIN `worldpop_population` | Barangay × year | Exposure, doses |
| Boundaries | CCHAIN `brgy_geography` | Barangay polygons | Map, GPS lookup |
| Hospital access | CCHAIN `geoportal_doh_poi_health`, `mapbox_health_facility_brgy_isochrones` | Barangay | Access column and flag |
| Infrastructure context | CCHAIN `osm_poi_water_body`, `google_open_buildings` | Barangay | Chronic-spot context (not scored) |
| Flood reports | `POST /api/reports` | Point × time | Exposure, corroboration, chronic spots |

Iloilo City is PSGC `PH063022000`, with 180 barangays.

**Static outputs** (committed to `web/public/data/`):
- `barangays.geojson`: simplified polygons (~1e-4°) with `psgc, name, pop, hazard_pct, access30_pct, nearest_facility, travel_min, water_dist_m, bldg_density`.
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
- One model per horizon h ∈ {1, 2, 3, 4}. Dispersion α is estimated by maximum likelihood.
- **Two variants**, fitted in the same loop:
  - `with_cases` includes γ. It is used for replay and the back-test, and compared against the seasonal + recent-cases baseline.
  - `rain_only` drops both γ and `level_c`, which need recent cases. It is used live, where there are no current case counts.
- Fit on 2008–2017, validate on 2018–2022, refit on all years for deployment.

**Dropped, with reasons recorded on the Methods page:**
- River discharge (GloFAS) added about 1% on top of rain, so it was dropped.
- The DLNM upgrade is extra complexity for a lag curve the linear version already captures.
- Gradient boosting runs as a benchmark in `evaluate.py` only if time allows.

### 5.2 Outputs (`forecast.json`)

```json
{ "issued": "2026-10-22", "data_as_of": "2026-10-21", "variant": "rain_only",
  "level": "High", "rain_peak_date": "2026-10-19",
  "weeks": [{ "week_start": "...", "expected": 0, "lo": 0, "hi": 0, "baseline": 0, "ratio": 0 }],
  "drivers": ["Rain in the week of Oct 13 was 3.1× normal"] }
```

`lo` and `hi` are the 10th and 90th percentiles of the predictive distribution. `baseline` is the city's seasonal mean for that week of year. `ratio = expected / baseline`.

### 5.3 Alert levels

Applied to the maximum `ratio` over weeks +1 to +4. Thresholds are tuned on the 2018–2022 back-test so that "High" fires in about 5% of weeks.

| Level | Rule |
|---|---|
| Normal | ratio < 1.5 |
| Elevated | 1.5 ≤ ratio < 2.5 |
| High | 2.5 ≤ ratio < 4 |
| Severe | ratio ≥ 4, or P(cases ≥ city p95) ≥ 0.5 |

### 5.4 Evaluation (`evaluate.py` → `performance.json`, `reports/backtest.md`)

**Headline (event-conditional, Iloilo)**
- **Leave-one-event-out (LOEO)** over the 16 Iloilo top-2% rain events: refit without each event's window (−2 to +8 weeks), then forecast it.
- Peak-timing error (weeks) per event.
- Error in weeks +1 to +6 after each event, against (a) seasonal only and (b) seasonal + recent cases.
- Alert hit rate and false-alarm rate.

**Secondary**
- All-weeks Poisson deviance and MAE on 2018–2022, for all cities and for Iloilo, reporting the 2–7% openly.
- Ablations: without rain; without the Sendong-era weeks (CDO, Iloilo 2011–12).
- Event-study curve: cases ÷ seasonal norm at weeks −2 to +6 after heavy rain.

**Barangay check:** score Zamboanga barangays with hazard × population and report the Spearman ρ against the observed case rate, with a bootstrap 95% CI.

The LOEO results choose the three replay events: two hits and one miss or false alarm.

### 5.5 Rain source check (`rain_check.py`)

The model is trained on CCHAIN rain and run live on Open-Meteo rain. Both are likely ERA5-based, so we check before building any calibration:
- Compare weekly Iloilo rain sums, CCHAIN vs Open-Meteo archive at the same points, 2008–2022.
- If **r ≥ 0.9 and the ratio of means is in 0.9–1.1**, use Open-Meteo as is.
- Otherwise store **one scale factor** (ratio of means) in `model.json` and apply it to live rain.
- The scatter plot and the result are shown on the Methods page.

### 5.6 Known limitations

- **PIDSR week meaning** (symptom onset vs report) is unknown, which affects how the lag is read.
- **Outliers:** one Sendong-era week (554 cases, CDO) can pull the coefficients; see the ablation.
- **Non-stationarity:** Iloilo's flood control works (~2012, to be verified) may have changed the relationship. Test with a post-2012 indicator.
- **Data ends in 2022;** live mode runs without current cases.

## 6. Decision engine (TypeScript, `web/lib/`)

All weights live in `config.json` and are shown in the UI as assumptions.

### 6.1 Priority (`priority.ts`)

```
H_b = pct_area_flood_25yr_med + pct_area_flood_25yr_high            (0–100)
R_b = min(1, Σ_{reports, last 7 days} w_depth · w_wade / 10)
      w_depth: ankle 0.25, knee 0.5, waist 1.0, chest+ 1.5;  w_wade: 1.5 if waded else 1.0
W_b = (H_b / 100 + 0.5 · R_b) · pop_b
rank by W_b; priority shown as a 0–100 percentile
excess_b = city excess cases (Σ_weeks expected − baseline) · W_b / Σ W
```

There is no poverty term, because its association flips sign between cities.

**Access flag:** set when `priority` is in the top 25% and `access30_pct` < 50%.

### 6.2 Doses (planning range)

```
exposed_b = pop_b · H_b/100 · f_contact,   f_contact ∈ [0.1, 0.3]
doses_b   = exposed_b · courses_per_person (default 1)     → shown as a range
```

Dosing rules (adult vs child, exclusions) appear as text from DOH guidance, not as computed advice.

### 6.3 Corroboration and countdown

A barangay's 72-hour prophylaxis countdown starts when either holds:
- ≥3 reports at knee depth or deeper from distinct `ip_hash` values within 24 h, or
- ≥1 such report while the city alert is Elevated or higher.

A single report only raises R_b. The countdown runs from the first qualifying report.

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

### 6.5 Chronic flood spots (`spots.ts`)

- Group knee-or-deeper reports into ~150 m cells (geohash precision 7).
- A cell is a **chronic spot** if it has reports on **≥3 distinct dates** in the past 12 months.
- Each spot carries its barangay's `water_dist_m`, `bldg_density` and `hazard_pct` as context. These are not scored.
- In round 1 the list is seeded from NOAH high-hazard barangays and the replay's simulated reports, both labelled.

## 7. API

Pages are server components that read the static JSON, query reports and run the decision engine. They revalidate every 60 s, so new reports appear within a minute. The only route handlers are:

| Method | Path | Description |
|---|---|---|
| POST | `/api/reports` | `{lat?, lon?, psgc?, depth, duration_h, waded, website}` → `{id, psgc}`. `website` is the honeypot: if filled, return 200 and drop the report. GPS is converted to psgc server-side. Returns 429 after 5 reports per `ip_hash` per hour |
| GET | `/api/reports?since=` | GeoJSON points (no `ip_hash`) |

## 8. Database

```sql
create table flood_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lat double precision, lon double precision,
  psgc text not null,
  depth text not null check (depth in ('ankle','knee','waist','chest')),
  duration_h real, waded boolean not null,
  ip_hash text not null
);
create index on flood_reports (created_at);
create index on flood_reports (psgc, created_at);
```

`ip_hash = sha256(IP_SALT || ip)`. Simulated replay reports live in `replay/*.json`, never in the database.

## 9. Daily job (`.github/workflows/forecast.yml`)

- Cron `0 22 * * *` (06:00 PHT), plus manual dispatch.
- `uv run python -m model.live`: fetch Open-Meteo observed rain (past 9 weeks) and forecast rain (16 days) for Iloilo points, apply the §5.5 result, run `rain_only`, and write `forecast.json`.
- Commit only if the file changed; Vercel redeploys on push.
- On failure, the job fails loudly and the site keeps the previous file, showing its date.

## 10. Frontend

Sidebar dashboard, with every page usable on a phone.

| Route | Content |
|---|---|
| `/` Overview | Alert banner and data date; surge chart (expected, 80% band, baseline); priority map; **one decision card** (current-phase recommendation); past performance |
| `/replay` | Event picker (3 events); daily rain animation on the map; forecast vs actual chart; decision card evolving by day; simulated reports labelled |
| `/barangays` | Ranked table (priority, pop, hazard, reports, dose range, access flag); detail panel; **Chronic flood spots** tab |
| `/report` | Mobile-first form in English and Filipino, using GPS with a barangay dropdown fallback |
| `/methods` | Event study, LOEO table, back-test vs baselines, rain check, Zamboanga ρ with CI, dropped features and why, limitations |

- Every number has a tooltip showing its source and date. Every weight is labelled as an assumption.
- Uses a color-blind-safe sequential palette, with values also shown as text.

## 11. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance | First map paint < 3 s on 4G; Overview < 2 s |
| Availability | Stale forecast shows a "data from {date}" banner; replay works offline |
| Privacy | No names; IPs stored only as salted hashes; no photos |
| Reproducibility | `make all` rebuilds every artifact from HDX; seed 42; `uv.lock` and `package-lock.json` pinned |
| Explainability | Every number traceable to inputs; assumptions visible |

## 12. Testing

- **Model (pytest):** the back-test runs end to end; a leakage check confirms rain features never use data unavailable at forecast time; `live.py` output matches the schema.
- **Decision engine (vitest):** priority and doses against hand-calculated examples; table-driven tests for each recommendation trigger and for corroboration (2 reports → no countdown, 3 → countdown, 1 + Elevated → countdown); the chronic-spot date rule.
- **Before freeze:** a manual smoke check on a phone: load Overview, submit a report, see it within 1 minute, play every replay event; then a fresh-clone `make all`.

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
| Demo network failure | Replay is bundled static data |
