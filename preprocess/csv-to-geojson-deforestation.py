"""
Convert 8-deforestation.csv to a sampled GeoJSON for the web overlay.

Reads the full deforestation CSV (~1.16M rows), keeps only pixels with an
actual driver (value 1–5), then samples every SAMPLE_EVERY-th row so the
output stays under ~3 MB for fast browser loading.

Usage (from repo root, with .venv active):
    python preprocess/csv-to-geojson-deforestation.py
"""

import csv
import json
import os

INPUT_CSV = os.path.join(os.path.dirname(__file__), "../data/csv/8-deforestation.csv")
OUTPUT_GEOJSON = os.path.join(os.path.dirname(__file__), "../web/data/8-deforestation.geojson")

# Targeting ~25 000 features ≈ 517 983 deforestation pixels / 20 ≈ 25 899
SAMPLE_EVERY = 20

DRIVER_MAP = {
    "1.0": 1,
    "2.0": 2,
    "3.0": 3,
    "4.0": 4,
    "5.0": 5,
}

def main():
    features = []
    kept = 0
    skipped = 0

    with open(INPUT_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            try:
                value = float(row["value"])
            except ValueError:
                continue

            if value <= 0:
                continue

            skipped += 1
            if skipped % SAMPLE_EVERY != 0:
                continue

            driver = DRIVER_MAP.get(f"{value:.1f}")
            if driver is None:
                continue

            lon = round(float(row["lon"]), 4)
            lat = round(float(row["lat"]), 4)

            features.append({
                "type": "Feature",
                "properties": {
                    "driver": driver,
                    "cause": row["cause"].strip(),
                    "cc3": row["country_code_3"].strip(),
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [lon, lat],
                },
            })
            kept += 1

    geojson = {
        "type": "FeatureCollection",
        "features": features,
    }

    os.makedirs(os.path.dirname(OUTPUT_GEOJSON), exist_ok=True)
    with open(OUTPUT_GEOJSON, "w", encoding="utf-8") as f:
        json.dump(geojson, f, separators=(",", ":"))

    size_mb = os.path.getsize(OUTPUT_GEOJSON) / 1_000_000
    print(f"Done: {kept:,} features written to {OUTPUT_GEOJSON} ({size_mb:.1f} MB)")
    print(f"Sample rate: 1 in {SAMPLE_EVERY} deforestation pixels")


if __name__ == "__main__":
    main()
