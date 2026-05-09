"""
Build country-level correlation data joining power plants and deforestation.

For each country that appears in both datasets, computes:
  - deforest_count : number of deforestation pixels (drivers 1–5)
  - fossil_pct     : % of total installed capacity from fossil fuels (Coal/Gas/Oil/Petcoke)
  - total_capacity_mw
  - plant_count
  - dominant_fuel  : fuel type with highest total capacity

Output: web/data/country-correlation.json

Usage (from repo root, with .venv active):
    python preprocess/compute-country-correlation.py
"""

import csv, json, os
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(__file__), "..")
PLANTS_CSV     = os.path.join(ROOT, "data/csv/4-power-plants.csv")
DEFOREST_CSV   = os.path.join(ROOT, "data/csv/8-deforestation.csv")
OUTPUT_JSON    = os.path.join(ROOT, "web/data/country-correlation.json")

FOSSIL_FUELS = {"Coal", "Gas", "Oil", "Petcoke"}

def main():
    # ── Deforestation: count pixels per country ──────────────────────────────
    deforest = defaultdict(int)          # code3 → pixel count
    code3_to_name = {}

    with open(DEFOREST_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            try:
                val = float(row["value"])
            except ValueError:
                continue
            if val <= 0:
                continue
            code3 = row["country_code_3"].strip()
            if not code3:
                continue
            deforest[code3] += 1
            if code3 not in code3_to_name:
                code3_to_name[code3] = row["country_name"].strip()

    # ── Power plants: capacity by fuel per country ────────────────────────────
    cap_by_fuel  = defaultdict(lambda: defaultdict(float))  # code3 → fuel → MW
    plant_counts = defaultdict(int)

    with open(PLANTS_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            code3 = row["country"].strip()
            fuel  = row["primary_fuel"].strip()
            try:
                cap = float(row["capacity_mw"])
            except ValueError:
                cap = 0.0
            cap_by_fuel[code3][fuel] += cap
            plant_counts[code3] += 1
            if code3 not in code3_to_name:
                code3_to_name[code3] = row["country_long"].strip()

    # ── Join and compute metrics ──────────────────────────────────────────────
    records = []
    shared_codes = set(deforest) & set(cap_by_fuel)

    for code3 in shared_codes:
        fuel_map = cap_by_fuel[code3]
        total_cap = sum(fuel_map.values())
        if total_cap == 0:
            continue

        fossil_cap = sum(v for f, v in fuel_map.items() if f in FOSSIL_FUELS)
        fossil_pct = round(fossil_cap / total_cap * 100, 1)

        dominant_fuel = max(fuel_map, key=fuel_map.get)

        records.append({
            "country":          code3_to_name.get(code3, code3),
            "code":             code3,
            "deforest_count":   deforest[code3],
            "fossil_pct":       fossil_pct,
            "total_capacity_mw": round(total_cap, 1),
            "plant_count":      plant_counts[code3],
            "dominant_fuel":    dominant_fuel,
        })

    records.sort(key=lambda r: r["deforest_count"], reverse=True)

    os.makedirs(os.path.dirname(OUTPUT_JSON), exist_ok=True)
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(records, f, separators=(",", ":"))

    print(f"Done: {len(records)} countries → {OUTPUT_JSON}")
    print(f"  Deforest-only countries skipped: {len(set(deforest) - shared_codes)}")
    print(f"  Plants-only countries skipped:   {len(set(cap_by_fuel) - shared_codes)}")


if __name__ == "__main__":
    main()
