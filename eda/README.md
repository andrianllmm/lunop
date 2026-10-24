# EDA

Exploratory analysis of leptospirosis, rainfall and flood hazard in the 12 CCHAIN cities.

Read the notebooks in order: open the `.ipynb` on GitHub or in Jupyter, or open `reports/*.html` in a browser.

| Notebook                                     | Question                                      |
| -------------------------------------------- | --------------------------------------------- |
| [01 · Data overview](01_data_overview.ipynb) | What data do we have, and is it clean?        |
| [02 · Cases](02_cases.ipynb)                 | Where and when do leptospirosis cases happen? |
| [03 · Rain vs cases](03_rain_vs_cases.ipynb) | Does heavy rain lead to more cases, and when? |
| [04 · Barangay](04_barangay.ipynb)           | Does flood hazard point to where cases are?   |

## Findings

The summary of findings, implications and open issues is in [`docs/FINDINGS.md`](../docs/FINDINGS.md).

## Running

```sh
python scripts/download.py          # from repo root; fetches CCHAIN into data/raw/ (~580 MB)
cd eda
uv sync
uv run jupyter lab                   # .py and .ipynb are paired; edit either
```

To re-run everything and regenerate the reports:

```sh
for n in 0*.py; do
  uv run jupytext --to ipynb --execute "$n"
  uv run jupyter nbconvert --to html "${n%.py}.ipynb" --output-dir reports
done
```

`common.py` holds the shared loaders (`panel()` is the city-week table of cases and rain) and the plot style.
