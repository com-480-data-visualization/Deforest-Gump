"""
Convert 5-gridded-population.csv to a sampled GeoJSON for the web overlay.

The population values span many orders of magnitude (near-0 to 5 M), so
each feature stores a log-normalised `norm` value in [0, 1] alongside the
raw `pop` count, ready for D3's sequential colour scale in the browser.

Usage (from repo root, with .venv active):
    python preprocess/csv-to-geojson-population.py
"""

import csv
import json
import math
import os
import pycountry
import reverse_geocoder as rg

INPUT_CSV = os.path.join(os.path.dirname(__file__), "../data/csv/5-gridded-population.csv")
OUTPUT_GEOJSON = os.path.join(os.path.dirname(__file__), "../web/data/5-population.geojson")

MIN_POP = 1.0        # ignore pixels with < 1 person per 10 km²
SAMPLE_EVERY = 30    # ~684 k non-zero rows / 30 ≈ 22 800 features

def main():
    # First pass: find the max value for log-normalisation
    max_val = 0.0
    with open(INPUT_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            v = float(row["value"])
            if v > max_val:
                max_val = v

    log_max = math.log(max_val + 1)

    sampled_rows = []
    counter = 0

    with open(INPUT_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            v = float(row["value"])
            if v < MIN_POP:
                continue

            counter += 1
            if counter % SAMPLE_EVERY != 0:
                continue

            sampled_rows.append(row)

    # Batch reverse-geocode only the sampled points (much faster than full CSV)
    coords = [(float(r["lat"]), float(r["lon"])) for r in sampled_rows]
    geocoded = rg.search(coords)

    features = []
    for row, geo in zip(sampled_rows, geocoded):
        v = float(row["value"])
        lon = round(float(row["lon"]), 4)
        lat = round(float(row["lat"]), 4)
        norm = round(math.log(v + 1) / log_max, 3)

        cc2 = geo["cc"]
        country = pycountry.countries.get(alpha_2=cc2)
        cc3 = country.alpha_3 if country else ""

        features.append({
            "type": "Feature",
            "properties": {
                "pop": round(v),
                "norm": norm,
                "cc3": cc3,
            },
            "geometry": {
                "type": "Point",
                "coordinates": [lon, lat],
            },
        })

    geojson = {
        "type": "FeatureCollection",
        "features": features,
    }

    os.makedirs(os.path.dirname(OUTPUT_GEOJSON), exist_ok=True)
    with open(OUTPUT_GEOJSON, "w", encoding="utf-8") as f:
        json.dump(geojson, f, separators=(",", ":"))

    size_mb = os.path.getsize(OUTPUT_GEOJSON) / 1_000_000
    print(f"Done: {len(features):,} features written to {OUTPUT_GEOJSON} ({size_mb:.1f} MB)")
    print(f"Log max: {log_max:.2f}  |  sample rate: 1 in {SAMPLE_EVERY}")


if __name__ == "__main__":
    main()
