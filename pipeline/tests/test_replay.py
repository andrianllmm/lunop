import geopandas as gpd
import numpy as np
import pandas as pd
import shapely

from lunop import replay


def setup():
    brgy = gpd.GeoDataFrame({"psgc": ["A", "B", "C"], "hazard_pct": [50.0, 10.0, 0.0], "pop": [1000, 1000, 1000]},
                            geometry=[shapely.box(i, 0, i + 1, 1) for i in range(3)], crs="EPSG:4326")
    dates = pd.date_range("2011-08-15", periods=3)
    days = pd.DataFrame({"date": dates, "rain": [5.0, 120.0, 40.0]})
    rain = pd.DataFrame(80.0, index=dates, columns=["A", "B", "C"])
    return days, rain, brgy


def test_reports_only_on_flood_days_and_hazard_areas():
    days, rain, brgy = setup()
    r = replay.reports(days, rain, brgy, np.random.default_rng(0))
    assert r and all(x["simulated"] for x in r)
    assert {x["observed_at"][:10] for x in r} <= {"2011-08-16", "2011-08-17", "2011-08-18"}
    assert "C" not in {x["psgc"] for x in r}  # no hazard, no reports
    assert len({x["client_id"] for x in r}) == len({x["ip_hash"] for x in r}) == len(r)
    for x in r:
        assert brgy.set_index("psgc").geometry[x["psgc"]].contains(shapely.Point(x["lon"], x["lat"]))


def test_reports_are_reproducible():
    days, rain, brgy = setup()
    a, b = (replay.reports(days, rain, brgy, np.random.default_rng(1)) for _ in range(2))
    assert a == b


def test_outcome():
    e = lambda level, surge: {"level": {"with_cases": level}, "surge": surge}
    assert [replay.outcome(e(*x)) for x in [("Severe", True), ("Normal", True), ("High", False), ("Elevated", False)]] \
        == ["hit", "miss", "false alarm", "quiet"]
