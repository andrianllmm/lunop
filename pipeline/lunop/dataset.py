"""Fetch CCHAIN tables from HDX into data/raw/, then build model-ready tables.

Usage: python -m lunop.dataset [download|verify|build]   (default: all, in order)
"""
import hashlib
import sys
from contextlib import contextmanager
from pathlib import Path
from urllib.request import urlretrieve

import numpy as np
import pandas as pd

from lunop.config import (
    CLIM_START_YEAR, EVENT_QUANTILE, EVENT_WINDOW, INTERIM, LEVEL_WEEKS, PIPELINE, PROCESSED, RAW, TRAIN_END_YEAR,
    ZAMBOANGA, ZAMBOANGA_BRGY_SOURCE,
)

CHECKSUMS = PIPELINE / "raw.sha256"  # sha256sum format; pins the exact HDX snapshot

BASE = "https://data.humdata.org/dataset/5b580664-365e-4d7e-b5e5-2990df8f12a5/resource"
TABLES = {
    "location": "31a3dddb-decc-4fd7-a0f7-acff922a7a76",
    "disease_pidsr_totals": "b93c1427-797a-40a4-b99e-872e152d1c86",
    "disease_lgu_disaggregated_totals": "1f10c8ee-37a9-40b6-a18a-e8fbe4bb7173",
    "project_noah_hazards": "b767e99d-8044-4ebb-a68a-0803a8a15c2b",
    "worldpop_population": "53b885f1-c90c-4f79-b618-8af9530366aa",
    "climate_atmosphere": "8bf5b884-77af-4c38-aeee-3380a4d8e029",  # ~570 MB
    "brgy_geography": "56685f81-2ac5-40c0-922a-84f3f996be5b",
    "geoportal_doh_poi_health": "3ca89d0e-3671-4f63-8dff-9af3e05b93cc",
    "mapbox_health_facility_brgy_isochrones": "d8b70ecf-d796-4d0e-a028-04c83904e905",
    "osm_poi_water_body": "8e4b51fc-3b92-4012-b69a-2d23ed454654",
    "google_open_buildings": "107da350-6d50-48cd-b001-d5dcdfaafee7",
}


def download() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    for name, rid in TABLES.items():
        out = RAW / f"{name}.csv"
        if out.exists():
            continue
        print(f"downloading {name}")
        tmp = out.with_suffix(".part")
        urlretrieve(f"{BASE}/{rid}/download/{name}.csv", tmp)
        tmp.rename(out)  # an interrupted download never leaves a truncated CSV


def sha256(path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def verify() -> None:
    """Fail if any raw table differs from the pinned snapshot (HDX can republish in place)."""
    expected = dict(line.split()[::-1] for line in CHECKSUMS.read_text().splitlines())
    bad = [name for name, digest in expected.items() if sha256(RAW / name) != digest]
    if bad:
        raise SystemExit(f"checksum mismatch: {', '.join(bad)}; delete and re-download, or update {CHECKSUMS.name}")


class DataError(ValueError):
    """A raw table broke an assumption the pipeline relies on."""


def check(ok, msg: str) -> None:
    if not ok:
        raise DataError(msg)


@contextmanager
def atomic(path: Path):
    """Yield a temp path next to `path`; move it into place only if the write succeeds."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.stem}.tmp{path.suffix}")
    try:
        yield tmp
        tmp.replace(path)
    finally:
        tmp.unlink(missing_ok=True)


def save(df: pd.DataFrame, path: Path) -> None:
    with atomic(path) as tmp:
        df.to_parquet(tmp, index=False)
    print(f"wrote {path.relative_to(path.parents[2])} ({len(df):,} rows)")


def read_raw(name: str, **kw) -> pd.DataFrame:
    return pd.read_csv(RAW / f"{name}.csv", dtype={"adm3_pcode": str, "adm4_pcode": str}, **kw)


def locations() -> pd.DataFrame:
    """One row per barangay: psgc, name, city, city_psgc, area_km2."""
    loc = read_raw("location").rename(columns={
        "adm4_pcode": "psgc", "adm4_en": "name", "adm3_en": "city", "adm3_pcode": "city_psgc",
        "brgy_total_area": "area_km2",
    })[["psgc", "name", "city", "city_psgc", "area_km2"]]
    check(loc.psgc.is_unique, "location: duplicate barangay codes")
    check(loc.groupby("city").city_psgc.nunique().eq(1).all(), "location: city with several codes")
    return loc


def city_daily_rain(loc: pd.DataFrame) -> pd.DataFrame:
    """Daily rain (mm) per city, the mean over its barangays. Cached in data/interim/.

    One Zamboanga barangay (PH097332095) has no rain at all; the mean skips it.
    """
    out = INTERIM / "city_daily_rain.parquet"
    if out.exists():
        return pd.read_parquet(out)
    c = read_raw("climate_atmosphere", usecols=["adm4_pcode", "date", "pr"], parse_dates=["date"])
    check(not c.duplicated(["adm4_pcode", "date"]).any(), "climate: duplicate barangay-days")
    check(c.pr.dropna().ge(0).all(), "climate: negative rain")
    c["city"] = c.adm4_pcode.map(loc.set_index("psgc").city)
    check(c.city.notna().all(), "climate: barangay not in location")
    d = c.groupby(["city", "date"], as_index=False).pr.mean().rename(columns={"pr": "rain"})
    check(d.rain.notna().all(), "climate: city-day with no rain value")
    save(d, out)
    return d


def weekly_rain(daily: pd.DataFrame) -> pd.DataFrame:
    """Daily -> Monday-start weekly totals. Weeks with fewer than 7 days of data are NaN."""
    week = daily.date - pd.to_timedelta(daily.date.dt.day_of_week, unit="D")
    w = daily.groupby(["city", week.rename("date")]).rain.agg(["sum", "count"]).reset_index()
    w["rain"] = w["sum"].where(w["count"] == 7)
    return w[["city", "date", "rain"]]


def lepto_weekly(loc: pd.DataFrame) -> pd.DataFrame:
    """PIDSR leptospirosis cases, one row per reported city-week."""
    p = read_raw("disease_pidsr_totals", parse_dates=["date"])
    p = p[p.disease_common_name == "LEPTOSPIROSIS"]
    check(not p.duplicated(["adm3_pcode", "date"]).any(), "pidsr: duplicate city-weeks")
    check(p.date.dt.day_of_week.eq(0).all(), "pidsr: week not starting Monday")
    check(p.case_total.notna().all() and p.case_total.ge(0).all(), "pidsr: missing or negative cases")
    city = p.adm3_pcode.map(loc.drop_duplicates("city_psgc").set_index("city_psgc").city)
    check(city.notna().all(), "pidsr: city not in location")
    return pd.DataFrame({"city": city, "date": p.date, "cases": p.case_total.astype(int)})


def woy(date: pd.Series) -> pd.Series:
    """ISO week, with week 53 folded into 52 to match PIDSR's 52-week years."""
    return date.dt.isocalendar().week.astype(int).clip(upper=52)


def panel(cases: pd.DataFrame, rain: pd.DataFrame) -> pd.DataFrame:
    """City x week on the full Monday calendar, from the first full rain week to the last PIDSR week.

    A row shift is always a one-week lag. `cases` is NaN before PIDSR starts (2008) and in the
    two weeks it skips (2012-12-31, 2018-01-01); `rain` is NaN for partial weeks.
    - level_c: mean log1p(cases) over the trailing LEVEL_WEEKS weeks up to and including t.
    - rain_clim: city x woy mean weekly rain over CLIM_START_YEAR..TRAIN_END_YEAR.
    """
    weeks = pd.date_range(rain.date.min(), cases.date.max(), freq="W-MON")
    cities = sorted(cases.city.unique())
    d = pd.MultiIndex.from_product([cities, weeks], names=["city", "date"]).to_frame(index=False)
    d = d.merge(cases, on=["city", "date"], how="left").merge(weekly_rain(rain), on=["city", "date"], how="left")
    d["year"] = d.date.dt.year
    d["woy"] = woy(d.date)
    d["level_c"] = (
        np.log1p(d.cases).groupby(d.city)
        .transform(lambda s: s.rolling(LEVEL_WEEKS, min_periods=LEVEL_WEEKS // 2).mean())
    )
    clim = d[d.year.between(CLIM_START_YEAR, TRAIN_END_YEAR)].groupby(["city", "woy"]).rain.mean()
    d = d.merge(clim.rename("rain_clim").reset_index(), on=["city", "woy"], how="left")
    return d


def check_panel(d: pd.DataFrame, cases: pd.DataFrame) -> None:
    check(not d.duplicated(["city", "date"]).any(), "panel: duplicate city-weeks")
    check(d.groupby("city").date.diff().dropna().eq(pd.Timedelta(weeks=1)).all(), "panel: calendar gap")
    check(d.cases.sum() == cases.cases.sum(), "panel: cases lost in reindex")
    check(d.rain_clim.notna().all(), "panel: woy with no climatology")
    pidsr = d[d.date >= cases.date.min()]
    check(pidsr.rain.isna().sum() <= pidsr.city.nunique(), "panel: rain missing beyond the final partial week")


def events(d: pd.DataFrame) -> pd.DataFrame:
    """Each city's top-(1 - EVENT_QUANTILE) rain weeks within the PIDSR period, with LOEO windows.

    Adjacent heavy weeks stay separate events, so their windows can overlap.
    """
    d = d[d.date >= d.date[d.cases.notna()].min()].dropna(subset=["rain"])
    e = d[d.rain >= d.groupby("city").rain.transform("quantile", EVENT_QUANTILE)]
    e = e[["city", "date", "rain", "rain_clim"]].sort_values(["city", "date"]).reset_index(drop=True)
    lo, hi = EVENT_WINDOW
    e["window_start"] = e.date + pd.Timedelta(weeks=lo)
    e["window_end"] = e.date + pd.Timedelta(weeks=hi)
    e.insert(0, "event_id", e.city.str.replace(" ", "_").str.lower() + "_" + e.date.dt.strftime("%Y-%m-%d"))
    return e


def hazard() -> pd.DataFrame:
    """NOAH 25-yr flood hazard (% of barangay area), 2015 snapshot. hazard_pct = medium + high."""
    n = read_raw("project_noah_hazards").set_index("adm4_pcode")
    h = pd.DataFrame({"hazard_25yr_med": n.pct_area_flood_hazard_25yr_med, "hazard_25yr_high": n.pct_area_flood_hazard_25yr_high})
    check(h.notna().all().all() and h.ge(0).all().all(), "noah: missing or negative hazard")
    h["hazard_pct"] = (h.hazard_25yr_med + h.hazard_25yr_high).clip(upper=100)
    return h


def population(start: int, end: int) -> pd.Series:
    """Mean WorldPop barangay population over start..end (WorldPop ends 2020)."""
    w = read_raw("worldpop_population", parse_dates=["date"])
    check(not w.duplicated(["adm4_pcode", "date"]).any(), "worldpop: duplicate barangay-years")
    check(w.date.dt.year.max() >= end, f"worldpop: no data for {end}")
    return w[w.date.dt.year.between(start, end)].groupby("adm4_pcode").pop_count_total.mean().rename("pop")


def zamboanga_brgy(loc: pd.DataFrame) -> pd.DataFrame:
    """Zamboanga barangays: leptospirosis cases 2013-2022, population, hazard and case rate.

    Barangays with no recorded case get 0. Population is the 2013-2020 mean, since WorldPop ends
    in 2020. rate = cases per 100k people per year.
    """
    lgu = read_raw("disease_lgu_disaggregated_totals", parse_dates=["date"])
    z = lgu[(lgu.disease_common_name == "LEPTOSPIROSIS") & (lgu.source_filename == ZAMBOANGA_BRGY_SOURCE)]
    check(z.adm4_pcode.notna().all(), "zamboanga: case with no barangay")
    b = loc[loc.city == ZAMBOANGA].set_index("psgc")[["name", "area_km2"]]
    check(z.adm4_pcode.isin(b.index).all(), "zamboanga: barangay outside the city")
    years = z.date.dt.year
    b["cases"] = z.groupby("adm4_pcode").case_total.sum().reindex(b.index, fill_value=0).astype(int)
    b = b.join(population(years.min(), 2020)).join(hazard())
    check(b["pop"].gt(0).all(), "zamboanga: barangay with no population")
    b["rate"] = b.cases / b["pop"] * 1e5 / (years.max() - years.min() + 1)
    return b.rename_axis("psgc").reset_index().sort_values("psgc", ignore_index=True)


def build() -> None:
    """Raw CCHAIN -> data/processed/ and web/public/data/barangays.geojson.

    Outputs:
    - panel.parquet: city x week on the full Monday calendar (cases, rain, woy, level_c, rain_clim)
    - events.parquet: top-2% rain weeks per city, with LOEO windows
    - zamboanga_brgy.parquet: barangay cases, population and hazard for the ranking check
    - barangays.geojson: Iloilo polygons with static attributes
    """
    loc = locations()
    cases = lepto_weekly(loc)
    d = panel(cases, city_daily_rain(loc))
    check_panel(d, cases)
    save(d, PROCESSED / "panel.parquet")
    save(events(d), PROCESSED / "events.parquet")
    save(zamboanga_brgy(loc), PROCESSED / "zamboanga_brgy.parquet")


def main() -> None:
    steps = {"download": download, "verify": verify, "build": build}
    for name in sys.argv[1:] or steps:
        steps[name]()


if __name__ == "__main__":
    main()
