"""Fetch CCHAIN tables from HDX into data/raw/, then build model-ready tables.

Usage: python -m lunop.dataset [download|verify|build]   (default: all, in order)
"""
import hashlib
import sys
from urllib.request import urlretrieve

from lunop.config import PIPELINE, RAW

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


def build() -> None:
    """Raw CCHAIN -> data/processed/ and web/public/data/barangays.geojson.

    Outputs:
    - panel.parquet: city x week on the full Monday calendar (cases, rain, woy, level_c, rain_clim)
    - events.parquet: top-2% rain weeks per city, with LOEO windows
    - zamboanga_brgy.parquet: barangay cases, population and hazard for the ranking check
    - barangays.geojson: Iloilo polygons with static attributes
    """
    raise NotImplementedError


def main() -> None:
    steps = {"download": download, "verify": verify, "build": build}
    for name in sys.argv[1:] or steps:
        steps[name]()


if __name__ == "__main__":
    main()
