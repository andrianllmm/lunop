"""Shared loaders and plot style for the EDA notebooks."""
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"

ILOILO = "Iloilo City"
ZAMBOANGA = "Zamboanga City"

# Categorical order (blue, orange, aqua, yellow); extra series go grey.
BLUE, ORANGE, AQUA, YELLOW = "#2a78d6", "#eb6834", "#1baf7a", "#eda100"
GREY, INK, MUTED = "#a3a29c", "#0b0b0b", "#52514e"


def style() -> None:
    plt.rcParams.update({
        "figure.figsize": (10, 4),
        "figure.dpi": 110,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.edgecolor": MUTED,
        "axes.labelcolor": MUTED,
        "axes.titlesize": 12,
        "axes.titleweight": "bold",
        "axes.titlelocation": "left",
        "axes.grid": True,
        "axes.axisbelow": True,
        "grid.color": "#e6e5e0",
        "grid.linewidth": 0.8,
        "xtick.color": MUTED,
        "ytick.color": MUTED,
        "lines.linewidth": 2,
        "legend.frameon": False,
    })
    pd.set_option("display.width", 160)
    pd.set_option("display.max_columns", 30)


def cities() -> pd.Series:
    """adm3_pcode -> city name."""
    loc = pd.read_csv(RAW / "location.csv")
    return loc.drop_duplicates("adm3_pcode").set_index("adm3_pcode").adm3_en


def barangays() -> pd.DataFrame:
    loc = pd.read_csv(RAW / "location.csv")
    return loc[["adm3_en", "adm4_pcode", "adm4_en", "brgy_total_area"]].rename(columns={"adm3_en": "city"})


def lepto_weekly() -> pd.DataFrame:
    """PIDSR leptospirosis cases, one row per city-week (weeks start Monday)."""
    p = pd.read_csv(RAW / "disease_pidsr_totals.csv", parse_dates=["date"])
    p = p[p.disease_common_name == "LEPTOSPIROSIS"]
    p = p.assign(city=p.adm3_pcode.map(cities()), cases=p.case_total.astype(int))
    return p[["city", "date", "cases"]].sort_values(["city", "date"]).reset_index(drop=True)


def rain_daily() -> pd.DataFrame:
    """Daily rainfall (mm), averaged over each city's barangays. Cached as parquet."""
    out = PROCESSED / "city_daily_rain.parquet"
    if not out.exists():
        PROCESSED.mkdir(parents=True, exist_ok=True)
        brgy_city = barangays().set_index("adm4_pcode").city
        c = pd.read_csv(RAW / "climate_atmosphere.csv", usecols=["adm4_pcode", "date", "pr"])
        c["city"] = c.adm4_pcode.map(brgy_city)
        c.groupby(["city", "date"], as_index=False).pr.mean().to_parquet(out)
    d = pd.read_parquet(out)
    d["date"] = pd.to_datetime(d.date)
    return d


def panel() -> pd.DataFrame:
    """City-week panel: cases + weekly rain total (mm), with week-of-year and year.

    Covers every calendar week, so a row shift is a one-week lag. The two weeks PIDSR
    skips (2012-12-31, 2018-01-01) have cases = NaN.
    """
    r = rain_daily()
    r["week"] = r.date - pd.to_timedelta(r.date.dt.day_of_week, unit="D")
    w = r.groupby(["city", "week"], as_index=False).pr.sum().rename(columns={"week": "date", "pr": "rain"})
    c = lepto_weekly()
    weeks = pd.date_range(c.date.min(), c.date.max(), freq="W-MON")
    grid = pd.MultiIndex.from_product([sorted(c.city.unique()), weeks], names=["city", "date"]).to_frame(index=False)
    d = grid.merge(c, on=["city", "date"], how="left").merge(w, on=["city", "date"], how="left")
    d["year"] = d.date.dt.year
    d["woy"] = d.date.dt.isocalendar().week.astype(int).clip(upper=52)
    return d


def add_lags(d: pd.DataFrame, col: str, lags: range) -> pd.DataFrame:
    g = d.groupby("city")[col]
    for k in lags:
        d[f"{col}_l{k}"] = g.shift(k)
    return d


def seasonal_expected(d: pd.DataFrame, col: str = "cases") -> pd.Series:
    """Each city's average for that week of the year."""
    return d.groupby(["city", "woy"])[col].transform("mean")


def bootstrap_ci(x, y, stat, n: int = 2000, seed: int = 42) -> tuple[float, float]:
    rng = np.random.default_rng(seed)
    x, y = np.asarray(x), np.asarray(y)
    vals = [stat(x[i], y[i]) for i in (rng.integers(0, len(x), len(x)) for _ in range(n))]
    return tuple(np.nanpercentile(vals, [2.5, 97.5]))
