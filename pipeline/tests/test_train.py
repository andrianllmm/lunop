import numpy as np
import pytest

from lunop.config import RAIN_LAGS
from lunop.features import design
from lunop.modeling import train
from tests.test_features import panel


def test_fit_recovers_rain_effect():
    d = panel(n=600, seed=1)
    x = design(d, 1, "rain_only").dropna(subset=["y", *[f"rain_l{k}" for k in RAIN_LAGS]])
    rng = np.random.default_rng(2)
    mu = np.exp(0.5 + 0.4 * x.rain_l3)
    x["y"] = rng.negative_binomial(2, 2 / (2 + mu))  # NB2 with alpha = 0.5
    m = train.fit(x)
    assert m["coef"]["rain_l3"] == pytest.approx(0.4, abs=0.08)
    assert m["alpha"] == pytest.approx(0.5, abs=0.15)


def test_quantiles_bracket_mean():
    m = {"alpha": 1.0}
    lo, hi = train.quantile(m, [5.0], 0.1), train.quantile(m, [5.0], 0.9)
    assert lo[0] < 5 < hi[0]
