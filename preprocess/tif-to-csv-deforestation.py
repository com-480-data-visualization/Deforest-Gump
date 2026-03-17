import argparse

import rasterio
import numpy as np
import pandas as pd

cause = {
    0.0: "No loss",
    1.0: "Commodity-driven deforestation",
    2.0: "Shifting agriculture",
    3.0: "Forestry",
    4.0: "Wildfire",
    5.0: "Urbanization",
}

def main(tif_input, output_csv):
    with rasterio.open(tif_input) as src:
        data = src.read(1)  # Read band 1
        transform = src.transform
        print(f"Coordinate reference system: {src.crs} (EPSG:4326 used for lat/lon)")

    # Write the min/max values of data
    print(f"Min value: {data.min()}")
    print(f"Max value: {data.max()}")
    print(f"Total pixels: {data.size}")

    data = np.where(data < 0, np.nan, data)
    valid = np.sum(~np.isnan(data))
    print(f"Valid pixels (>= 0): {valid}")

    rows, cols = np.indices(data.shape)
    xs, ys = rasterio.transform.xy(transform, rows.ravel(), cols.ravel())

    df = pd.DataFrame({
        "lon": xs,
        "lat": ys,
        "value": data.ravel()
    })

    # Drop rows where value is NaN (was < 0)
    df = df.dropna(subset=["value"])

    # Map the numeric values to their corresponding causes
    df["cause"] = df["value"].map(cause)

    df.to_csv(output_csv, index=False)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Convert a GeoTIFF file to a CSV with x, y, and value columns.")
    parser.add_argument("--input_tif", "-i", help="Path to the input GeoTIFF file")
    parser.add_argument("--output_csv", "-o", help="Path to the output CSV file")
    args = parser.parse_args()
    main(args.input_tif, args.output_csv)
