import pandas as pd
import numpy as np
import json

df = pd.read_csv("data/csv/5-gridded-population.csv")

# ----------------------------
# 1. spatial binning
# ----------------------------
cell_size = 0.5

df["lat_bin"] = (df["lat"] // cell_size) * cell_size
df["lon_bin"] = (df["lon"] // cell_size) * cell_size

# ----------------------------
# 2. aggregate VALUE per cell
# ----------------------------
agg = df.groupby(["lat_bin", "lon_bin"], as_index=False)["value"].sum()

# ----------------------------
# 3. compute NORMALIZATION AFTER aggregation
# ----------------------------
agg["norm"] = np.log1p(agg["value"])
agg["norm"] = (agg["norm"] - agg["norm"].min()) / (agg["norm"].max() - agg["norm"].min())

# ----------------------------
# 4. build GeoJSON
# ----------------------------
features = []

for _, r in agg.iterrows():
    lat = r["lat_bin"]
    lon = r["lon_bin"]

    v = float(r["value"])
    n = float(r["norm"])

    cell = [
        [lon, lat],
        [lon + cell_size, lat],
        [lon + cell_size, lat + cell_size],
        [lon, lat + cell_size],
        [lon, lat]
    ]

    features.append({
        "type": "Feature",
        "properties": {
            "value": v,
            "norm": n
        },
        "geometry": {
            "type": "Polygon",
            "coordinates": [cell]
        }
    })

geojson = {
    "type": "FeatureCollection",
    "features": features
}

with open("population_grid.geojson", "w") as f:
    json.dump(geojson, f)