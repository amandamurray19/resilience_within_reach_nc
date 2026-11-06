"""Build compact static JSON used by the GitHub Pages application."""
from __future__ import annotations

import csv
import json
from collections import defaultdict
from pathlib import Path
from shapely.geometry import mapping, shape

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT.parent
CITIES = {
    "Asheville": "asheville",
    "Greenville": "greenville",
    "Lumberton": "lumberton",
    "Rocky Mount": "rocky_mount",
}


def number(row: dict[str, str], key: str) -> float | None:
    try:
        return float(row[key]) if row.get(key, "") != "" else None
    except (TypeError, ValueError):
        return None


def compact(value: float | None, digits: int = 3):
    return None if value is None else round(value, digits)


def build_city(city: str, slug: str) -> None:
    block_path = SOURCE / "final_block_data" / f"{city.replace(' ', '_')}_final_block_data.csv"
    route_path = SOURCE / "final_distance_maps" / f"{city.replace(' ', '_')}_final_distance_map.csv"
    location_path = SOURCE / "locations" / f"{slug}_locations.csv"

    with block_path.open(newline="", encoding="utf-8-sig") as source:
        raw_blocks = list(csv.DictReader(source))

    tract_population = defaultdict(float)
    tract_housing = defaultdict(float)
    for row in raw_blocks:
        tract_population[row["tract_geoid"]] += number(row, "block_population_2020") or 0
        tract_housing[row["tract_geoid"]] += number(row, "block_housing_units_2020") or 0

    heat_values = sorted(
        value for row in raw_blocks
        if (value := number(row, "heat_summer_p90_surface_temp_c")) is not None
    )
    heat_cutoff = heat_values[int((len(heat_values) - 1) * 0.75)] if heat_values else None

    blocks = []
    block_index = {}
    for index, row in enumerate(raw_blocks):
        block_index[row["block_geoid"]] = index
        population = number(row, "block_population_2020") or 0
        housing = number(row, "block_housing_units_2020") or 0
        tract = row["tract_geoid"]
        pop_share = population / tract_population[tract] if tract_population[tract] else 0
        housing_share = housing / tract_housing[tract] if tract_housing[tract] else 0
        heat = number(row, "heat_summer_p90_surface_temp_c")
        svi = number(row, "svi2022_rpl_overall")
        groups = [
            population,
            (number(row, "acs2024_tract_age65plus_est") or 0) * pop_share,
            (number(row, "acs2024_tract_below_poverty_est") or 0) * pop_share,
            (number(row, "acs2024_tract_no_vehicle_households_est") or 0) * housing_share,
            (number(row, "acs2024_tract_disability_est") or 0) * pop_share,
            population if svi is not None and svi >= 0.75 else 0,
            population if row.get("flood_centroid_in_mapped_hazard") == "1" else 0,
            population if heat is not None and heat_cutoff is not None and heat >= heat_cutoff else 0,
        ]
        blocks.append([
            row["block_geoid"], compact(number(row, "block_centroid_lat"), 6),
            compact(number(row, "block_centroid_lon"), 6),
            *[compact(value, 2) for value in groups], compact(heat, 2), compact(svi, 3),
        ])

    locations = []
    location_index = {}
    with location_path.open(newline="", encoding="utf-8-sig") as source:
        for index, row in enumerate(csv.DictReader(source)):
            location_index[row["Location Key"]] = index
            locations.append([
                row["Location Key"], row["Name"], row["Asset Type"], row["Address"],
                compact(number(row, "Latitude"), 6), compact(number(row, "Longitude"), 6),
                compact(number(row, "Capacity Estimate"), 0),
            ])

    routes = []
    with route_path.open(newline="", encoding="utf-8-sig") as source:
        for row in csv.DictReader(source):
            routes.append([
                block_index[row["block_geoid"]], location_index[row["location_key"]],
                compact(number(row, "walking_distance_km")), compact(number(row, "walking_time_min"), 2),
                compact(number(row, "transit_time_min"), 2), compact(number(row, "transit_total_walk_distance_km")),
            ])

    output = {
        "city": city,
        "heatCutoff": compact(heat_cutoff, 2),
        "groupLabels": ["Total population", "Age 65+", "Below poverty", "No vehicle households", "People with disabilities", "High social vulnerability", "Flood risk population", "Heat risk population"],
        "blocks": blocks,
        "locations": locations,
        "routes": routes,
    }
    target = ROOT / "data" / f"{slug}.json"
    target.write_text(json.dumps(output, separators=(",", ":")), encoding="utf-8")
    geometry_path = SOURCE / "census" / city.replace(" ", "_") / f"{city.replace(' ', '_')}_Census2020_blocks.geojson"
    block_population = {block[0]: block[3] for block in blocks}
    raw_geometry = json.loads(geometry_path.read_text(encoding="utf-8"))
    features = []
    for feature in raw_geometry["features"]:
        geoid = feature["properties"]["GEOID"]
        if geoid not in block_population:
            continue
        simplified = shape(feature["geometry"]).simplify(0.000025, preserve_topology=True)
        features.append({"type": "Feature", "properties": {"g": geoid, "p": block_population[geoid]}, "geometry": mapping(simplified)})
    geometry_target = ROOT / "data" / f"{slug}_blocks.json"
    geometry_target.write_text(json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")), encoding="utf-8")
    print(f"{city}: {len(blocks):,} blocks, {len(locations):,} sites, {len(routes):,} routes -> {target.stat().st_size / 1_000_000:.1f} MB")


if __name__ == "__main__":
    (ROOT / "data").mkdir(exist_ok=True)
    for city_name, city_slug in CITIES.items():
        build_city(city_name, city_slug)
