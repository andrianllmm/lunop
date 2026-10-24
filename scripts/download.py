"""Fetch the CCHAIN tables the EDA uses from HDX into data/raw/."""
from pathlib import Path
from urllib.request import urlretrieve

RAW = Path(__file__).resolve().parents[1] / "data" / "raw"
BASE = "https://data.humdata.org/dataset/5b580664-365e-4d7e-b5e5-2990df8f12a5/resource"
TABLES = {
    "location": "31a3dddb-decc-4fd7-a0f7-acff922a7a76",
    "disease_pidsr_totals": "b93c1427-797a-40a4-b99e-872e152d1c86",
    "disease_lgu_disaggregated_totals": "1f10c8ee-37a9-40b6-a18a-e8fbe4bb7173",
    "project_noah_hazards": "b767e99d-8044-4ebb-a68a-0803a8a15c2b",
    "worldpop_population": "53b885f1-c90c-4f79-b618-8af9530366aa",
    "climate_atmosphere": "8bf5b884-77af-4c38-aeee-3380a4d8e029",  # ~570 MB
}


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    for name, rid in TABLES.items():
        out = RAW / f"{name}.csv"
        if out.exists():
            continue
        print(f"downloading {name}")
        urlretrieve(f"{BASE}/{rid}/download/{name}.csv", out)


if __name__ == "__main__":
    main()
