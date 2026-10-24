"""Back-test, event study, LOEO and Zamboanga check -> performance.json, reports/backtest.md.

Also writes models/thresholds.json (alert levels tuned on the back-test) for predict and replay.
"""
import json

import numpy as np
import pandas as pd
from scipy import stats

from lunop.config import (
    EVENT_WINDOW, EXTERNAL, HORIZONS, ILOILO, MODELS, PROCESSED, TRAIN_START_YEAR, REPORTS, SEED, TRAIN_END_YEAR, WEB_DATA,
)
from lunop.dataset import atomic, weekly_rain
from lunop.features import design, features
from lunop.modeling.forecast import LEVELS, forecasts, issue
from lunop.modeling.train import fit, mean, p95, window

TEST = (TRAIN_END_YEAR + 1, None)  # 2018-2022
LEVEL_RATE = {"Elevated": 0.15, "High": 0.05, "Severe": 0.01}  # share of Iloilo test weeks at or above each level
SURGE = 1.5  # observed / baseline over weeks +1..+4 that counts as a surge
SENDONG = (["Cagayan de Oro City", ILOILO], (2011, 2012))
T0 = TRAIN_START_YEAR
BOOTSTRAP = 2000


def deviance(y, mu) -> float:
    """Mean Poisson unit deviance."""
    y, mu = np.asarray(y, float), np.asarray(mu, float)
    return float(np.mean(2 * (np.where(y > 0, y * np.log(np.where(y > 0, y, 1) / mu), 0) - (y - mu))))


def scores(t: pd.DataFrame, mu) -> dict:
    """Deviance and MAE, all cities and Iloilo."""
    il = (t.city == ILOILO).to_numpy()
    mu = np.asarray(mu)
    return {"deviance": deviance(t.y, mu), "mae": float(np.abs(t.y - mu).mean()),
            "deviance_iloilo": deviance(t.y[il], mu[il]), "mae_iloilo": float(np.abs(t.y[il] - mu[il]).mean())}


def live_panel(panel: pd.DataFrame, scale: float) -> pd.DataFrame:
    """The panel with Iloilo's rain replaced by scaled Open-Meteo archive rain, as the live model sees it."""
    om = weekly_rain(pd.read_parquet(EXTERNAL / "openmeteo_iloilo_daily.parquet")).set_index("date").rain * scale
    p = panel.copy()
    il = (p.city == ILOILO) & p.date.isin(om.index)
    p.loc[il, "rain"] = p.loc[il, "date"].map(om).to_numpy()
    return p


def with_extra(x: pd.DataFrame, extra: str | None) -> pd.DataFrame:
    """Ablation column: an Iloilo-specific rain slope (TRD 5.1)."""
    if extra == "iloilo_rain":
        x = x.assign(iloilo_rain=x.filter(like="rain_l").sum(axis=1) * (x.city == ILOILO))
    return x


# name: (variant, first training year, extra column, drop Sendong-era weeks, Open-Meteo rain for Iloilo at test)
BACKTEST = {
    "seasonal": ("seasonal", T0, None, False, False),
    "seasonal + recent cases": ("cases", T0, None, False, False),
    "with_cases": ("with_cases", T0, None, False, False),
    "rain_only": ("rain_only", T0, None, False, False),
    "rain_only, Open-Meteo rain": ("rain_only", T0, None, False, True),
    "with_cases + Iloilo rain slope": ("with_cases", T0, "iloilo_rain", False, False),
    "seasonal, from 2008": ("seasonal", None, None, False, False),
    "with_cases, from 2008": ("with_cases", None, None, False, False),
    "with_cases, from 2008, no Sendong-era weeks": ("with_cases", None, None, True, False),
    "rain_only, from 2008": ("rain_only", None, None, False, False),
}


def backtest(panel: pd.DataFrame, live: pd.DataFrame) -> list[dict]:
    """Fit on target years up to TRAIN_END_YEAR, score 2018-2022, on the rows every model can forecast."""
    rows = []
    for h in HORIZONS:
        full = design(panel, h, "with_cases")
        test = window(full.dropna(subset=["y", *features(full)]), *TEST).index
        for name, (v, start, extra, no_sendong, om) in BACKTEST.items():
            x = with_extra(design(panel, h, v), extra)
            tr = window(x, start, TRAIN_END_YEAR)
            if no_sendong:
                cities, years = SENDONG
                tr = tr[~(tr.city.isin(cities) & tr.target_date.dt.year.between(*years))]
            m = fit(tr)
            t = with_extra(design(live, h, v), extra) if om else x
            t = t.loc[test]
            rows.append({"h": h, "model": name, **scores(t, mean(m, t))})
    return rows


VARIANTS = ("with_cases", "rain_only", "cases", "seasonal")


def fit_variants(panel: pd.DataFrame, end=None, drop=None, alpha=None) -> dict:
    """{variant: {h: model}} from TRAIN_START_YEAR. drop: mask over design rows to exclude; alpha: fixed per model."""
    out = {}
    for v in VARIANTS:
        for h in HORIZONS:
            x = design(panel, h, v)
            x = window(x if drop is None else x[~drop(x)], T0, end)
            out.setdefault(v, {})[h] = fit(x, alpha[v][h] if alpha else None)
    return out


def tune(panel: pd.DataFrame, models: dict, cut: dict) -> tuple[dict, dict]:
    """Thresholds per variant so each level fires in LEVEL_RATE of Iloilo test weeks; plus weekly alert stats."""
    thresholds, weekly = {}, {}
    for v in ("rain_only", "with_cases"):
        f = forecasts(panel, v, models[v], models["seasonal"], cut)
        f = f[(f.city == ILOILO) & (f.date.dt.year >= TEST[0])].dropna(subset=["expected"])
        ratio = f.groupby("date").ratio.max()
        th = {lv: round(float(ratio.quantile(1 - rate)), 2) for lv, rate in LEVEL_RATE.items()}
        thresholds[v] = th
        a = issue(f, th).set_index("date")
        surge = surges(f).reindex(a.index)
        weekly[v] = {
            "weeks": len(a), "share": a.level.value_counts(normalize=True).reindex(LEVELS, fill_value=0).round(3).to_dict(),
            **confusion(a.level, surge),
        }
    return thresholds, weekly


def surges(f: pd.DataFrame) -> pd.Series:
    """Per origin week: observed / baseline over horizons 1..4 >= SURGE (NaN if any week unobserved)."""
    g = f.groupby("date")
    obs, base = g.y.sum(min_count=len(HORIZONS)), g.baseline.sum()
    return (obs / base >= SURGE).where(obs.notna())


def confusion(level: pd.Series, surge: pd.Series) -> dict:
    """Hit rate and false-alarm share at Elevated+ and High+."""
    ok = surge.notna() & level.notna()
    level, surge = level[ok], surge[ok].astype(bool)
    out = {"surges": int(surge.sum())}
    for name, lv in (("elevated", "Elevated"), ("high", "High")):
        alert = level.map(LEVELS.index) >= LEVELS.index(lv)
        out[f"hit_rate_{name}"] = round(float(alert[surge].mean()), 3) if surge.any() else None
        out[f"false_alarm_{name}"] = round(float((~surge[alert]).mean()), 3) if alert.any() else None
    return out


def loeo(panel: pd.DataFrame, events: pd.DataFrame, full: dict, thresholds: dict, cut: dict) -> list[dict]:
    """Leave-one-event-out over Iloilo's heavy-rain events: refit without the event's window, forecast it."""
    alpha = {v: {h: m["alpha"] for h, m in hs.items()} for v, hs in full.items()}
    out = []
    for e in events[events.city == ILOILO].itertuples():
        drop = lambda x, e=e: (x.city == ILOILO) & x.target_date.between(e.window_start, e.window_end)
        m = fit_variants(panel, drop=drop, alpha=alpha)
        fc = {v: forecasts(panel, v, m[v], m["seasonal"], cut) for v in VARIANTS}
        fc = {v: f[(f.city == ILOILO) & f.target_date.between(e.window_start, e.window_end)] for v, f in fc.items()}
        origin = {v: f[f.date == e.date].sort_values("h") for v, f in fc.items()}
        after = lambda f: f[(f.target_date > e.date) & (f.target_date <= e.date + pd.Timedelta(weeks=6))]
        mae = {v: {h: round(float(after(f[f.h == h]).eval("abs(y - expected)").mean()), 2) for h in HORIZONS}
               for v, f in fc.items()}
        o = origin["with_cases"]
        complete = len(o) == len(HORIZONS) and o[["y", "expected"]].notna().all().all()
        obs_peak = int(o.h[o.y.idxmax()]) if complete else None
        levels = {v: issue(origin[v].dropna(subset=["expected"]), thresholds[v]).level.iloc[0]
                  if origin[v].expected.notna().any() else None for v in ("with_cases", "rain_only")}
        surge = surges(o).iloc[0] if len(o) else np.nan
        out.append({
            "event_id": e.event_id, "date": e.date.date().isoformat(), "rain": round(e.rain), "rain_clim": round(e.rain_clim),
            "surge": None if pd.isna(surge) else bool(surge),
            "surge_ratio": round(float(o.y.sum() / o.baseline.sum()), 2) if len(o) else None,
            "level": levels,
            "peak_error_weeks": None if obs_peak is None else int(o.h[o.expected.idxmax()]) - obs_peak,
            "mae_weeks_1_6": mae,
            "weeks": [
                {"target_date": r.target_date.date().isoformat(), "h": int(r.h), "y": None if pd.isna(r.y) else int(r.y),
                 "expected": round(r.expected, 2), "lo": int(r.lo), "hi": int(r.hi), "baseline": round(r.baseline, 2)}
                for r in fc["with_cases"].itertuples() if not pd.isna(r.expected)
            ],
        })
    return out


def summarize_loeo(rows: list[dict]) -> dict:
    df = pd.DataFrame(rows)
    mae = pd.DataFrame([{"h": h, "model": v, "mae": r["mae_weeks_1_6"][v][h]} for r in rows
                        for v in r["mae_weeks_1_6"] for h in HORIZONS])
    g = mae.groupby(["model", "h"]).mae
    out = {"events": len(df),
           "mae_weeks_1_6": g.mean().round(2).unstack().to_dict("index"),
           "mae_weeks_1_6_median": g.median().round(2).unstack().to_dict("index"),
           "peak_error_abs_mean": round(float(df.peak_error_weeks.dropna().abs().mean()), 2)}
    for v in ("with_cases", "rain_only"):
        lv = df.level.map(lambda d: d[v])
        out[f"alerts_{v}"] = confusion(lv, df.surge)
    return out


def pick_replay(rows: list[dict]) -> list[str]:
    """Two hits (the biggest surges alerted at High+) and one miss or false alarm, from with_cases LOEO.

    Events closer together than one LOEO window are the same storm, so only the first counts.
    """
    df = pd.DataFrame(rows).dropna(subset=["surge"])
    df = df[df.level.map(lambda d: d["with_cases"] is not None)]
    df["date"] = pd.to_datetime(df.date)
    high = df.level.map(lambda d: LEVELS.index(d["with_cases"]) >= LEVELS.index("High"))
    span = pd.Timedelta(weeks=EVENT_WINDOW[1] - EVENT_WINDOW[0])
    picked = []

    def take(cands: pd.DataFrame, n: int) -> None:
        for r in cands.itertuples():
            if n and all(abs(r.date - p.date) > span for p in picked):
                picked.append(r)
                n -= 1

    take(df[high & df.surge].sort_values("surge_ratio", ascending=False), 2)
    take(pd.concat([df[~high & df.surge].sort_values("surge_ratio", ascending=False),
                    df[high & ~df.surge].sort_values("surge_ratio")]), 1)
    return [p.event_id for p in picked]


def event_study(panel: pd.DataFrame, events: pd.DataFrame) -> dict:
    """Observed / seasonal expectation at weeks -2..+6 around each heavy-rain week.

    The seasonal model is fitted on every year (in-sample), so pre-2013 events have their own norm.
    """
    x = design(panel, 1, "seasonal")
    seasonal = fit(x)
    s = panel.sort_values(["city", "date"], ignore_index=True)
    s["expected"] = mean(seasonal, x)
    s = s.set_index(["city", "date"])
    out = {}
    for scope, ev in (("all", events), (ILOILO, events[events.city == ILOILO])):
        curve = {}
        for k in range(-2, 7):
            idx = list(zip(ev.city, ev.date + pd.Timedelta(weeks=k)))
            w = s.reindex(idx).dropna(subset=["cases"])
            curve[k] = round(float(w.cases.sum() / w.expected.sum()), 2)
        out[scope] = {"events": len(ev), "ratio": curve}
    return out


def lag_curve(model: dict) -> list[dict]:
    """Rate ratio per log unit of rain at each lag, with 95% CI."""
    return [{"lag": int(k.removeprefix("rain_l")), "rr": round(np.exp(b), 3),
             "lo": round(np.exp(b - 1.96 * model["se"][k]), 3), "hi": round(np.exp(b + 1.96 * model["se"][k]), 3)}
            for k, b in model["coef"].items() if k.startswith("rain_l")]


def zamboanga() -> dict:
    """Spearman rho of hazard (and hazard x population) against the barangay case rate, bootstrap 95% CI.

    *_net_pop: partial rank correlation controlling for population, which alone tracks the rate.
    """
    b = pd.read_parquet(PROCESSED / "zamboanga_brgy.parquet")
    b["score"] = b.hazard_pct / 100 * b["pop"]
    rng = np.random.default_rng(SEED)
    boot = [rng.integers(0, len(b), len(b)) for _ in range(BOOTSTRAP)]

    def resid(y, x):
        return y - np.polyval(np.polyfit(x, y, 1), x)

    def net_pop(d: pd.DataFrame, col: str) -> float:
        r = d[[col, "rate", "pop"]].rank()
        return stats.pearsonr(resid(r[col], r["pop"]), resid(r.rate, r["pop"])).statistic

    def ci(f) -> dict:
        lo, hi = np.nanpercentile([f(b.iloc[i]) for i in boot], [2.5, 97.5])
        return {"rho": round(float(f(b)), 3), "lo": round(float(lo), 3), "hi": round(float(hi), 3)}

    out = {"barangays": len(b), "cases": int(b.cases.sum())}
    for col in ("hazard_pct", "hazard_25yr", "pop", "score"):
        out[col] = ci(lambda d, col=col: stats.spearmanr(d[col], d.rate).statistic)
    for col in ("hazard_pct", "hazard_25yr"):
        out[f"{col}_net_pop"] = ci(lambda d, col=col: net_pop(d, col))
    return out


def report(perf: dict) -> str:
    """reports/backtest.md: the tables a reviewer needs, no figures."""
    bt = pd.DataFrame(perf["backtest"])
    piv = lambda col: bt.pivot(index="model", columns="h", values=col).reindex(list(BACKTEST)).round(3).to_markdown()
    lo = perf["loeo"]
    ev = pd.DataFrame([{"event": r["event_id"], "rain": r["rain"], "surge ratio": r["surge_ratio"],
                        "with_cases": r["level"]["with_cases"], "rain_only": r["level"]["rain_only"],
                        "peak error (wk)": r["peak_error_weeks"]} for r in lo["by_event"]])
    z = pd.DataFrame(perf["zamboanga"]).drop(columns=["barangays", "cases"], errors="ignore").T
    return "\n\n".join([
        "# Back-test\n\nGenerated by `lunop.modeling.evaluate`. Train on target years 2013–2017 unless marked, test 2018–2022.",
        "## Poisson deviance, Iloilo\n\n" + piv("deviance_iloilo"),
        "## Poisson deviance, all 12 cities\n\n" + piv("deviance"),
        "## MAE, Iloilo (cases/week)\n\n" + piv("mae_iloilo"),
        "## Alert thresholds (max ratio over weeks +1..+4)\n\n" + pd.DataFrame(perf["thresholds"]).T.to_markdown(),
        "## Weekly alerts, Iloilo 2018–2022\n\n" + pd.DataFrame(perf["alerts_weekly"]).T.to_markdown(),
        f"## Leave-one-event-out, Iloilo ({lo['summary']['events']} events)\n\n"
        "MAE over weeks +1..+6 after the heavy-rain week, mean over events (the 2011 outbreak dominates):\n\n"
        + pd.DataFrame(lo["summary"]["mae_weeks_1_6"]).T.to_markdown()
        + "\n\nMedian over events:\n\n" + pd.DataFrame(lo["summary"]["mae_weeks_1_6_median"]).T.to_markdown()
        + f"\n\nMean absolute peak-timing error: {lo['summary']['peak_error_abs_mean']} weeks.\n\n"
        + ev.to_markdown(index=False)
        + "\n\nAlerts at the event week:\n\n"
        + pd.DataFrame({v: lo["summary"][f"alerts_{v}"] for v in ("with_cases", "rain_only")}).T.to_markdown()
        + f"\n\nReplay events: {', '.join(perf['replay_events'])}",
        "## Event study (observed ÷ seasonal)\n\n" + pd.DataFrame({k: v["ratio"] for k, v in perf["event_study"].items()}).T.to_markdown(),
        "## Rain check (Iloilo weekly, CCHAIN vs Open-Meteo)\n\n"
        + f"r = {perf['rain_check']['r']}, ratio of means = {perf['rain_check']['ratio']}, scale = {perf['rain_check']['scale']}",
        f"## Zamboanga barangay check ({perf['zamboanga']['barangays']} barangays, {perf['zamboanga']['cases']} cases)\n\n"
        "Spearman ρ against cases per 100k per year, bootstrap 95% CI. hazard_pct is the NOAH 100-yr layer (any level), "
        "hazard_25yr the 25-yr medium + high layer; *_net_pop controls for population:\n\n" + z.to_markdown(),
    ]) + "\n"


def main() -> None:
    panel = pd.read_parquet(PROCESSED / "panel.parquet")
    events = pd.read_parquet(PROCESSED / "events.parquet")
    deployed = json.loads((MODELS / "model.json").read_text())
    check = json.loads((MODELS / "rain_scale.json").read_text())

    bt = backtest(panel, live_panel(panel, check["scale"]))
    print("backtest done")
    val = fit_variants(panel, end=TRAIN_END_YEAR)
    thresholds, weekly = tune(panel, val, p95(panel, TRAIN_START_YEAR, TRAIN_END_YEAR))
    full = fit_variants(panel)
    cut = deployed["p95"]
    by_event = loeo(panel, events, full, thresholds, cut)
    print("loeo done")
    perf = {
        "data_end": deployed["data_end"],
        "backtest": [{k: round(v, 3) if isinstance(v, float) else v for k, v in r.items()} for r in bt],
        "thresholds": thresholds,
        "alerts_weekly": weekly,
        "loeo": {"summary": summarize_loeo(by_event), "by_event": by_event},
        "replay_events": pick_replay(by_event),
        "event_study": event_study(panel, events),
        "lag_curve": {v: lag_curve(deployed["models"][v]["1"]) for v in ("rain_only", "with_cases")},
        "rain_check": check,
        "zamboanga": zamboanga(),
    }
    with atomic(MODELS / "thresholds.json") as tmp:
        tmp.write_text(json.dumps(thresholds, indent=1))
    with atomic(WEB_DATA / "performance.json") as tmp:
        tmp.write_text(json.dumps(perf, separators=(",", ":")))
    with atomic(REPORTS / "backtest.md") as tmp:
        tmp.write_text(report(perf))
    print(report(perf))


if __name__ == "__main__":
    main()
