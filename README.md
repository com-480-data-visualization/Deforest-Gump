# Deforest Gump — COM-480 Data Visualization

| Student | SCIPER |
|---------|--------|
| Oliver Daoud | 356765 |
| Phuc-hung Truong | 345674 |
| Simon Barras | 385883 |

[Milestone 1](#milestone-1) • [Milestone 2](#milestone-2) • [Milestone 3](#milestone-3)

---

## Milestone 3 (29th May, 5pm)

**80% of the final grade**

### Process book

[Process book link](Deforest_Gump.pdf)

### Screencast

[Link to video](Screencast.mp4)

### Live website

[https://com-480-data-visualization.github.io/Deforest-Gump/](https://com-480-data-visualization.github.io/Deforest-Gump/)

### What it shows

*Where energy meets the forest.* Fossil fuel power plants and deforestation are deeply connected — this visualization makes that link visible.

The site combines three datasets across 148 countries:

- **30 000+ power plants** worldwide, colored by fuel type and sized by installed capacity (MW)
- **500 000+ deforestation pixels** (2001–2019) classified by driver: commodity agriculture, shifting agriculture, forestry, wildfire, and urbanization
- **Gridded population density** (2015) at 10 km² resolution

Four linked views tell the story together:

| View | What it shows |
|------|--------------|
| **Interactive map** | Power plant locations + optional deforestation / population overlays |
| **Bar charts** | Average capacity and plant count by fuel type — update as you pan/zoom |
| **Capacity pie chart** | Share of total installed MW by fuel, live for the current view |
| **Correlation scatter** | Fossil fuel % vs deforestation intensity per country — click a dot to filter the map |

### How to use

1. **Browse power plants** — use the fuel-type chips or the country dropdown to filter markers on the map
2. **Enable overlays** — toggle *Deforestation* or *Population* to layer additional data; the sidebar shows a live driver breakdown for the current map view
3. **Spot the pattern** — check the scatter chart (bottom right) to see which countries combine heavy fossil fuel dependency with high deforestation pressure; click any dot to zoom in

### Technical setup

#### Requirements

- Python 3.8+ with a virtual environment (for preprocessing only)
- A static file server to run the website locally (the browser blocks `file://` fetches)

#### Run locally

```bash
# 1. Serve the web folder with any static server, e.g.:
cd web
python3 -m http.server 8000
# then open http://localhost:8000
```

No build step, no bundler — the site is plain HTML / CSS / ES modules.

#### Regenerate preprocessed data (optional)

The generated files (`web/data/8-deforestation.geojson`, `web/data/5-population.geojson`, `web/data/country-correlation.json`) are committed and ready to use. To rebuild them from the raw CSVs:

```bash
# Activate the Python virtual environment
source .venv/bin/activate

# Convert deforestation CSV → sampled GeoJSON (~25 900 features)
python preprocess/csv-to-geojson-deforestation.py

# Convert population CSV → sampled GeoJSON (~21 500 features)
python preprocess/csv-to-geojson-population.py

# Compute per-country correlation data (148 countries)
python preprocess/compute-country-correlation.py
```

Raw GeoTIFF → CSV conversion (already done, requires `rasterio`):

```bash
python preprocess/tif-to-csv-deforestation.py -i data/tif/8-deforestation.tif -o data/csv/8-deforestation.csv
python preprocess/tif-to-csv-population.py -i data/tif/5-gridded-population.tif.resampled -o data/csv/5-gridded-population.csv
```

#### Repository structure

```
Deforest-Gump/
├── web/                        # Website (main deliverable)
│   ├── index.html
│   ├── style.css
│   ├── js/
│   │   ├── app.js              # Entry point, data loading, filter wiring
│   │   ├── charts.js           # D3 bar, pie, and scatter charts
│   │   ├── map.js              # Leaflet markers
│   │   ├── overlays.js         # Deforestation & population layers
│   │   ├── ui.js               # Legend, chips, detail panel, sidebar stats
│   │   └── constants.js        # Fuel/driver colours and helpers
│   ├── data/                   # Preprocessed data served to the browser
│   └── lib/                    # Vendored D3, Leaflet, TopoJSON
├── preprocess/                 # Python scripts for data preparation
├── data/
│   ├── csv/                    # Source CSVs (power plants, deforestation, population)
│   └── tif/                    # Raw GeoTIFFs (not committed — too large)
└── schema/                     # Design sketches (Excalidraw)
```

### Data sources

| Dataset | Source | Licence |
|---------|--------|---------|
| Global Power Plant Database | [WRI / Global Energy Observatory](https://datasets.wri.org/dataset/globalpowerplantdatabase) | CC BY 4.0 |
| Deforestation drivers 2001–2019 | [Global Forest Watch / Curtis et al. 2018](https://www.globalforestwatch.org/) | CC BY 4.0 |
| Gridded Population of the World | [EC JRC / CIESIN](https://sedac.ciesin.columbia.edu/data/collection/gpw-v4) | CC BY 4.0 |

All three datasets are available via the [Kaggle "Geospatial Environmental and Socioeconomic Data"](https://www.kaggle.com/datasets/cathetorres/geospatial-environmental-and-socioeconomic-data) collection.

---

## Milestone 2 (17th April, 5pm)

**10% of the final grade**

[Milestone 2 Report](DataViz_Milestone_2.pdf) • [Prototype website](https://com-480-data-visualization.github.io/Deforest-Gump/)

---

## Milestone 1 (20th March, 5pm)

[Milestone 1 Report](DataViz_Milestone_1.pdf)

---

## Late policy

- < 24h: 80% of the grade for the milestone
- < 48h: 70% of the grade for the milestone
