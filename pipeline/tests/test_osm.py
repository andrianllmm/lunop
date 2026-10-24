import geopandas as gpd
import pytest
import shapely

from lunop.osm import facilities, kind, nearest, waterways


@pytest.mark.parametrize("tags, expected", [
    ({"amenity": "hospital", "name": "Western Visayas Medical Center"}, "hospital"),
    ({"healthcare": "hospital", "name": "QualiMed Hospital"}, "hospital"),
    ({"amenity": "hospital", "healthcare": "hospital", "name": "Cornerstone Pet Hospital"}, None),
    ({"amenity": "clinic", "name": "Molo District Health Center"}, "health_center"),
    ({"amenity": "health_post", "name": "Tagbac Barangay Health Station"}, "bhs"),
    ({"healthcare": "yes", "name": "Dungon A Health Station"}, "bhs"),
    ({"amenity": "pharmacy", "name": "Mercury Drug"}, None),
    ({"amenity": "hospital"}, None),
])
def test_kind(tags, expected):
    assert kind(tags) == expected


CITY = shapely.box(122.5, 10.7, 122.6, 10.8)


def test_facilities_keeps_named_inside_city_once():
    els = [
        {"type": "node", "lat": 10.75, "lon": 122.55, "tags": {"amenity": "hospital", "name": "A Hospital"}},
        {"type": "way", "center": {"lat": 10.75, "lon": 122.551}, "tags": {"amenity": "hospital", "name": "A Hospital"}},
        {"type": "node", "lat": 10.9, "lon": 122.55, "tags": {"amenity": "hospital", "name": "Outside"}},
        {"type": "node", "lat": 10.75, "lon": 122.55, "tags": {"amenity": "pharmacy", "name": "Drugstore"}},
    ]
    f = facilities(els, CITY)
    assert f[["name", "kind"]].values.tolist() == [["A Hospital", "hospital"]]


def test_waterways_clipped_to_city():
    els = [{"type": "way", "tags": {"waterway": "river", "name": "R"},
            "geometry": [{"lon": 122.4, "lat": 10.75}, {"lon": 122.55, "lat": 10.75}]},
           {"type": "way", "tags": {"waterway": "ditch"}, "geometry": [{"lon": 122.55, "lat": 10.71}, {"lon": 122.55, "lat": 10.72}]}]
    w = waterways(els, CITY)
    assert w.kind.tolist() == ["river"]
    assert w.total_bounds[0] == pytest.approx(122.5)


def test_nearest_picks_closest_facility():
    b = gpd.GeoDataFrame({"psgc": ["a", "b"]}, geometry=[shapely.box(122.50, 10.70, 122.51, 10.71),
                                                         shapely.box(122.58, 10.70, 122.59, 10.71)], crs="EPSG:4326")
    fac = gpd.GeoDataFrame({"name": ["West", "East"], "kind": ["hospital", "bhs"]},
                           geometry=[shapely.Point(122.505, 10.705), shapely.Point(122.585, 10.715)], crs="EPSG:4326")
    n = nearest(b, fac)
    assert n["a"] == {"name": "West", "kind": "hospital", "dist_m": 0}
    assert n["b"]["name"] == "East" and n["b"]["dist_m"] == 1110  # 0.01° of latitude
