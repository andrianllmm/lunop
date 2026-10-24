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
# # 04 · Barangay check: does flood hazard point to where cases are?
#
# **Goal:** the app ranks Iloilo barangays by *flood hazard × population*. Iloilo has no
# barangay case data, so we test the idea in **Zamboanga City**, the only city with usable
# barangay-level leptospirosis records (2013–2022, see notebook 01).

# %%
from scipy.stats import spearmanr

from common import *

style()

lgu = pd.read_csv(RAW / "disease_lgu_disaggregated_totals.csv", parse_dates=["date"])
z = lgu[(lgu.disease_common_name == "LEPTOSPIROSIS") & (lgu.source_filename == "Zamboanga_PIDSR_2013-2022")]
city_total = lepto_weekly().query("city == @ZAMBOANGA and date.dt.year >= 2013").cases.sum()
print(f"barangay records: {z.case_total.sum():.0f} cases vs {city_total} in the city-level PIDSR series "
      f"({z.case_total.sum() / city_total:.0%})")

# %% [markdown]
# The barangay file holds about 80% of the city series' cases. Some cases have no barangay recorded.

# %% [markdown]
# ## 1. Who gets infected?

# %%
fig, axes = plt.subplots(1, 2, figsize=(11, 3.2), gridspec_kw={"width_ratios": [1, 3]})
sex = z.groupby("sex").case_total.sum()
axes[0].bar(sex.index, sex.values, color=BLUE, width=0.6)
axes[0].set(title="By sex", ylabel="cases")
order = ["0-4", "5-9", "10-19", "20-29", "30-39", "40-49", "50-59", "60+"]
age = z.groupby("age_group").case_total.sum().reindex(order, fill_value=0)
axes[1].bar(age.index, age.values, color=BLUE, width=0.6)
axes[1].set(title="By age group")
for ax in axes:
    ax.grid(axis="x", visible=False)
plt.show()

# %% [markdown]
# **Takeaway:** cases are mostly **men aged 20–49**, consistent with exposure through outdoor work
# and wading in floodwater. That's the group prophylaxis and messaging should reach.

# %% [markdown]
# ## 2. Barangay table

# %%
noah = pd.read_csv(RAW / "project_noah_hazards.csv").set_index("adm4_pcode")
pop = pd.read_csv(RAW / "worldpop_population.csv", parse_dates=["date"])
pop = pop[pop.date.dt.year.between(2013, 2020)].groupby("adm4_pcode").pop_count_total.mean()  # WorldPop ends 2020

b = barangays().query("city == @ZAMBOANGA").set_index("adm4_pcode")
b["cases"] = z.groupby("adm4_pcode").case_total.sum().reindex(b.index, fill_value=0)
b["pop"] = pop
b["hazard_pct"] = noah.pct_area_flood_hazard_25yr_med + noah.pct_area_flood_hazard_25yr_high
b["rate"] = b.cases / b["pop"] * 1e5 / 10  # per 100k people per year
print(f"{len(b)} barangays, {(b.cases > 0).sum()} with at least one case")
b[["adm4_en", "cases", "pop", "hazard_pct", "rate"]].sort_values("cases", ascending=False).head(10).round(1)

# %% [markdown]
# `hazard_pct` = share of the barangay's area in **medium or high** flood hazard for a
# 25-year rain (NOAH). `rate` = cases per 100,000 people per year.

# %% [markdown]
# ## 3. Population drives raw counts

# %%
rho, _ = spearmanr(b["pop"], b.cases)
fig, ax = plt.subplots(figsize=(7, 4))
ax.scatter(b["pop"], b.cases, color=BLUE, s=30, alpha=0.7, edgecolor="white")
ax.set(title=f"Bigger barangays record more cases (Spearman ρ = {rho:.2f})",
       xlabel="population", ylabel="cases, 2013–2022")
plt.show()

# %% [markdown]
# **Takeaway:** population alone explains much of the raw count, so hazard has to be judged on
# the **rate**, not the count.

# %% [markdown]
# ## 4. Flood hazard vs case rate

# %%
rho, p = spearmanr(b.hazard_pct, b.rate)
lo, hi = bootstrap_ci(b.hazard_pct, b.rate, lambda x, y: spearmanr(x, y)[0])
fig, ax = plt.subplots(figsize=(7, 4))
ax.scatter(b.hazard_pct, b.rate, color=BLUE, s=30, alpha=0.7, edgecolor="white")
ax.set(title=f"Flood hazard vs case rate: ρ = {rho:.2f} (95% CI {lo:.2f}–{hi:.2f})",
       xlabel="% area in medium/high 25-yr flood hazard", ylabel="cases per 100k per year")
plt.show()

# %%
b["hazard_group"] = pd.cut(b.hazard_pct, [-0.1, 0, 10, 100], labels=["none", "0–10%", ">10%"])
g = b.groupby("hazard_group", observed=True).agg(barangays=("cases", "size"), cases=("cases", "sum"), pop=("pop", "sum"))
g["rate_per_100k_yr"] = g.cases / g["pop"] * 1e5 / 10
g.round(1)

# %%
rows = []
for col in ["25yr_med", "25yr_high", "5yr_high", "100yr_high"]:
    r, p = spearmanr(noah[f"pct_area_flood_hazard_{col}"].reindex(b.index), b.rate)
    rows.append((col, round(r, 2), round(p, 3)))
pd.DataFrame(rows, columns=["hazard layer", "spearman ρ", "p"])

# %% [markdown]
# **Takeaways**
# - Barangays with more flood-prone area have **somewhat higher case rates**: ρ ≈ 0.23,
#   and the 95% CI barely clears zero.
# - The signal comes from the **25-year medium** layer. "High" hazard alone shows nothing. The
#   layer is a choice, and it should be stated, not tuned further on 101 barangays.
# - This is **weak evidence** from one city with sparse counts (60 of 101 barangays ever had a
#   case). In the app, the barangay ranking is presented as **estimated exposure**, not a
#   prediction of cases, and community flood reports refine it.
# - Recorded cases also depend on where people seek care (detection bias), which hazard maps
#   can't capture.
#
# ## Summary
#
# | Finding | Implication |
# |---|---|
# | Mostly men aged 20–49 | Target group for prophylaxis and messaging |
# | Population drives counts | Rank on hazard × population; judge hazard on rates |
# | Hazard vs rate ρ ≈ 0.23 (CI 0.03–0.40) | Weak but positive: label the ranking "estimated exposure" |
