# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

COM-480 Data Visualization project at EPFL (team: Simon Barras, Oliver Daoud, Phuc-hung Truong). The goal is a JavaScript website using **d3.js** and **lodash** to visualize the relationship between global power plant energy types and deforestation risk, enriched with population density data.

**Milestones:**
- Milestone 1 (done): EDA and dataset analysis
- Milestone 2 (17 Apr 2026, 5pm): 10% of grade — prototype website
- Milestone 3 (29 May 2026, 5pm): 80% of grade — final website (**due Friday**)

## Datasets

Three datasets from the [Kaggle "Geospatial Environmental and Socioeconomic Data"](https://www.kaggle.com/datasets/cathetorres/geospatial-environmental-and-socioeconomic-data) collection, stored under `data/csv/`:

| File | Description |
|------|-------------|
| `4-power-plants.csv` | 29,910 power plants worldwide (WRI). Columns include name, country, coordinates, capacity (MW), primary fuel. No preprocessing needed. |
| `8-deforestation.csv` | Deforestation 2001–2019 (Global Forest Watch). Each row = 10km² pixel. Values: 0 = no deforestation, <0 = no data; 1–5 = driver (commodity-driven, shifting agriculture, forestry, wildfire, urbanization). |
| `5-gridded-population.csv` | Population density 2015 (EC JRC / CIESIN). Downsampled from 250m² to 10km² resolution to match deforestation dataset. |

The deforestation and population datasets share the same 10km² spatial grid, enabling direct joins by coordinates.

## Data Preprocessing (Python)

Located in `preprocess/`. Run with the `.venv` Python environment:

```bash
source .venv/bin/activate
python preprocess/tif-to-csv-deforestation.py
python preprocess/tif-to-csv-population.py
```

These scripts convert raw GeoTIFF files in `data/tif/` → CSV in `data/csv/`. The population script accepts a resolution argument (default 10km). Both scripts add country codes via reverse geocoding. Output CSVs can also be converted to GeoJSON for use with D3.js.

VS Code launch configs for these scripts are in `.vscode/launch.json`.

## Website (JavaScript)

The website is the main deliverable. It must use **d3.js** and **lodash** as required libraries. No JavaScript build toolchain exists yet — the site is expected to be plain HTML/CSS/JS or a minimal setup.

Key visualization goals (from the milestone report):
- Map showing power plant locations colored/sized by energy type and capacity
- Geographic overlay of deforestation drivers
- Population density layer
- Exploration of correlation between fossil fuel infrastructure and deforestation pressure

## Milestone 2 Tasks (done — 17 Apr 2026)

- Two A4 pages with visualization sketches, tools, and MVP vs stretch breakdown
- Functional prototype with basic skeleton of visualization/widgets

## Milestone 3 Tasks (due 29 May 2026, 5pm)

**1. GitHub repository with README**
- Host code and data on GitHub (link to cloud storage if data is too large); include process book as a PDF
- README explaining technical setup and intended usage
- Code must be clean, manageable, and using latest practices

**2. Screencast (2 min max)**
- Demonstrate the viz in a fun, engaging, and impactful way
- Focus on main contributions, not technical details

**3. Process book (max 8 pages)**
- Describe the path from original idea to final product
- Explain challenges faced and design decisions made
- Reuse and expand M1 sketches, explaining changes
- Care about visual/design quality of the report
- Include peer assessment: breakdown of each team member's contributions

**Grading breakdown:**
| Category | Weight |
|----------|--------|
| Visualization | 35% |
| Technical Implementation | 15% |
| Screencast | 25% |
| Process book | 25% |

Note: grades may vary per team member based on the process book and peer assessment.

**Late policy:**
- < 24h late: 80% of milestone grade
- < 48h late: 70% of milestone grade

## Architecture Notes

- Raw data (`data/tif/`) → Python preprocessing → `data/csv/` → (optionally) GeoJSON → D3.js visualizations
- The deforestation and population CSVs share a 10km² grid, so spatial joins are by lat/lon coordinates
- Power plants CSV is independent and joined geographically or by country code
- For D3 maps, GeoJSON conversion of the raster data is preferred over raw CSV

## Code Separation Rules

Keep concerns strictly separated — never put CSS or JS inline in `index.html`:

- **Styles** → `web/style.css` only. No `<style>` blocks in `index.html`.
- **Logic** → `web/js/*.js` files only. No `<script>` blocks with application code in `index.html` (external library `<script src="...">` tags are fine).
- `index.html` contains only markup and `<link>`/`<script src>` references.
