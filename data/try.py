import pandas as pd
import datashader as ds
import datashader.transfer_functions as tf
from datashader.utils import lnglat_to_meters
import colorcet as cc
import matplotlib.pyplot as plt

# Load CSV
df = pd.read_csv("data/csv/5-gridded-population.csv")

print(df["value"].describe())

# Convert lat/lon to Web Mercator
df["x"], df["y"] = lnglat_to_meters(df["lon"], df["lat"])

# Create canvas (increase resolution here)
canvas = ds.Canvas(
    plot_width=4000,
    plot_height=2000
)

# Aggregate points
agg = canvas.points(df, "x", "y", agg=ds.mean("value"))

# Shade image
img = tf.shade(
    agg,
    cmap=cc.fire,
    how="eq_hist"
)

# Export
tf.set_background(img, "black").to_pil().save("highres_map.png")

print("saved highres_map.png")