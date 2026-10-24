"""Compare CCHAIN rain with the Open-Meteo archive for Iloilo.

Writes the scale factor (1.0 if none is needed) for modeling/train.py to store in model.json.
The archive pull is cached in data/external/.
"""
import json
from urllib.parse import urlencode
from urllib.request import urlopen

import geopandas as gpd
import numpy as np
import pandas as pd

from lunop.config import EXTERNAL, ILOILO, MODELS, PROCESSED, WEB_DATA
from lunop.dataset import atomic, save, weekly_rain

ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"
FORECAST = "https://api.open-meteo.com/v1/forecast"
GRID = 3  # GRID x GRID points over the city's bounding box; their mean stands in for the city mean
MIN_R, RATIO_OK = 0.9, (0.9, 1.1)  # TRD 5.5


def points() -> tuple[list[float], list[float]]:
    """Latitudes and longitudes of a GRID x GRID lattice inside Iloilo City's bounding box."""
    x0, y0, x1, y1 = gpd.read_file(WEB_DATA / "barangays.geojson").total_bounds
    lon, lat = np.meshgrid(np.linspace(x0, x1, GRID + 2)[1:-1], np.linspace(y0, y1, GRID + 2)[1:-1])
    return lat.ravel().round(4).tolist(), lon.ravel().round(4).tolist()


def openmeteo(url: str, **params) -> pd.DataFrame:
    """Daily precipitation (mm), mean over points(), as city/date/rain rows."""
    lat, lon = points()
    q = {"latitude": ",".join(map(str, lat)), "longitude": ",".join(map(str, lon)),
         "daily": "precipitation_sum", "timezone": "Asia/Manila", **params}
    with urlopen(f"{url}?{urlencode(q)}", timeout=120) as r:
        res = json.load(r)
    res = res if isinstance(res, list) else [res]
    rain = pd.DataFrame({i: p["daily"]["precipitation_sum"] for i, p in enumerate(res)}, dtype=float)
    return pd.DataFrame({"city": ILOILO, "date": pd.to_datetime(res[0]["daily"]["time"]), "rain": rain.mean(axis=1)})


def archive(start: str = "2008-01-01", end: str = "2022-12-31") -> pd.DataFrame:
    out = EXTERNAL / "openmeteo_iloilo_daily.parquet"
    if out.exists():
        return pd.read_parquet(out)
    d = openmeteo(ARCHIVE, start_date=start, end_date=end)
    save(d, out)
    return d


def compare(cchain: pd.DataFrame, om: pd.DataFrame) -> dict:
    """Weekly Iloilo rain, CCHAIN vs Open-Meteo: correlation, ratio of means and the scale to apply."""
    w = cchain.merge(om, on="date", suffixes=("_cchain", "_om")).dropna()
    r = float(np.corrcoef(w.rain_cchain, w.rain_om)[0, 1])
    ratio = float(w.rain_cchain.mean() / w.rain_om.mean())
    ok = r >= MIN_R and RATIO_OK[0] <= ratio <= RATIO_OK[1]
    return {"r": round(r, 3), "ratio": round(ratio, 3), "scale": 1.0 if ok else round(ratio, 3), "n_weeks": len(w),
            "weeks": [[d.date().isoformat(), round(a, 1), round(b, 1)] for d, a, b in w[["date", "rain_cchain", "rain_om"]].itertuples(index=False)]}


def main() -> None:
    p = pd.read_parquet(PROCESSED / "panel.parquet")
    cchain = p[(p.city == ILOILO) & (p.year >= 2008)][["date", "rain"]]
    om = weekly_rain(archive())[["date", "rain"]]
    res = compare(cchain, om)
    with atomic(MODELS / "rain_scale.json") as tmp:
        tmp.write_text(json.dumps(res))
    print(f"r={res['r']} ratio={res['ratio']} -> scale {res['scale']} ({res['n_weeks']} weeks)")


if __name__ == "__main__":
    main()
