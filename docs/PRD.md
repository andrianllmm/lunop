# PRD: LUNOP

> **L**eptospirosis **U**psurge **N**owcasting & **O**utbreak **P**revention. *Lunop* is Hiligaynon for "flood".
> Team Random Seed 42, PJDSC 2026. Status: revised, 2026-10-24.

## 1. Summary

**After floods, people in Iloilo get leptospirosis about two weeks later. LUNOP tells the City Health Office how many, where, and what to do, before they get sick.**

After heavy rain, LUNOP answers three questions:

1. **How big and when?** Expected cases for the next 4 weeks compared with normal, and the peak week. ("About 3× normal, peaking in 2 weeks.")
2. **Where first?** Barangays ranked by estimated flood exposure, sharpened by residents' flood reports.
3. **What now?** Time-bound actions: preventive doxycycline within 72 hours, case finding next week, hospitals ready by the peak.

Over many storms, residents' reports also build a list of **chronic flood spots**: places that flood every storm and force people to wade. The city can fix drains or raise paths there, so fewer people need pills next time.

**Positioning.** LUNOP is not "an accurate leptospirosis predictor". It turns a flood into a **sized, timed and targeted response plan**. DOH guidance already says to give prophylaxis after floods. It doesn't say how many people will get sick, when, or which barangays to reach first, and that is the gap LUNOP fills.

## 2. Problem

- Leptospirosis follows floods with a predictable delay. Admissions peak about 2 weeks after heavy rain, and flooding is the step through which rain leads to infection (Matsushita et al., 2018).
- The chain is **rain → flooding at a place → people forced to wade (*lusob*) → infection → cases 2–3 weeks later.** Weather alone describes only the first link.
- The Philippine response is reactive. Code White alerts are national and qualitative. Prophylaxis goes to "high-risk persons in flood-affected areas" with no way to choose which ones. PIDSR confirms outbreaks only after people are sick (Labana, 2026).
- We found no operational system that turns "this much rain fell" into "expect this many cases, in these barangays, by this date; do this now". The closest ones we found are research models and proposals.
- The problem is local and recurring. Iloilo City reported the most leptospirosis cases of the 12 CCHAIN cities: 3,948 of 8,034 PIDSR cases (49%) from 2008 to 2022.

### Evidence from our analysis (CCHAIN, 2008–2022)

Full results, notebooks and open issues: [FINDINGS.md](FINDINGS.md).

| Finding | Result |
|---|---|
| Lag between heavy rain and cases (12 cities, controlling for city, year, season) | Effect peaks 2–3 weeks after rain. Effect size by lag 0–4 weeks: 1.02, 1.08, 1.18, **1.34**, 1.18 |
| Dose–response (rain 2 weeks earlier, vs weeks under 10 mm) | 2.0× at 10–50 mm, 4.8× at 100–200 mm, **8.6× at 200–400 mm** |
| After the heaviest-rain weeks, all cities | **2.8× seasonal norm at week 2**, back to normal by week 6 |
| After the heaviest-rain weeks, Iloilo (16 events) | **2.9× at week 2**, 2.7× at week 3 |
| Robustness | Holds without the Sendong-era outbreaks, and without Iloilo |
| Out-of-sample gain from rain, all weeks (2018–2022 held out) | About 10% lower error across cities at 1–3 weeks ahead. Iloilo: **9% at 1 week, 4% at 2, 10% worse at 3** |
| River discharge (GloFAS, Iloilo, earlier analysis) | Correlates 0.6 with rain; adds about 1% on top of rain. **Tested and dropped** |
| Barangay flood hazard vs case rate (Zamboanga) | Spearman **0.23 (95% CI 0.03–0.40)** for medium/high 25-yr hazard; the signal comes from the *medium* layer |
| Barangay infrastructure features (Zamboanga, Cagayan de Oro, earlier analysis) | Signs **flip between cities**; better hospital access goes with *more* recorded cases. This is **detection bias**: barangay counts show where cases get recorded, not where people get infected |
| Who gets infected (Zamboanga) | Mostly **men aged 20–49** |
| Season | Cases peak August–November; Iloilo peaks in **October** |

### What the evidence supports

- **Strong:** the **size and timing of the city-level surge** after heavy rain. This is the core of the product.
- **Weak:** the **barangay ranking**. It is presented as **estimated exposure**, not as a validated case prediction.
- **Why the small Iloilo all-weeks gain doesn't sink the product:** most weeks are quiet, and an all-weeks average dilutes the signal. The model's value is concentrated in the weeks after storms, so we validate it there (§7).
- **Not yet supported:** Iloilo forecasts **3+ weeks ahead**. Adding rain made the all-weeks 3-week forecast worse. Weeks +3 and +4 are shown with wider caveats until the post-storm back-test confirms them.
- **Infrastructure:** built-up area, density and distance to water don't predict barangay cases consistently, so they are **not scored**. They appear as the *reason* a chronic flood spot floods (F6).

## 3. Goals and non-goals

### Goals
1. Warn the Iloilo City Health Office (CHO) 2–4 weeks ahead of leptospirosis surges after heavy rain, and earlier when a storm is forecast.
2. Rank barangays for prophylaxis and case finding, with every score traceable to its inputs.
3. Turn the forecast into specific actions with targets, quantities and deadlines.
4. Collect community flood and wading reports, which are the only direct measure of exposure, and turn repeated reports into a fix-list of chronic flood spots.
5. Validate on past storms in a way judges can replay and check, and state openly what the evidence doesn't support.

### Non-goals (round 1)
- Diagnosis or medical advice to individuals.
- Flood simulation. We use existing rain forecasts and NOAH hazard maps.
- Forced-wading routing (§11), an LLM-written brief, CHO case upload, river discharge, user accounts, SMS or push notifications, cities other than Iloilo in the UI.

## 4. Users

| Persona | Need | Main page |
|---|---|---|
| **CHO epidemiologist / health officer** (primary) | Decide where to send prophylaxis and health workers, and when to alert hospitals | Overview, Barangays |
| **Barangay health worker / BDRRM officer** | Report flooding; know if their barangay is a priority | Report, Barangays |
| **City engineering / DRRMO** | Know which spots flood every storm | Barangays → Chronic flood spots |
| **Hospital administrator** | Know when admissions peak and how many | Overview |
| **Resident** (secondary) | Report flooding | Report |

## 5. User stories

1. As a CHO officer, after a typhoon I see an alert level and expected weekly cases for the next 4 weeks vs normal, so I can decide whether to escalate.
2. As a CHO officer, I see which barangays to prioritize and a dose range for each, so I can dispatch within 72 hours.
3. As a hospital administrator, I see the expected peak week and its size, so I can prepare beds and antibiotics.
4. As a BHW or resident, I report flood depth and wading on a phone in under 30 seconds.
5. As a DRRMO engineer, I see the spots that flooded in storm after storm, and why, so I can prioritize drainage work.
6. As a judge, I replay a past storm and compare the forecast with what actually happened.

## 6. Features

The app is a dashboard with a sidebar: **Overview, Replay, Barangays, Report, Methods & Validation**. It has six features. Each one is built to be polished rather than broad.

### F1. Surge forecast (Overview)
- Expected weekly cases for weeks +1 to +4 with an 80% interval, against the seasonal baseline.
- Alert level **Normal / Elevated / High / Severe** from expected ÷ baseline (thresholds in TRD §5.3).
- Live mode uses observed rain to date plus Open-Meteo forecast rain (16 days). There is no live case data, so it runs the rain-only model and says so.
- Drivers in plain language: "Rain in the week of Oct 6 was 3.1× normal."
- Past performance (hit rate, false alarms) shown next to the alert.
- **Acceptance:** shows the data date; loads in under 2 s; keeps working on the last good forecast if the daily update fails.

### F2. Barangay priority (Overview map, Barangays page)
- Map and ranked table of all 180 barangays, labelled **"estimated exposure"**.
- Score = flood hazard (NOAH, 25-yr medium/high share) × population, raised by recent community reports, scaled by the city surge.
- Detail panel: score breakdown, population, hazard share, recent reports, nearest hospital and travel time, recommended actions.
- Poor hospital access is a **column and a flag**, not a separate layer.
- **Acceptance:** every score traces to its inputs; every weight is shown as an assumption; usable on a phone.

### F3. Recommendations (Overview decision card)
Rules keyed to alert level and days since the rain peak:
- **0–72 h:** prophylaxis to the top barangays with a **dose range** (assumption shown); avoid-wading advisory aimed at working-age men, who make up most cases.
- **Days 3–10:** active case finding in the top barangays.
- **Days 7–21:** hospital readiness: peak week, expected cases, stock checklist.
- **Forecast storm, not yet arrived:** pre-position stock.
- **After the flood:** drain clearing at chronic flood spots.

Each recommendation shows its target, quantity, deadline, reason and source guideline. The Overview shows **three pieces of information (alert, surge chart, map) and one decision**.

### F4. Community flood reports (Report page)
- Mobile-first form in English and Filipino: location (GPS, or pick a barangay), depth (ankle / knee / waist / chest+), duration, waded yes/no. No photo, no login.
- Rate limit per IP plus a honeypot field.
- A report **raises its barangay's score**. The **72-hour prophylaxis countdown starts only on corroboration**: ≥3 knee-or-deeper reports from different devices within 24 h, or 1 such report while the city alert is Elevated or higher.
- **Acceptance:** submission in under 30 s; appears on the map within 1 minute.

### F5. Storm replay (Replay page, default demo path)
- Three past Iloilo events chosen from the leave-one-event-out back-test: **two hits and one honest miss or false alarm**, with the overall hit rate shown.
- Daily rain animation over the barangay map, and forecast vs actual weekly cases.
- One event includes **simulated flood reports, clearly labelled**, to show reports raising scores and corroboration starting the countdown.
- **Acceptance:** works fully offline from bundled data.

### F6. Chronic flood spots (Barangays page tab)
- Places where knee-or-deeper reports recur over **≥3 separate days**, shown on the map and as a list for city engineering and DRRMO.
- Each spot shows its infrastructure context: distance to the nearest river or canal, building density, NOAH hazard. This explains *why it floods* and is not used for scoring.
- In round 1 the list is seeded from NOAH high-hazard areas and the simulated replay reports, both labelled.
- **Acceptance:** each spot lists its report dates and context, and links to its barangay.

### Methods & Validation page
Back-test results, event study, the leave-one-event-out table, the Zamboanga check with its CI, and the limitations (§8). This page is where judges check the rigor.

## 7. Success metrics

| Metric | Target |
|---|---|
| **Peak timing** after top-2% rain events (Iloilo, leave-one-event-out) | Predicted peak within ±1 week of actual, in most events |
| **Post-event error**: weeks +1 to +6 after top-2% events vs (a) seasonal only and (b) seasonal + recent cases | Lower error than both |
| Alert hit rate and false-alarm rate | Reported; "High" fires in about 5% of weeks |
| All-weeks error, 2018–2022 held out (secondary) | Reported by horizon for all cities and for Iloilo, including the 3-week loss |
| Barangay ranking check (Zamboanga) | Rank correlation **with 95% CI** and the detection-bias caveat |
| Report form completion time | Under 30 s (n ≥ 5) |
| Finals: expert review (CHO or public health instructor); SUS | Rated relevant and feasible; SUS ≥ 70 |

## 8. Constraints and assumptions

- Case data is **city-level weekly, 2008–2022**. Barangay priority comes from exposure, not from observed barangay cases.
- Only **Zamboanga** has usable barangay case data, and **Iloilo has none**, so the ranking is checked in another city. That data is also distorted by **detection bias**, so it can only weakly validate a barangay ranking.
- NOAH hazard maps come from mid-2010s surveys and predate some flood control works (the Jaro floodway, year to be verified).
- Live mode has no current case counts; it relies on rain and seasonality.
- Doxycycline needs a prescription. Dose ranges are for **supply planning** only, and follow current DOH guidance (to be verified).
- Intervention effects can't be measured from this data. Any impact estimate is labelled as an assumption.

## 9. Risks

| Risk | Mitigation |
|---|---|
| "Why a model? DOH already says give doxy after floods." | Pitch the size, timing and targeting, which DOH guidance lacks (§1) |
| Weak Iloilo all-weeks gain (9% → 4% → −10% at 1–3 weeks) | Lead with event-conditional validation; show the per-horizon numbers openly; caveat weeks +3 and +4 |
| Few cases make forecasts noisy | Train on all 12 cities; show ranges and multipliers, not exact counts |
| False alarms reduce trust | Graded alerts; hit and false-alarm rates shown in the app; replay includes a miss |
| Barangay claims questioned | "Estimated exposure" label; Zamboanga CI; detection-bias explanation |
| Spam or false reports | Rate limit, honeypot, corroboration before any countdown |
| Overlap with 2025 flood-mapping finalists (drAIn, AGIP, Bernoulli) | Position on the health response; chronic spots come from people's wading reports, not hydrology |
| Live data outage | Last good forecast stays up with its date; replay is fully offline |

## 10. Timeline (round 1)

| Date | Milestone |
|---|---|
| Thu Oct 22 | Model pipeline, back-test, JSON export; Next.js scaffold, map, Overview |
| Fri Oct 23 | Replay, reports and corroboration, recommendations, chronic spots, Methods page, deploy. **Start slides and video script in parallel** |
| **Sat Oct 24, 12:00 PM** | **Code freeze** |
| Sat Oct 24, afternoon | Video (≤3 min), slides (≤20), README, fresh-clone reproducibility test |
| **Sat Oct 24, 11:59 PM** | **Final submission** |
| Nov 14 | Finals: live demo, 10-min presentation + 10-min Q&A |

## 11. Roadmap (finals and after)

| Item | Needs |
|---|---|
| CHO case upload, so the forecast uses current cases | CHO contact; Python at request time (likely a FastAPI service) |
| One-page situation brief for the mayor and DRRM council | Template first; LLM only if it adds value |
| Forced-wading index (no dry route from home to essential places) | NOAH hazard polygons; footpath data; validation data |
| Checking where flooding actually happens | Sentinel-1 flood maps; accumulated reports |
| Data after 2022 | Mendeley PIDSR/EDCS 2019–2023; CHO data request |

## 12. Open questions

- Current DOH prophylaxis guideline: exposure tiers, child dosing, exclusions.
- A CHO contact for expert review and recent case data.
- Does PIDSR's week mean symptom onset or reporting date? It changes how the lag is read.
- Does the Iloilo 3-week loss hold on post-storm weeks, and does an Iloilo-specific rain term fix it?
- When was the Jaro floodway completed, and what year are the NOAH Iloilo maps from?

## References

- Labana, R. V. (2026). Rethinking leptospirosis prevention, the Philippines. *Emerging Infectious Diseases, 32*(3), 397. https://doi.org/10.3201/eid3203.251250
- Matsushita, N., Ng, C. F. S., Kim, Y., Suzuki, M., Saito, N., Ariyoshi, K., Salva, E. P., Dimaano, E. M., Villarama, J. B., Go, W. S., & Hashizume, M. (2018). The non-linear and lagged short-term relationship between rainfall and leptospirosis and the intermediate role of floods in the Philippines. *PLOS Neglected Tropical Diseases, 12*(4), e0006331. https://doi.org/10.1371/journal.pntd.0006331
- Thinking Machines Data Science. (2024). *Project CCHAIN* [Data set]. Humanitarian Data Exchange. https://data.humdata.org/dataset/project-cchain
