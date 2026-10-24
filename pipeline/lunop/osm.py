"""OpenStreetMap context layers for the Iloilo map: health facilities and waterways.

Context only, never scored (PRD §2). Fetched once; the Overpass pull is cached in data/external/.

Outputs (web/public/data/):
- facilities.geojson: named hospitals, district health centers and barangay health stations (BHS),
  plus a `nearest` lookup per barangay psgc. OSM has only a fraction of the BHS, so the UI labels them partial.
- waterways.geojson: rivers, streams, canals and drains (the kinds behind `water_dist_m`)
"""
import json
import re
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import geopandas as gpd
import pandas as pd
import shapely

from lunop.config import EXTERNAL, WEB_DATA
from lunop.dataset import SIMPLIFY_DEG, atomic, save_geojson

OVERPASS = "https://overpass-api.de/api/interpreter"
UTM = "EPSG:32651"  # metres, for distances in Iloilo
KINDS = ("hospital", "health_center", "bhs")
WATERWAYS = ("river", "stream", "canal", "drain")
NOT_HUMAN = re.compile(r"\b(pet|veterinary|animal)\b", re.I)


def fetch(bbox: tuple[float, float, float, float]) -> list[dict]:
    """Overpass elements for health facilities and waterways inside (west, south, east, north)."""
    out = EXTERNAL / "osm_iloilo.json"
    if out.exists():
        return json.loads(out.read_text())
    w, s, e, n = bbox
    b = f"({s},{w},{n},{e})"
    q = f"""[out:json][timeout:120];
    (nwr["amenity"~"^(hospital|clinic|doctors|health_post)$"]{b}; nwr["healthcare"]{b};);
    out tags center;
    way["waterway"~"^({'|'.join(WATERWAYS)})$"]{b};
    out tags geom;"""
    # overpass-api.de refuses requests without a User-Agent
    req = Request(OVERPASS, data=urlencode({"data": q}).encode(), headers={"User-Agent": "lunop-pipeline"})
    with urlopen(req, timeout=180) as r:
        elements = json.load(r)["elements"]
    with atomic(out) as tmp:
        tmp.write_text(json.dumps(elements))
    return elements


def kind(tags: dict) -> str | None:
    """hospital, health_center (city district health centers), bhs, or None for anything else."""
    name = tags.get("name", "")
    if not name or NOT_HUMAN.search(name):
        return None
    if tags.get("amenity") == "hospital" or tags.get("healthcare") == "hospital":
        return "hospital"
    if re.search(r"district health cent", name, re.I):
        return "health_center"
    if tags.get("amenity") == "health_post" or re.search(r"barangay health|health station", name, re.I):
        return "bhs"
    return None


def facilities(elements: list[dict], city) -> gpd.GeoDataFrame:
    """Named facilities inside `city`, one per (kind, name); ways and relations use their center."""
    rows = []
    for el in elements:
        k = kind(el.get("tags", {}))
        pt = el if el["type"] == "node" else el.get("center")
        if k and pt:
            rows.append({"name": el["tags"]["name"].strip(), "kind": k, "geometry": shapely.Point(pt["lon"], pt["lat"])})
    f = gpd.GeoDataFrame(rows, columns=["name", "kind", "geometry"], crs="EPSG:4326")
    f = f[f.within(city)].drop_duplicates(["kind", "name"])
    return f.sort_values(["kind", "name"], ignore_index=True)


def waterways(elements: list[dict], city) -> gpd.GeoDataFrame:
    rows = [{"name": el["tags"].get("name"), "kind": el["tags"]["waterway"],
             "geometry": shapely.LineString([(p["lon"], p["lat"]) for p in el["geometry"]])}
            for el in elements if el["type"] == "way" and el.get("tags", {}).get("waterway") in WATERWAYS]
    w = gpd.GeoDataFrame(rows, columns=["name", "kind", "geometry"], crs="EPSG:4326").clip(city)
    w["geometry"] = shapely.simplify(w.geometry, SIMPLIFY_DEG)
    return w[~w.is_empty].sort_values(["kind", "name"], ignore_index=True)


def nearest(barangays: gpd.GeoDataFrame, fac: gpd.GeoDataFrame) -> dict[str, dict]:
    """Per psgc: the facility nearest the barangay's centroid, with the straight-line distance in metres."""
    centroids = barangays[["psgc", "geometry"]].to_crs(UTM)
    centroids["geometry"] = centroids.centroid
    j = gpd.sjoin_nearest(centroids, fac.to_crs(UTM), distance_col="dist_m").drop_duplicates("psgc")
    return {r.psgc: {"name": r["name"], "kind": r.kind, "dist_m": int(round(r.dist_m, -1))} for _, r in j.iterrows()}


def save_facilities(fac: gpd.GeoDataFrame, near: dict, path) -> None:
    """GeoJSON with `nearest` as a foreign member, which geopandas can't write."""
    fc = json.loads(fac.to_json(drop_id=True))
    for f in fc["features"]:
        f["geometry"]["coordinates"] = [round(c, 5) for c in f["geometry"]["coordinates"]]
    fc["nearest"] = near
    with atomic(path) as tmp:
        tmp.write_text(json.dumps(fc, ensure_ascii=False, separators=(",", ":")))
    counts = fac.kind.value_counts().reindex(KINDS, fill_value=0).to_dict()
    print(f"wrote {path.name} ({counts}, {path.stat().st_size / 1e3:.0f} kB)")


def main() -> None:
    b = gpd.read_file(WEB_DATA / "barangays.geojson")
    city = shapely.union_all(b.geometry)
    elements = fetch(tuple(b.total_bounds))
    fac = facilities(elements, city)
    save_facilities(fac, nearest(b, fac), WEB_DATA / "facilities.geojson")
    save_geojson(waterways(elements, city), WEB_DATA / "waterways.geojson")


if __name__ == "__main__":
    main()
