# Findings

What the data says, what it means for LUNOP, and what's still open. Source: the EDA notebooks in [`eda/`](../eda/) (CCHAIN, 12 cities, 2008–2022). Update this file when a notebook's conclusion changes.

## Data

| Fact | Detail | Notebook |
|---|---|---|
| Target | PIDSR leptospirosis, city × week, 780 weeks per city, no missing values | [01](../eda/01_data_overview.ipynb) |
| Calendar gaps | PIDSR skips the weeks of 2012-12-31 and 2018-01-01 → compute lags by date, not by row | 01 |
| Rain | CCHAIN `climate_atmosphere.pr`, barangay × day, 2003–2022, complete | 01 |
| Barangay cases | Only **Zamboanga** is usable (328 cases, 60 barangays, 2013–2022); **none for Iloilo** | 01 |
| Hazard / population | NOAH is one 2015 snapshot; WorldPop ends 2020 | 01 |
| Unknown | Whether a PIDSR week counts symptom onset or report date | 01 |

## Cases

| Finding | Result | Notebook |
|---|---|---|
| Burden | Iloilo City has **3,948 of 8,034** cases (49%) | [02](../eda/02_cases.ipynb) |
| Outbreaks | 2011–12 (Sendong era): Iloilo 1,088 and 854 cases (typical year 100–250); CdO 667 in 2012; worst week Iloilo 189 (Sep 2011) | 02 |
| Season | Peaks Aug–Nov; Iloilo peaks hard in **October** (~29% of a typical year) | 02 |
| Distribution | Mostly zero weeks (Iloilo 28%, most cities >75%); variance ≫ mean (Iloilo 33×) | 02 |
| Who | Mostly **men aged 20–49** (Zamboanga barangay data) | [04](../eda/04_barangay.ipynb) |

## Rain → cases

| Finding | Result | Notebook |
|---|---|---|
| Timing | Effect peaks **3 weeks** after rain; rate ratio by lag 0–4: 1.02, 1.08, 1.18, **1.34**, 1.18 | [03](../eda/03_rain_vs_cases.ipynb) |
| Event study | After each city's wettest 2% of weeks: **2.8×** the seasonal norm at week 2 (Iloilo **2.9×**, 16 events); back to normal by week 6 | 03 |
| Dose-response | Rain 2 weeks earlier vs <10 mm: **2.0×** at 10–50 mm, 2.6× at 50–100, **4.8×** at 100–200, **8.6×** at 200–400 | 03 |
| Robustness | Same curve shape and lag-3 peak without Iloilo/CdO 2011–12 and without Iloilo | 03 |
| Forecast value | Train 2008–17, test 2018–22, rain added to season + recent cases: **~9–11%** lower error across cities; Iloilo **+9%** (1 wk), **+4%** (2 wk), **−10%** (3 wk) | 03 |

## Barangay

| Finding | Result | Notebook |
|---|---|---|
| Population | Drives raw counts (ρ = 0.75), so hazard is judged on rates | 04 |
| Hazard vs case rate | Medium/high 25-yr hazard share: ρ = **0.23** (95% CI 0.03–0.40) | 04 |
| Layer sensitivity | Signal comes from 25-yr *medium*; *high* alone shows nothing | 04 |

## What this means for LUNOP

- **Core claim is solid:** heavy rain predicts a city-level surge 2–3 weeks later, its size grows with rainfall, and it holds across subsets. This supports the alert and countdown.
- **Model:** negative binomial GLM, pooled across 12 cities, with city, season, and rain at lags 0–8.
- **Action window:** 0–6 weeks after heavy rain, peaking at weeks 2–3.
- **Barangay ranking is weak evidence:** present it as *estimated exposure* (hazard × population), not predicted cases, and let community reports refine it.
- **Target group:** working-age men.

## Open issues

- ⚠️ **Iloilo 3-week forecast gets worse with rain (−10%).** This conflicts with the PRD's "2–7%". Check forecast skill on post-storm weeks and test an Iloilo-specific rain term before relying on h = 3.
- Iloilo has no barangay case data, so the ranking can't be validated where it's used.
- PIDSR week definition (onset vs report) affects how the lag is read.
- NOAH hazard predates recent flood control.
- PRD says 3,933 Iloilo cases; the data gives 3,948.
