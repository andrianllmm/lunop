import pandas as pd

from lunop.rain_check import compare


def weeks(values):
    return pd.DataFrame({"date": pd.date_range("2010-01-04", periods=len(values), freq="W-MON"), "rain": values})


def test_matching_sources_need_no_scale():
    r = compare(weeks([10.0, 50, 0, 80]), weeks([11.0, 49, 1, 79]))
    assert r["scale"] == 1.0 and r["n_weeks"] == 4


def test_biased_source_gets_ratio_of_means():
    r = compare(weeks([20.0, 100, 0, 160]), weeks([10.0, 50, 0, 80]))
    assert r["ratio"] == 2.0 and r["scale"] == 2.0


def test_weak_correlation_gets_scale_even_when_means_match():
    r = compare(weeks([10.0, 50, 10, 50]), weeks([50.0, 10, 50, 10]))
    assert r["r"] < 0.9 and r["scale"] == r["ratio"]
