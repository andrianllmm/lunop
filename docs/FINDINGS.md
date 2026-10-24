# Findings

What the data says, what it means for LUNOP, and what's still open. Source: the EDA notebooks in [`eda/`](../eda/) (CCHAIN, 12 cities, 2008–2022). Update this file when a notebook's conclusion changes. Citations: [REFERENCES.md](REFERENCES.md).

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
| Hazard vs case rate | 100-yr hazard share (any level): ρ = **0.52** (95% CI 0.37–0.66); 0.37 (0.19–0.54) after controlling for population | `backtest.md` |
| Old layer | 25-yr medium/high: ρ = 0.23, but **0.05** after controlling for population, so its signal was mostly population | `backtest.md` |

## What this means for LUNOP

- **Core claim is solid:** heavy rain predicts a city-level surge 2–3 weeks later, its size grows with rainfall, and it holds across subsets. This supports the alert and countdown.
- **Model:** negative binomial GLM, pooled across 12 cities, with city, season, and rain at lags 0–8.
- **Action window:** 0–6 weeks after heavy rain, peaking at weeks 2–3.
- **Barangay ranking is weak evidence:** present it as *estimated exposure* (hazard × population), not predicted cases, and let community reports refine it.
- **Target group:** working-age men.

## Open issues

- **Iloilo 3-week forecast (resolved in the back-test):** the EDA's −10% at h = 3 is gone once training starts in 2013 (`with_cases` −16% deviance vs season + recent cases at h = 3). An Iloilo-specific rain slope didn't help, so it isn't used. See [Model](#model).
- **Hazard layer (resolved, #30):** the 25-yr layer had only 5 of 180 Iloilo barangays above 0, so priority fell back to population. `hazard_pct` now uses the 100-yr layer, any level (160 barangays > 0). About 12 layer variants were compared on Zamboanga, so its ρ is somewhat optimistic.
- Iloilo has no barangay case data, so the ranking can't be validated where it's used.
- PIDSR week definition (onset vs report) affects how the lag is read.
- NOAH hazard predates recent flood control.

## Challenges and mitigation

| Challenge | Impact | Mitigation | Status |
|---|---|---|---|
| No barangay case data for Iloilo | A barangay ranking can't be trained or validated where it's used | Rank by **estimated exposure** (hazard × population), not predicted cases; community flood reports raise a barangay's score; checked on Zamboanga, the only city with barangay cases | Done; validation still needs Iloilo barangay cases |
| 25-yr hazard layer near zero | Only 5 of 180 Iloilo barangays had hazard > 0, so priority fell back to population | Switched to the NOAH 100-yr layer, any level (160 barangays > 0); ρ = 0.52 vs case rate in Zamboanga (#30) | Done; about 12 layer variants were compared, so ρ is somewhat optimistic |
| 2011–12 (Sendong-era) outbreaks skew training | Fits from 2008 predict Iloilo 2018–2022 at about 2× the observed level (5.9 vs 2.7 cases/week) | Train from 2013; the 2008 fits and a no-Sendong-weeks fit stay in `backtest.md` as ablations; 2008–2012 events are still forecast out of sample in LOEO | Done; chosen after seeing 2018–2022, so the back-test is mildly optimistic |
| Live rain (Open-Meteo) differs from training rain (CCHAIN) | A live forecast fed different rain than it was trained on would be biased | Compared 781 weeks: r = 0.71, CCHAIN/Open-Meteo = 1.092; live rain is scaled by 1.092 (TRD §5.5) | Done; `rain_only` loses 3–4 points of its gain on live rain (−7 to −8% vs −11%) |
| Weak High+ alerts from the live `rain_only` model | Flags High+ on 1 of 54 surge weeks (2%) in 2018–2022; reaches Elevated on 33% | Stated next to every live alert; `with_cases` flags High+ on 6 of 7 LOEO surges, and becomes the live model once weekly case data arrives | Open; needs a CHO case feed |
| Iloilo 3-week forecast worse with rain in the EDA (−10%) | Countdown and hospital readiness lean on weeks 2–3 | Re-tested in the back-test: `with_cases` −16% deviance at h = 3; an Iloilo rain slope didn't help and isn't used | Resolved |
| PIDSR week definition unknown (onset vs report) | Shifts how the 2–3 week lag is read | Stated as a limitation; listed as an open question for the CHO | Open |
| NOAH maps predate recent flood control (e.g., Jaro floodway) | Hazard may overstate areas now protected | Stated as a limitation; community reports and chronic flood spots show where flooding still happens | Open; needs post-flood-control maps |
| Offline field use | Health workers and residents lose signal during floods | Installable PWA: data and basemap precached; reports queued on the device and sent when back online | Done (#25) |

## Model

Source: `pipeline/reports/backtest.md` (`make evaluate`). Details and caveats: [TRD §5](TRD.md#5-forecast-model).

| Finding | Result |
|---|---|
| Training window | Train from 2013: fits that include 2011–12 predict Iloilo 2018–2022 at ~2× the observed level |
| Rain helps | Iloilo deviance −15 to −17% vs season + recent cases at h = 1–4; the EDA's h = 3 loss is gone |
| Live model | `rain_only` −11% vs seasonal for Iloilo; −7 to −8% when fed Open-Meteo rain |
| Events (LOEO) | Peak timing off by 1.3 weeks on average; `with_cases` alerts High+ on 6 of 7 surges, 1 false alarm |
| Weak spots | Live alerts flag few surges (2% of surge weeks at High+); overshoot at outbreak peaks; seasonal wins on typical events by median |
| Rain source | CCHAIN vs Open-Meteo weekly r = 0.71; live rain scaled by 1.092 |

