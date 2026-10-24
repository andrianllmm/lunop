"""Daily live forecast: Open-Meteo rain -> rain_only model -> web/public/data/forecast.json.

Runs without data/: everything it needs is in models/model.json and models/thresholds.json.
"""
import json

import numpy as np
import pandas as pd

from lunop.config import HORIZONS, ILOILO, MODELS, RAIN_LAGS, WEB_DATA
from lunop.dataset import atomic, weekly_rain, woy
from lunop.modeling.forecast import bulletin, forecasts
from lunop.rain_check import FORECAST, openmeteo

PAST_DAYS = 70  # covers rain[t-7], the oldest lag the forecast uses, for any weekday


def load() -> tuple[dict, dict]:
    model = json.loads((MODELS / "model.json").read_text())
    model["models"] = {v: {int(h): m for h, m in hs.items()} for v, hs in model["models"].items()}
    return model, json.loads((MODELS / "thresholds.json").read_text())


def live_panel(daily: pd.DataFrame, today: pd.Timestamp, model: dict) -> tuple[pd.DataFrame, pd.Timestamp]:
    """Iloilo weekly panel around the origin week t, the last full Monday week before `today`.

    Rain is scaled by model.json's rain_scale. Weeks t+1 and t+2 come from the forecast; later
    weeks have only rain_clim. Cases are unknown, which rain_only doesn't need.
    """
    t = today - pd.Timedelta(days=today.day_of_week + 7)
    weeks = pd.date_range(t - pd.Timedelta(weeks=max(RAIN_LAGS)), t + pd.Timedelta(weeks=max(HORIZONS)), freq="W-MON")
    w = weekly_rain(daily.assign(rain=daily.rain * model["rain_scale"])).set_index("date").rain
    p = pd.DataFrame({"city": ILOILO, "date": weeks, "cases": np.nan, "level_c": np.nan})
    p["rain"] = p.date.map(w)
    p["woy"] = woy(p.date)
    p["rain_clim"] = p.woy.map(lambda k: model["rain_clim"][k - 1])
    return p, t


def predict(daily: pd.DataFrame, today: pd.Timestamp, model: dict, thresholds: dict) -> dict:
    p, t = live_panel(daily, today, model)
    m = model["models"]
    f = forecasts(p, "rain_only", m["rain_only"], m["seasonal"], model["p95"])
    f = f[f.date == t]
    if f.expected.isna().any():
        raise ValueError(f"missing rain for the forecast from week {t.date()}")
    out = bulletin(f, thresholds["rain_only"], p, daily.set_index("date").rain * model["rain_scale"], "rain_only")
    # the job runs daily, so date it by the run rather than by week t
    return {**out, "issued": today.date().isoformat(), "data_as_of": (today - pd.Timedelta(days=1)).date().isoformat()}


def main() -> None:
    model, thresholds = load()
    daily = openmeteo(FORECAST, past_days=PAST_DAYS, forecast_days=16)
    today = pd.Timestamp.now(tz="Asia/Manila").normalize().tz_localize(None)
    out = predict(daily, today, model, thresholds)
    with atomic(WEB_DATA / "forecast.json") as tmp:
        tmp.write_text(json.dumps(out, indent=1, ensure_ascii=False))
    print(f"{out['issued']}: {out['level']} (max ratio {out['ratio']})")


if __name__ == "__main__":
    main()
