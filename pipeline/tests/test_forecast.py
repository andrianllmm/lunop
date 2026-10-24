import pandas as pd
import pytest

from lunop.modeling.forecast import drivers, level

TH = {"Elevated": 1.5, "High": 2.5, "Severe": 4.0}


@pytest.mark.parametrize("ratio,p,want", [
    (1.0, 0.0, "Normal"), (1.5, 0.0, "Elevated"), (3.0, 0.1, "High"), (4.0, 0.0, "Severe"), (1.0, 0.5, "Severe"),
])
def test_level(ratio, p, want):
    assert level(ratio, p, TH) == want


def test_drivers_name_wet_weeks_past_and_forecast():
    t = pd.Timestamp("2022-10-10")
    rain = pd.DataFrame({"date": pd.date_range("2022-08-15", periods=12, freq="W-MON"), "rain_clim": 40.0, "rain": 40.0})
    rain.loc[rain.date == "2022-10-03", "rain"] = 120  # 3x, past
    rain.loc[rain.date == "2022-10-24", "rain"] = 80  # 2x, forecast
    rain.loc[rain.date == "2022-09-05", "rain"] = 70  # 1.75x but weaker
    d = drivers(rain, t)
    assert d == ["Rain in the week of Oct 3 was 3.0× normal (120 mm)",
                 "Forecast rain for the week of Oct 24 is 2.0× normal (80 mm)"]
