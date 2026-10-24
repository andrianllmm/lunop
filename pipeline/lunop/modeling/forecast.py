"""Fitted models -> weekly forecasts with intervals, ratio to the seasonal baseline, and alert levels."""
import pandas as pd

from lunop.features import design
from lunop.modeling.train import exceed, mean, quantile

LEVELS = ("Normal", "Elevated", "High", "Severe")
INTERVAL = (0.1, 0.9)  # lo/hi: 80% predictive interval
SEVERE_PROB = 0.5  # Severe also fires when P(cases >= city p95) reaches this


def forecasts(panel: pd.DataFrame, variant: str, models: dict, baseline: dict, p95: dict) -> pd.DataFrame:
    """One row per city x origin week t x horizon h.

    models/baseline: {h: model} for `variant` and for the seasonal baseline. Columns: city, date (t),
    h, target_date, y, expected, lo, hi, baseline, ratio, p_exceed.
    """
    out = []
    for h, m in models.items():
        x = design(panel, h, variant)
        f = x[["city", "date", "target_date", "y"]].assign(h=h)
        f["expected"] = mean(m, x)
        f["lo"], f["hi"] = (quantile(m, f.expected, q) for q in INTERVAL)
        f["baseline"] = mean(baseline[h], design(panel, h, "seasonal"))
        f["ratio"] = f.expected / f.baseline
        f["p_exceed"] = exceed(m, f.expected, f.city.map(p95))
        out.append(f)
    return pd.concat(out, ignore_index=True)


def issue(f: pd.DataFrame, thresholds: dict) -> pd.DataFrame:
    """Alert per city x origin week, from the max ratio and max p_exceed over its horizons.

    thresholds: minimum ratio for Elevated, High and Severe.
    """
    g = f.groupby(["city", "date"], as_index=False).agg(ratio=("ratio", "max"), p_exceed=("p_exceed", "max"))
    g["level"] = g.apply(lambda r: level(r.ratio, r.p_exceed, thresholds), axis=1)
    return g


def level(ratio: float, p_exceed: float, thresholds: dict) -> str:
    if ratio >= thresholds["Severe"] or p_exceed >= SEVERE_PROB:
        return "Severe"
    return next((lv for lv in ("High", "Elevated") if ratio >= thresholds[lv]), "Normal")
