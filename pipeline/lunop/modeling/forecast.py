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


DRIVER_RATIO, DRIVER_MM = 1.5, 50  # a rain week is named as a driver at this multiple of normal and volume


def bulletin(f: pd.DataFrame, thresholds: dict, rain: pd.DataFrame, daily: pd.Series, variant: str) -> dict:
    """forecast.json (TRD 5.2) for one city and origin week t.

    f: forecasts() rows for that city and t. rain: weekly `date, rain, rain_clim` around t, where
    weeks after t hold the forecast. daily: daily rain (mm) indexed by date, observed then forecast.
    Issued the Monday after week t, with data through its Sunday.
    """
    f = f.sort_values("h")
    t = f.date.iloc[0]
    issued = t + pd.Timedelta(days=7)
    a = issue(f, thresholds).iloc[0]
    near = daily[(daily.index >= issued - pd.Timedelta(days=14)) & (daily.index < issued + pd.Timedelta(days=16))]
    return {
        "issued": issued.date().isoformat(),
        "data_as_of": (issued - pd.Timedelta(days=1)).date().isoformat(),
        "variant": variant,
        "level": a.level,
        "ratio": round(float(a.ratio), 2),
        "rain_peak_date": near.idxmax().date().isoformat() if len(near) and near.max() > 0 else None,
        "weeks": [{"week_start": r.target_date.date().isoformat(), "expected": round(r.expected, 1), "lo": int(r.lo),
                   "hi": int(r.hi), "baseline": round(r.baseline, 1), "ratio": round(r.ratio, 2)} for r in f.itertuples()],
        "drivers": drivers(rain, t),
    }


def drivers(rain: pd.DataFrame, t: pd.Timestamp, n: int = 2) -> list[str]:
    """The wettest weeks relative to normal among those the forecast uses (t-8 .. t+2)."""
    w = rain[(rain.date >= t - pd.Timedelta(weeks=8)) & (rain.date <= t + pd.Timedelta(weeks=2))].dropna(subset=["rain"])
    w = w.assign(x=w.rain / w.rain_clim)
    w = w[(w.x >= DRIVER_RATIO) & (w.rain >= DRIVER_MM)].nlargest(n, "x").sort_values("date")
    return [f"{'Forecast rain for' if r.date > t else 'Rain in'} the week of {r.date:%b} {r.date.day} "
            f"{'is' if r.date > t else 'was'} {r.x:.1f}× normal ({r.rain:.0f} mm)" for r in w.itertuples()]
