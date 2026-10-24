import pandas as pd
import pytest

from lunop.config import ILOILO, MODELS
from lunop.modeling import predict

trained = pytest.mark.skipif(not (MODELS / "thresholds.json").exists(), reason="run `make train evaluate` first")


def daily(today, mm):
    dates = pd.date_range(today - pd.Timedelta(days=predict.PAST_DAYS), today + pd.Timedelta(days=15))
    return pd.DataFrame({"city": ILOILO, "date": dates, "rain": mm})


@trained
@pytest.mark.parametrize("today", ["2026-10-19", "2026-10-25"])  # Monday, and Sunday before the week ends
def test_origin_is_last_full_week(today):
    model, _ = predict.load()
    p, t = predict.live_panel(daily(pd.Timestamp(today), 5.0), pd.Timestamp(today), model)
    assert t == pd.Timestamp("2026-10-12")
    assert p.rain[p.date <= t + pd.Timedelta(weeks=2)].iloc[1:].notna().all()


@trained
def test_more_rain_raises_the_forecast():
    model, th = predict.load()
    today = pd.Timestamp("2026-10-21")
    dry, wet = (predict.predict(daily(today, mm), today, model, th) for mm in (1.0, 40.0))
    assert len(wet["weeks"]) == 4 and wet["variant"] == "rain_only"
    assert all(w["expected"] > d["expected"] for w, d in zip(wet["weeks"], dry["weeks"]))
    assert wet["level"] != "Normal" and dry["level"] == "Normal"


@trained
def test_missing_rain_fails_loudly():
    model, th = predict.load()
    today = pd.Timestamp("2026-10-21")
    with pytest.raises(ValueError, match="missing rain"):
        predict.predict(daily(today, 5.0).iloc[30:], today, model, th)
