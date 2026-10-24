import numpy as np
import pandas as pd
import pytest

from lunop import dataset
from lunop.config import LEVEL_WEEKS, PROCESSED


def daily(start: str, end: str, city: str = "A", mm: float = 1.0) -> pd.DataFrame:
    dates = pd.date_range(start, end, freq="D")
    return pd.DataFrame({"city": city, "date": dates, "rain": mm})


def weekly_cases(start: str, n: int, city: str = "A", skip=()) -> pd.DataFrame:
    dates = pd.date_range(start, periods=n, freq="W-MON")
    c = pd.DataFrame({"city": city, "date": dates, "cases": np.arange(n)})
    return c[~c.date.isin(pd.to_datetime(list(skip)))]


def test_weekly_rain_sums_monday_weeks_and_drops_partial():
    w = dataset.weekly_rain(daily("2010-01-01", "2010-01-17"))  # Fri .. Sun
    assert w.date.dt.day_of_week.eq(0).all()
    assert w.rain.isna().tolist() == [True, False, False]  # week of 2009-12-28 has 3 days
    assert w.rain.iloc[1] == 7


def test_panel_fills_skipped_weeks_on_calendar():
    cases = weekly_cases("2010-01-04", 10, skip=["2010-02-01"])
    d = dataset.panel(cases, daily("2010-01-04", "2010-03-14"))
    assert len(d) == 10
    assert d.date.diff().dropna().eq(pd.Timedelta(weeks=1)).all()
    assert d.set_index("date").cases.isna()["2010-02-01"]
    dataset.check_panel(d, cases)


def test_level_c_uses_only_past_weeks():
    cases = weekly_cases("2010-01-04", LEVEL_WEEKS + 10)
    rain = daily("2010-01-04", "2011-04-01")
    before = dataset.panel(cases, rain)
    t = LEVEL_WEEKS
    later = cases.copy()
    later.loc[later.index > t, "cases"] = 10_000
    after = dataset.panel(later, rain)
    pd.testing.assert_series_equal(before.level_c[: t + 1], after.level_c[: t + 1])


def test_check_panel_catches_gap():
    cases = weekly_cases("2010-01-04", 10)
    d = dataset.panel(cases, daily("2010-01-04", "2010-03-14")).drop(index=4)
    with pytest.raises(dataset.DataError, match="calendar gap"):
        dataset.check_panel(d, cases)


def test_events_are_top_rain_weeks_with_windows():
    cases = weekly_cases("2010-01-04", 100)
    rain = daily("2010-01-04", "2011-12-04")
    rain["rain"] = np.linspace(0, 1, len(rain))
    for week in ["2010-06-07", "2011-03-07"]:  # 2 of 100 weeks are wet
        rain.loc[rain.date.between(week, pd.Timestamp(week) + pd.Timedelta(days=6)), "rain"] = 50
    e = dataset.events(dataset.panel(cases, rain))
    assert e.date.tolist() == [pd.Timestamp("2010-06-07"), pd.Timestamp("2011-03-07")]
    assert (e.window_end - e.window_start).iloc[0] == pd.Timedelta(weeks=10)


built = pytest.mark.skipif(not (PROCESSED / "panel.parquet").exists(), reason="run `make data` first")


@built
def test_built_panel():
    d = pd.read_parquet(PROCESSED / "panel.parquet")
    assert d.city.nunique() == 12
    assert d.groupby("city").size().nunique() == 1
    assert d.cases.dropna().ge(0).all() and d.rain.dropna().ge(0).all()


@built
def test_built_events():
    e = pd.read_parquet(PROCESSED / "events.parquet")
    assert e.event_id.is_unique
    assert (e.city == "Iloilo City").sum() == 16  # TRD 5.4
