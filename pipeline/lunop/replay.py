"""Per-event replay bundles -> web/public/data/replay/*.json.

Each bundle replays one Iloilo heavy-rain event chosen by modeling/evaluate.py: weekly bulletins
from the leave-one-event-out model (so the event is out of sample), observed cases, daily rain per
barangay for the map, and simulated flood reports. Simulated reports are labelled as such and
never enter the database.
"""
import json
import uuid

import geopandas as gpd
import numpy as np
import pandas as pd
import shapely

from lunop.config import EVENT_WINDOW, ILOILO, ILOILO_PSGC, INTERIM, MODELS, PROCESSED, SEED, WEB_DATA
from lunop.dataset import atomic, read_raw, save
from lunop.modeling.evaluate import fit_variants
from lunop.modeling.forecast import bulletin, forecasts

OUT = WEB_DATA / "replay"
DEPTHS = ("ankle", "knee", "waist", "chest")
# Simulated reports: a day at or above FLOOD_MM brings Poisson(rain / MM_PER_REPORT) reports, at most
# MAX_REPORTS, and the depth mix moves from LIGHT to HEAVY as rain approaches HEAVY_MM.
FLOOD_MM, HEAVY_MM, MM_PER_REPORT, MAX_REPORTS = 30, 100, 4, 60
LIGHT, HEAVY = np.array([0.5, 0.3, 0.15, 0.05]), np.array([0.15, 0.35, 0.32, 0.18])
P_WADED = 0.6


def brgy_daily_rain() -> pd.DataFrame:
    """Iloilo barangay x day rain (mm), cached in data/interim/."""
    out = INTERIM / "iloilo_brgy_daily_rain.parquet"
    if out.exists():
        return pd.read_parquet(out)
    chunks = read_raw("climate_atmosphere", usecols=["adm4_pcode", "date", "pr"], parse_dates=["date"], chunksize=1_000_000)
    d = pd.concat(c[c.adm4_pcode.str.startswith(ILOILO_PSGC[:8])] for c in chunks)
    d = d.rename(columns={"adm4_pcode": "psgc", "pr": "rain"}).sort_values(["psgc", "date"], ignore_index=True)
    save(d, out)
    return d


def outcome(e: dict) -> str:
    alert = e["level"]["with_cases"] in ("High", "Severe")
    return {(True, True): "hit", (False, True): "miss", (True, False): "false alarm", (False, False): "quiet"}[(alert, e["surge"])]


def random_point(poly, rng) -> tuple[float, float]:
    x0, y0, x1, y1 = poly.bounds
    while True:
        x, y = rng.uniform(x0, x1), rng.uniform(y0, y1)
        if poly.contains(shapely.Point(x, y)):
            return round(y, 5), round(x, 5)


def reports(days: pd.DataFrame, rain: pd.DataFrame, brgy: gpd.GeoDataFrame, rng) -> list[dict]:
    """Simulated flood reports for days with city rain >= FLOOD_MM.

    Barangays are drawn in proportion to hazard x population x that day's barangay rain; depth
    deepens with rain; each report gets its own ip_hash, as if from a different phone.
    """
    exposure = brgy.set_index("psgc").eval("hazard_pct * pop")
    geom = brgy.set_index("psgc").geometry
    out = []
    for day in days[days.rain >= FLOOD_MM].itertuples():
        w = exposure * rain.loc[day.date].reindex(exposure.index).fillna(0)
        if w.sum() == 0:
            continue
        mix = LIGHT + (HEAVY - LIGHT) * min(1, (day.rain - FLOOD_MM) / (HEAVY_MM - FLOOD_MM))
        for _ in range(min(MAX_REPORTS, rng.poisson(day.rain / MM_PER_REPORT))):
            psgc = rng.choice(w.index, p=(w / w.sum()).to_numpy())
            lat, lon = random_point(geom[psgc], rng)
            seen = day.date + pd.Timedelta(hours=float(rng.uniform(6, 30)))  # that day or the next morning
            out.append({
                "client_id": str(uuid.UUID(bytes=rng.bytes(16), version=4)),
                "observed_at": seen.strftime("%Y-%m-%dT%H:%M:00+08:00"),
                "lat": lat, "lon": lon, "psgc": psgc,
                "depth": DEPTHS[rng.choice(len(DEPTHS), p=mix / mix.sum())],
                "duration_h": round(float(1 + rng.exponential(3)), 1),
                "waded": bool(rng.random() < P_WADED),
                "ip_hash": f"sim-{len(out)}",
                "simulated": True,
            })
    return out


def bundle(e: dict, panel: pd.DataFrame, models: dict, thresholds: dict, cut: dict, rain: pd.DataFrame,
           brgy: gpd.GeoDataFrame) -> dict:
    date = pd.Timestamp(e["date"])
    start, end = (date + pd.Timedelta(weeks=k) for k in EVENT_WINDOW)
    il = panel[panel.city == ILOILO]
    f = forecasts(panel, "with_cases", models["with_cases"], models["seasonal"], cut)
    f = f[f.city == ILOILO]
    city_daily = rain.groupby("date").rain.mean()
    bulletins = []
    for t in pd.date_range(start - pd.Timedelta(weeks=1), end - pd.Timedelta(weeks=1), freq="W-MON"):
        ft = f[f.date == t]
        if ft.expected.notna().all() and len(ft):
            bulletins.append(bulletin(ft, thresholds["with_cases"], il, city_daily, "with_cases"))
    days = pd.DataFrame({"date": pd.date_range(start, end + pd.Timedelta(days=6))})
    days["rain"] = days.date.map(city_daily).round(1)
    by_day = rain.pivot(index="date", columns="psgc", values="rain")
    psgc = sorted(brgy.psgc)
    base = f[f.h == 1].set_index("target_date").baseline
    weeks = il[il.date.between(start, end)]
    return {
        "event_id": e["event_id"], "date": e["date"], "outcome": outcome(e),
        "title": f"Week of {date:%b} {date.day}, {date.year}",
        "rain_week_mm": e["rain"], "rain_clim_mm": e["rain_clim"],
        "actual": [{"week_start": r.date.date().isoformat(), "cases": None if pd.isna(r.cases) else int(r.cases),
                    "baseline": None if pd.isna(base.get(r.date)) else round(float(base[r.date]), 1)} for r in weeks.itertuples()],
        "bulletins": bulletins,
        "days": [{"date": r.date.date().isoformat(), "rain": r.rain} for r in days.itertuples()],
        "psgc": psgc,
        "rain_brgy": by_day.reindex(index=days.date, columns=psgc).round(1).to_numpy().tolist(),
        "reports": reports(days, by_day, brgy, np.random.default_rng([SEED, int(date.strftime("%Y%m%d"))])),
    }


def main() -> None:
    perf = json.loads((WEB_DATA / "performance.json").read_text())
    model = json.loads((MODELS / "model.json").read_text())
    thresholds = json.loads((MODELS / "thresholds.json").read_text())
    alpha = {v: {int(h): m["alpha"] for h, m in hs.items()} for v, hs in model["models"].items()}
    panel = pd.read_parquet(PROCESSED / "panel.parquet")
    brgy = gpd.read_file(WEB_DATA / "barangays.geojson")
    rain = brgy_daily_rain()
    events = pd.read_parquet(PROCESSED / "events.parquet").set_index("event_id")
    by_id = {e["event_id"]: e for e in perf["loeo"]["by_event"]}
    index = []
    for event_id in perf["replay_events"]:
        e, w = by_id[event_id], events.loc[event_id]
        drop = lambda x, w=w: (x.city == ILOILO) & x.target_date.between(w.window_start, w.window_end)
        # the same LOEO refit as evaluate; model.json has no `cases` model, which replay doesn't show
        models = fit_variants(panel, drop=drop, alpha={**alpha, "cases": alpha["with_cases"]})
        b = bundle(e, panel, models, thresholds, model["p95"], rain, brgy)
        with atomic(OUT / f"{event_id}.json") as tmp:
            tmp.write_text(json.dumps(b, separators=(",", ":"), ensure_ascii=False))
        index.append({k: b[k] for k in ("event_id", "date", "title", "outcome", "rain_week_mm")})
        print(f"{event_id}: {b['outcome']}, {len(b['bulletins'])} bulletins, {len(b['reports'])} simulated reports")
    with atomic(OUT / "index.json") as tmp:
        tmp.write_text(json.dumps(index, indent=1))


if __name__ == "__main__":
    main()
