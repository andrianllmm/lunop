"""Fit the negative binomial GLM, both variants x horizons 1-4 -> models/model.json."""
import json
from datetime import date

import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy import optimize, stats

from lunop.config import HORIZONS, MODELS, PROCESSED, RAIN_ONLY_START_YEAR, SEED
from lunop.features import VARIANTS, design, features


def matrix(x: pd.DataFrame, cities: list[str], cols: list[str]) -> np.ndarray:
    """One intercept per city, then the feature columns."""
    onehot = (x.city.to_numpy()[:, None] == np.array(cities)[None, :]).astype(float)
    return np.hstack([onehot, x[cols].to_numpy(float)])


def fit(x: pd.DataFrame) -> dict:
    """NB2 GLM; alpha by maximum profile likelihood. Drops rows with a missing target or feature.

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


def fit_all(panel: pd.DataFrame, end_year: int | None = None) -> dict:
    """{variant: {h: model}}, fitted on target weeks up to `end_year` (all if None).

    rain_only starts at RAIN_ONLY_START_YEAR: fitted from 2008 it predicts Iloilo 2018-2022 at
    about twice the observed level, worse than seasonal only.
    """
    out = {}
    for v in VARIANTS:
        for h in HORIZONS:
            x = design(panel, h, v)
            year = x.target_date.dt.year
            keep = year.le(end_year or year.max()) & (year.ge(RAIN_ONLY_START_YEAR) if v == "rain_only" else True)
            out.setdefault(v, {})[h] = fit(x[keep])
    return out


def main() -> None:
    np.random.seed(SEED)
    panel = pd.read_parquet(PROCESSED / "panel.parquet")
    models = fit_all(panel)
    rain_scale = json.loads((MODELS / "rain_scale.json").read_text())["scale"] if (MODELS / "rain_scale.json").exists() else 1.0
    out = {"trained": date.today().isoformat(), "data_end": panel.date[panel.cases.notna()].max().date().isoformat(),
           "rain_scale": rain_scale, "models": {v: {str(h): m for h, m in hs.items()} for v, hs in models.items()}}
    MODELS.mkdir(exist_ok=True)
    (MODELS / "model.json").write_text(json.dumps(out, indent=1))
    for v, hs in models.items():
        print(v, {h: f"alpha={m['alpha']:.2f} n={m['n']}" for h, m in hs.items()})


if __name__ == "__main__":
    main()
