"""Paths and constants shared by every pipeline stage."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # repo root
PIPELINE = ROOT / "pipeline"

DATA = ROOT / "data"
RAW = DATA / "raw"  # CCHAIN tables as downloaded, never edited
INTERIM = DATA / "interim"  # caches, e.g. city daily rain
PROCESSED = DATA / "processed"  # model-ready tables
EXTERNAL = DATA / "external"  # non-CCHAIN sources, e.g. Open-Meteo archive

MODELS = PIPELINE / "models"  # model.json
REPORTS = PIPELINE / "reports"  # backtest.md, figures
WEB_DATA = ROOT / "web" / "public" / "data"  # static JSON served by the app

ILOILO = "Iloilo City"
ILOILO_PSGC = "PH063022000"
ZAMBOANGA = "Zamboanga City"

SEED = 42
RAIN_LAGS = range(9)  # weeks 0..8
HORIZONS = (1, 2, 3, 4)
TRAIN_END_YEAR = 2017  # fit 2008-2017, validate 2018-2022
CLIM_START_YEAR = 2003  # rain climatology uses 2003..TRAIN_END_YEAR, so it never sees validation years
LEVEL_WEEKS = 52  # trailing window for level_c
EVENT_QUANTILE = 0.98  # top-2% rain weeks per city
