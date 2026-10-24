# ---
# jupyter:
#   jupytext:
#     formats: ipynb,py:percent
#     text_representation:
#       extension: .py
#       format_name: percent
#   kernelspec:
#     display_name: Python 3
#     language: python
#     name: python3
# ---

# %% [markdown]
# # 01 · Data overview and quality
#
# **Goal:** know what we have before analysing it: which tables, what grain,
# what coverage, and what can go wrong.
#
# All data is from [Project CCHAIN](https://data.humdata.org/dataset/project-cchain)
# on HDX. Run `python scripts/download.py` from the repo root first.
#
# | Table | Grain | Used for |
# |---|---|---|
# | `disease_pidsr_totals` | City × week, 2008–2022 | **Target**: leptospirosis cases |
# | `climate_atmosphere` | Barangay × day | Rainfall (`pr`, mm) |
# | `disease_lgu_disaggregated_totals` | Barangay × week (few cities) | Barangay-level check |
# | `project_noah_hazards` | Barangay | Flood hazard (% area) |
# | `worldpop_population` | Barangay × year | Population |
# | `location` | Barangay | City/barangay names and codes |

# %%
from common import *

style()

# %% [markdown]
# ## 1. The 12 cities

# %%
b = barangays()
b.groupby("city").agg(barangays=("adm4_pcode", "size"), area_km2=("brgy_total_area", "sum")).round(1)

# %% [markdown]
# ## 2. Target: PIDSR leptospirosis cases

# %%
cases = lepto_weekly()
print(f"rows: {len(cases):,}  cities: {cases.city.nunique()}  "
      f"range: {cases.date.min():%Y-%m-%d} → {cases.date.max():%Y-%m-%d}")
print(f"missing case values: {cases.cases.isna().sum()}  duplicate city-weeks: {cases.duplicated(['city', 'date']).sum()}")
print(f"weekdays of week start: {sorted(int(x) for x in cases.date.dt.day_of_week.unique())}  (0 = Monday)")
cases.groupby("city").size().rename("weeks").to_frame().T

# %% [markdown]
# Every city has exactly 780 weeks (15 years × 52), with no gaps in values.
# But 15 years should span ~783 calendar weeks, so some weeks are missing from the calendar:

# %%
gaps = cases[cases.city == ILOILO].assign(gap=lambda d: d.date.diff())
gaps[gaps.gap > pd.Timedelta("7D")][["date", "gap"]]

# %% [markdown]
# **Takeaways**
# - Clean: no missing values, no duplicates, weeks start on Monday.
# - Two calendar weeks are absent (the weeks of 2012-12-31 and 2018-01-01). PIDSR uses
#   52-week years. Lags must be computed **by date, not by row**, or
#   these two jumps shift the lag by one week.
# - We don't know whether a PIDSR week counts *symptom onset* or *report date*. This
#   affects how the rain→cases lag is read (a reporting delay adds to the biological lag).

# %% [markdown]
# ## 3. Rainfall

# %%
rain = rain_daily()
print(f"rows: {len(rain):,}  range: {rain.date.min():%Y-%m-%d} → {rain.date.max():%Y-%m-%d}  "
      f"missing: {rain.pr.isna().sum()}")
rain.groupby("city").pr.describe().round(1)

# %%
p = panel()
print(f"city-weeks with no rain value after joining: {p.rain.isna().sum()}")

# %% [markdown]
# **Takeaways**
# - Rain is a gridded product interpolated to barangays, averaged here to one value per city per day.
# - Rain covers the full case period, so every city-week has a rain value.

# %% [markdown]
# ## 4. Barangay-level case data

# %%
lgu = pd.read_csv(RAW / "disease_lgu_disaggregated_totals.csv", parse_dates=["date"])
lgu = lgu[lgu.disease_common_name == "LEPTOSPIROSIS"]
lgu["city"] = lgu.adm3_pcode.map(cities())
lgu.groupby(["city", "source_filename"]).agg(
    rows=("uuid", "size"), barangays=("adm4_pcode", "nunique"), cases=("case_total", "sum"),
    first=("date", "min"), last=("date", "max"),
)

# %% [markdown]
# **Takeaways**
# - Only **Zamboanga** (2013–2022, 328 cases across 60 barangays) is usable at barangay level.
#   Cagayan de Oro, Muntinlupa and Tacloban have a few dozen cases at most.
# - **Iloilo has no barangay case data**, so the barangay ranking can't be validated in the
#   city we target. Notebook 04 checks it in Zamboanga instead.

# %% [markdown]
# ## 5. Hazard and population

# %%
noah = pd.read_csv(RAW / "project_noah_hazards.csv")
pop = pd.read_csv(RAW / "worldpop_population.csv", parse_dates=["date"])
print(f"NOAH: {len(noah)} barangays, snapshot {noah.date.unique()}, missing: {noah.isna().sum().sum()}")
print(f"WorldPop: {pop.adm4_pcode.nunique()} barangays, years {pop.date.dt.year.min()}–{pop.date.dt.year.max()}")
noah.filter(like="flood_hazard_25yr").describe().round(1)

# %% [markdown]
# **Takeaways**
# - NOAH hazard is a **single 2015 snapshot**: share of barangay area in low/medium/high flood
#   hazard for 5-, 25- and 100-year rain. It doesn't reflect flood control built since.
# - WorldPop stops at **2020**. Later years have to reuse 2020.
#
# ## Summary
#
# | Check | Result |
# |---|---|
# | Case data quality | Clean; 2 missing calendar weeks → lag by date |
# | Rain coverage | Complete for 2008–2022 |
# | Barangay cases | Only Zamboanga is usable; none for Iloilo |
# | Hazard / population | Static 2015 hazard; population to 2020 |
