import argparse
import rasterio
import numpy as np
import pandas as pd
from pyproj import Transformer
from rasterio.enums import Resampling
from rasterio.warp import reproject, calculate_default_transform


def resample_tif(input_path, output_path, target_res_m=10000):
    with rasterio.open(input_path) as src:
        src_crs = src.crs
        scale = target_res_m / 250
        new_width = int(src.width / scale)
        new_height = int(src.height / scale)

        new_transform, _, _ = calculate_default_transform(
            src_crs, src_crs, new_width, new_height, *src.bounds
        )

        new_profile = src.profile.copy()
        new_profile.update(
            {
                "width": new_width,
                "height": new_height,
                "transform": new_transform,
                "nodata": -200,  # tell rasterio what nodata looks like
            }
        )

        with rasterio.open(output_path, "w", **new_profile) as dst:
            reproject(
                source=rasterio.band(src, 1),
                destination=rasterio.band(dst, 1),
                src_transform=src.transform,
                src_crs=src_crs,
                dst_transform=new_transform,
                dst_crs=src_crs,
                src_nodata=-200,
                dst_nodata=-200,
                resampling=Resampling.sum,
            )


def main(tif_input, output_csv):
    with rasterio.open(tif_input) as src:
        data = src.read(1)
        transform = src.transform
        src_crs = src.crs

    print(f"Min value: {data.min()}, Max value: {data.max()}")
    print(f"Total pixels: {data.size}, CRS: {src_crs}")

    mask = data > 0
    rows, cols = np.where(mask)
    values = data[mask]
    print(f"Valid pixels: {mask.sum():,}")

    xs, ys = rasterio.transform.xy(transform, rows, cols)

    # Use pyproj instead of rasterio.warp.transform
    transformer = Transformer.from_crs(src_crs.to_wkt(), "EPSG:4326", always_xy=True)
    lons, lats = transformer.transform(xs, ys)

    # Drop any points that failed (pyproj returns inf for out-of-bounds)
    lons = np.array(lons)
    lats = np.array(lats)
    valid = np.isfinite(lons) & np.isfinite(lats)

    df = pd.DataFrame({"lon": lons[valid], "lat": lats[valid], "value": values[valid]})
    df.to_csv(output_csv, index=False)
    print(f"Written {len(df):,} rows to {output_csv}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Convert a GeoTIFF file to a CSV with x, y, and value columns."
    )
    parser.add_argument("--input_tif", "-i", help="Path to the input GeoTIFF file")
    parser.add_argument("--output_csv", "-o", help="Path to the output CSV file")
    parser.add_argument(
        "--skip-resample",
        "-s",
        default=False,
        action="store_true",
        help="Whether to resample the input TIFF to 10km resolution before processing",
    )
    args = parser.parse_args()
    if not args.skip_resample:
        resample_tif(args.input_tif, f"{args.input_tif}.resampled")
        main(f"{args.input_tif}.resampled", args.output_csv)
    else:
        main(args.input_tif, args.output_csv)
