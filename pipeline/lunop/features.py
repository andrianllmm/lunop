"""Design matrices for the forecast model."""
import pandas as pd


def design(panel: pd.DataFrame, h: int, variant: str) -> pd.DataFrame:
    """One row per city x forecast origin week t, with target cases[t+h].

    Features: woy harmonics of t+h, log1p(rain[t+h-k]) for k in RAIN_LAGS, and for the
    `with_cases` variant log1p(cases[t]) and level_c. Lags are taken by date, so no
    feature sees data after week t except the forecast-rain window.
    """
    raise NotImplementedError
