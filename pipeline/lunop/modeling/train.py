"""Fit the negative binomial GLM, both variants x horizons 1-4 -> models/model.json."""
import json

import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy import optimize, stats

from lunop.config import HORIZONS, MODELS, PROCESSED, RAIN_ONLY_START_YEAR
from lunop.dataset import atomic
from lunop.features import design, features

# Deployed variants and the first target year each trains on. rain_only has no level_c, so fitted
# from 2008 it predicts Iloilo 2018-2022 at about twice the observed level (worse than seasonal
# only). seasonal is the live baseline that ratios are taken against, so it shares that window.
DEPLOYED = {"with_cases": None, "rain_only": RAIN_ONLY_START_YEAR, "seasonal": RAIN_ONLY_START_YEAR}


def matrix(x: pd.DataFrame, cities: list[str], cols: list[str]) -> np.ndarray:
    """One intercept per city, then the feature columns."""
    onehot = (x.city.to_numpy()[:, None] == np.array(cities)[None, :]).astype(float)
    return np.hstack([onehot, x[cols].to_numpy(float)])


def fit(x: pd.DataFrame, alpha: float | None = None) -> dict:
    """NB2 GLM; alpha by maximum profile likelihood unless given. Drops rows with a missing target or feature.

    IRLS for the coefficients at each alpha is more stable here than a joint Newton fit.
    """
    cols = features(x)
    x = x.dropna(subset=["y", *cols])
    cities = sorted(x.city.unique())
    y, X = x.y.to_numpy(), matrix(x, cities, cols)

    def glm(a):
        model = sm.GLM(y, X, family=sm.families.NegativeBinomial(alpha=a))
        res = model.fit(maxiter=300, tol=1e-6)
        # IRLS can oscillate at large alpha; Newton from its estimate settles it
        return res if res.converged else model.fit(method="newton", start_params=res.params, maxiter=100, disp=0)

    if alpha is None:
        opt = optimize.minimize_scalar(lambda la: -glm(np.exp(la)).llf, bounds=(-5, 3), method="bounded")
        alpha = float(np.exp(opt.x))
    res = glm(alpha)
    if not (res.converged if hasattr(res, "converged") else res.mle_retvals["converged"]):
        raise RuntimeError("negative binomial fit did not converge")
    beta = res.params
    return {
        "cities": cities, "features": cols,
        "intercepts": dict(zip(cities, beta[: len(cities)].tolist())),
        "coef": dict(zip(cols, beta[len(cities):].tolist())),
        "se": dict(zip(cols, np.asarray(res.bse)[len(cities):].tolist())),
        "alpha": alpha, "n": len(x),
    }


def mean(m: dict, x: pd.DataFrame) -> np.ndarray:
    """Expected cases; NaN where a feature is missing or the city wasn't in the fit."""
    eta = x.city.map(m["intercepts"]).to_numpy(float) + x[m["features"]].to_numpy(float) @ np.array(list(m["coef"].values()))
    return np.exp(eta)


def quantile(m: dict, mu, q: float) -> np.ndarray:
    """q-quantile of NB2(mu, alpha)."""
    n = 1 / m["alpha"]
    return stats.nbinom.ppf(q, n, n / (n + np.asarray(mu)))


def window(x: pd.DataFrame, start: int | None = None, end: int | None = None) -> pd.DataFrame:
    """Rows whose target week falls in start..end (inclusive; None = open)."""
    year = x.target_date.dt.year
    return x[year.ge(start or year.min()) & year.le(end or year.max())]


def fit_all(panel: pd.DataFrame, end: int | None = None) -> dict:
    """{variant: {h: model}} for the DEPLOYED variants, fitted on target years up to `end`."""
    return {v: {h: fit(window(design(panel, h, v), start, end)) for h in HORIZONS} for v, start in DEPLOYED.items()}


def main() -> None:
    panel = pd.read_parquet(PROCESSED / "panel.parquet")
    models = fit_all(panel)
    check = json.loads((MODELS / "rain_scale.json").read_text())  # from lunop.rain_check
    out = {
        "data_end": panel.date[panel.cases.notna()].max().date().isoformat(),
        "rain_scale": check["scale"],  # multiply live Open-Meteo rain by this (TRD 5.5)
        "models": {v: {str(h): m for h, m in hs.items()} for v, hs in models.items()},
    }
    with atomic(MODELS / "model.json") as tmp:
        tmp.write_text(json.dumps(out, indent=1))
    for v, hs in models.items():
        print(v, {h: f"alpha={m['alpha']:.2f} n={m['n']}" for h, m in hs.items()})


if __name__ == "__main__":
    main()
