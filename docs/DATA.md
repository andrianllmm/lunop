# Data dictionary

The tables `make data` builds (`pipeline/lunop/dataset.py`). Inputs are CCHAIN CSVs in `data/raw/`, pinned by `pipeline/raw.sha256`.

Conventions:
- `psgc` is a barangay PSGC code (`adm4_pcode`, e.g. `PH063022001`), always a string.
- `city` is the CCHAIN city name (`adm3_en`, e.g. `Iloilo City`).
- `date` is the Monday a week starts. PIDSR weeks run Monday to Sunday.

| File | Rows | Grain | Used by |
|---|---|---|---|
| `data/interim/city_daily_rain.parquet` | 87,660 | city × day, 2003-01-01 to 2022-12-31 | cache for `panel` |
| `data/processed/panel.parquet` | 12,516 | city × week, 2003-01-06 to 2022-12-26 | features, train, evaluate, replay |
| `data/processed/events.parquet` | 192 | city × heavy-rain week | evaluate (LOEO, event study), replay |
| `data/processed/zamboanga_brgy.parquet` | 101 | Zamboanga barangay | evaluate (barangay check) |
| `web/public/data/barangays.geojson` | 180 | Iloilo barangay polygon | web map, priority, GPS lookup |

## `city_daily_rain.parquet`

| Column | Type | Unit | Definition |
|---|---|---|---|
| `city` | str | | |
| `date` | datetime | day | |
| `rain` | float | mm/day | `climate_atmosphere.pr`, mean over the city's barangays. Zamboanga barangay `PH097332095` has no rain data and is left out of the mean |

## `panel.parquet`

One row per city per week, with no gaps, so `shift(k)` within a city is a k-week lag.

| Column | Type | Unit | Definition | Null when |
|---|---|---|---|---|
| `city` | str | | | |
| `date` | datetime | week start | | |
| `cases` | float | cases/week | PIDSR leptospirosis (`disease_pidsr_totals`) | before 2008-01-07 (rain-only years), and the weeks PIDSR skips: 2012-12-31, 2018-01-01 |
| `rain` | float | mm/week | sum of `city_daily_rain` over Mon–Sun | the week has fewer than 7 days of data (only 2022-12-26) |
| `year` | int | | calendar year of `date` | |
| `woy` | int | 1–52 | ISO week of `date`; week 53 counts as 52 | |
| `level_c` | float | log cases | mean `log1p(cases)` over the 52 weeks ending at `date` (inclusive); needs at least 26 non-null weeks | the first 25 weeks of 2008, and pre-2008 |
| `rain_clim` | float | mm/week | the city's mean `rain` for that `woy`, 2003–2017 only (excludes validation years) | |

`level_c` at week t uses only weeks ≤ t (tested in `test_level_c_uses_only_past_weeks`).

## `events.parquet`

Each city's wettest 2% of weeks (`rain` ≥ the city's 98th percentile), among weeks from 2008-01-07 on. That gives 16 per city. Adjacent heavy weeks are separate events, so their windows can overlap.

| Column | Type | Unit | Definition |
|---|---|---|---|
| `event_id` | str | | `<city_slug>_<date>`, e.g. `iloilo_city_2011-08-15` |
| `city` | str | | |
| `date` | datetime | week start | the heavy-rain week |
| `rain` | float | mm/week | that week's rain |
| `rain_clim` | float | mm/week | normal rain for that week (see `panel`) |
| `window_start` | datetime | week start | `date` − 2 weeks |
| `window_end` | datetime | week start | `date` + 8 weeks; LOEO drops `window_start..window_end` when refitting |

## `zamboanga_brgy.parquet`

Zamboanga City is the only city with usable barangay-level case data (source file `Zamboanga_PIDSR_2013-2022`), so the hazard × population ranking is tested here.

| Column | Type | Unit | Definition |
|---|---|---|---|
| `psgc` | str | | |
| `name` | str | | barangay name |
| `area_km2` | float | km² | `location.brgy_total_area` |
| `cases` | int | cases | leptospirosis, 2013–2022 total; 0 if none recorded |
| `pop` | float | people | WorldPop mean, 2013–2020 (WorldPop ends in 2020) |
| `hazard_pct` | float | % of area | NOAH 100-yr flood hazard, low + medium + high, capped at 100 (2015 snapshot) |
| `hazard_25yr` | float | % of area | NOAH 25-yr medium + high, capped at 100; kept for comparison |
| `rate` | float | cases per 100k per year | `cases / pop × 1e5 / 10` |

The barangay file holds about 80% of the city series' cases for 2013–2022. The rest have no barangay recorded.

## `barangays.geojson`

Iloilo City (`PH063022000`) polygons in EPSG:4326. Simplified at 1e-4° (~11 m) with topology preserved; coordinates are rounded to 5 decimals. Committed, because the web app precaches it.

| Property | Type | Unit | Definition | Source |
|---|---|---|---|---|
| `psgc` | str | | | `location` |
| `name` | str | | | `location` |
| `area_km2` | float | km² | | `location` |
| `pop` | int | people | 2020 population | `worldpop_population` |
| `hazard_pct` | float | % of area | 100-yr flood hazard, any level (160 of 180 barangays > 0); ranks barangays | `project_noah_hazards` |
| `hazard_high_pct` | float | % of area | 100-yr high flood hazard (deep water); sizes exposure and doses | same |
| `access30_pct` | float | % of pop | share of people within 30 min of a hospital | `mapbox_health_facility_brgy_isochrones` |
| `travel_min` | int \| null | min | first of 5 / 15 / 30 min within which ≥ 50% of people reach a hospital; null if none (10 barangays) | same |
| `hospital_dist_m` | float | m | distance to the nearest DOH hospital | `geoportal_doh_poi_health` |
| `water_dist_m` | float | m | distance to the nearest river, stream, canal or drain, 2022 | `osm_poi_water_body` |
| `bldg_density` | float | buildings/km² | | `google_open_buildings` |

CCHAIN caps distances at 10,000 m, so 10,000 means "10 km or more".
