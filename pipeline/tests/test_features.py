import numpy as np
import pandas as pd
import pytest

from lunop.config import FORECAST_WEEKS, RAIN_LAGS
from lunop.features import design, features


def panel(n=300, cities=("A", "B"), seed=0) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    dates = pd.date_range("2010-01-04", periods=n, freq="W-MON")
    d = pd.concat([pd.DataFrame({"city": c, "date": dates}) for c in cities], ignore_index=True)
    d["rain"] = rng.gamma(1, 50, len(d))
    d["rain_clim"] = 50.0
    d["cases"] = rng.poisson(3, len(d)).astype(float)
    d["woy"] = d.date.dt.isocalendar().week.astype(int).clip(upper=52)
    d["level_c"] = 1.0
    return d


@pytest.mark.parametrize("h", [1, 2, 3, 4])
def test_design_never_sees_cases_after_t(h):
    d = panel()
    t = d.date.iloc[150]
    later = d.copy()
    later.loc[later.date > t, ["cases", "level_c"]] = 10_000
    a, b = (x[x.date <= t] for x in (design(d, h, "with_cases"), design(later, h, "with_cases")))
    pd.testing.assert_frame_equal(a.drop(columns="y"), b.drop(columns="y"))


@pytest.mark.parametrize("h", [1, 2, 3, 4])
def test_design_rain_after_forecast_window_is_climatology(h):
    d = panel()
    t = d.date.iloc[150]
    wetter = d.copy()
    wetter.loc[wetter.date > t + pd.Timedelta(weeks=FORECAST_WEEKS), "rain"] = 10_000
    a, b = (x[x.date == t] for x in (design(d, h, "rain_only"), design(wetter, h, "rain_only")))
    pd.testing.assert_frame_equal(a, b)


def test_design_target_and_lags_align():
    d = panel()
    x = design(d, 1, "with_cases").set_index(["city", "date"])
    a = d[d.city == "A"].reset_index(drop=True)
    row = x.loc[("A", a.date[20])]
    assert row.y == a.cases[21]
    assert row.rain_l1 == pytest.approx(np.log1p(a.rain[20]))
    assert row.rain_l0 == pytest.approx(np.log1p(a.rain[21]))  # forecast week, within the window


def test_rain_only_has_no_case_features():
    assert not {"recent", "level_c"} & set(features(design(panel(), 2, "rain_only")))
