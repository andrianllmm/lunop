"""Design matrices for the forecast model."""
import numpy as np
import pandas as pd

from lunop.config import FORECAST_WEEKS, HARMONICS, RAIN_LAGS, RECENT_WEEKS
from lunop.dataset import woy

RAIN = {"with_cases": True, "rain_only": True, "cases": False, "seasonal": False}
CASES = {"with_cases": True, "rain_only": False, "cases": True, "seasonal": False}
VARIANTS = tuple(RAIN)  # with_cases and rain_only are the models; cases and seasonal are baselines


def design(panel: pd.DataFrame, h: int, variant: str) -> pd.DataFrame:
    """One row per city x forecast origin week t, with target y = cases[t+h].

    Features: woy harmonics of t+h; log1p(rain[t+h-k]) for k in RAIN_LAGS if the variant uses
    rain; log1p(recent_cases[t]) and level_c[t] if it uses cases. Rain weeks after t stand in for
    the forecast: observed rain up to FORECAST_WEEKS ahead (a perfect forecast), rain_clim after.
    Rows with missing features or target are kept; the caller drops what it can't use.
    """
    if variant not in VARIANTS:
        raise ValueError(f"unknown variant {variant!r}")
    d = panel.sort_values(["city", "date"], ignore_index=True)
    g = d.groupby("city")
    x = d[["city", "date"]].copy()
    x["target_date"] = d.date + pd.Timedelta(weeks=h)
    x["y"] = g.cases.shift(-h)
    angle = 2 * np.pi * woy(x.target_date) / 52
    for i in range(1, HARMONICS + 1):
        x[f"sin{i}"], x[f"cos{i}"] = np.sin(i * angle), np.cos(i * angle)
    for k in RAIN_LAGS if RAIN[variant] else ():
        ahead = h - k  # weeks after t
        col = "rain_clim" if ahead > FORECAST_WEEKS else "rain"
        x[f"rain_l{k}"] = np.log1p(g[col].shift(-ahead))
    if CASES[variant]:
        recent = g.cases.transform(lambda s: s.rolling(RECENT_WEEKS, min_periods=1).mean())
        x["recent"] = np.log1p(recent)
        x["level_c"] = d.level_c
    return x


def features(x: pd.DataFrame) -> list[str]:
    """Numeric feature columns of a design(), excluding the city intercepts."""
    return [c for c in x.columns if c not in ("city", "date", "target_date", "y")]
