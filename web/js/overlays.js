import { DEFOREST_COLORS } from "./constants.js";
import { showToast } from "./ui.js";

/* ── Shared canvas overlay base ──────────────────────────────────────────────
   Creates a positioned canvas inside a custom pane and redraws on map events.
   Subclasses implement _paint(ctx, map, w, h, nwPt). */

class CanvasOverlayLayer extends L.Layer {
  constructor(paneName, zIndex, padBounds = 0.2) {
    super();
    this._paneName = paneName;
    this._zIndex = zIndex;
    this._padBounds = padBounds;
    this._rafId = null;
    this._draw = this._draw.bind(this);
    this._hide = () => { this._canvas.style.display = "none"; };
    this._scheduleDraw = () => {
      if (this._rafId) cancelAnimationFrame(this._rafId);
      this._rafId = requestAnimationFrame(() => { this._rafId = null; this._draw(); });
    };
  }

  onAdd(map) {
    this._map = map;
    if (!map.getPane(this._paneName)) {
      const pane = map.createPane(this._paneName);
      pane.style.zIndex = String(this._zIndex);
      pane.style.pointerEvents = "none";
    }
    this._canvas = L.DomUtil.create("canvas", "", map.getPane(this._paneName));
    map.on("zoomstart", this._hide);
    map.on("move", this._scheduleDraw);
    map.on("viewreset moveend zoomend resize", this._draw);
    this._draw();
    return this;
  }

  onRemove(map) {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    L.DomUtil.remove(this._canvas);
    map.off("zoomstart", this._hide);
    map.off("move", this._scheduleDraw);
    map.off("viewreset moveend zoomend resize", this._draw);
    return this;
  }

  _draw() {
    const map = this._map;
    const bounds = map.getBounds().pad(this._padBounds);
    const nw = map.latLngToLayerPoint(bounds.getNorthWest());
    const se = map.latLngToLayerPoint(bounds.getSouthEast());
    const w = Math.max(1, se.x - nw.x);
    const h = Math.max(1, se.y - nw.y);

    const canvas = this._canvas;
    canvas.style.display = "";
    canvas.width = w;
    canvas.height = h;
    L.DomUtil.setPosition(canvas, nw);

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    this._paint(ctx, map, w, h, nw);
  }
}

/* Generic GeoJSON loader — returns a Promise<geojson> with toast on failure. */
function loadGeoJSON(url, failLabel, toggleBtnId) {
  return fetch(url)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
    .catch((err) => {
      console.warn(`${failLabel} failed to load:`, err.message);
      document.getElementById(toggleBtnId)?.classList.remove("active");
      showToast(`Failed to load ${failLabel.toLowerCase()}.`);
      throw err;
    });
}

/* ── Deforestation Overlay ────────────────────────────────────────────────── */

const CELL_HALF = 0.0482;
const ALL_DRIVERS = [1, 2, 3, 4, 5];

let deforestMap = null;
let deforestLayer = null;
let deforestVisible = false;
let deforestFeatures = []; // all features for current country filter — stats + nearest lookup
let deforestGeoJSON = null;
let deforestActiveDrivers = new Set(ALL_DRIVERS);
let deforestCountryIso3 = null;

export const isDeforestVisible = () => deforestVisible;

export function getDeforestStats(south, north, west, east) {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const f of deforestFeatures) {
    const [lon, lat] = f.geometry.coordinates;
    if (lat < south || lat > north || lon < west || lon > east) continue;
    const d = f.properties.driver;
    if (counts[d] !== undefined) counts[d]++;
  }
  return counts;
}

export function getDeforestStatsByCountry(south, north, west, east) {
  if (!deforestFeatures.length) return null;
  const counts = new Map();
  for (const f of deforestFeatures) {
    const [lon, lat] = f.geometry.coordinates;
    if (lat < south || lat > north || lon < west || lon > east) continue;
    if (!deforestActiveDrivers.has(f.properties.driver)) continue;
    const cc3 = f.properties.cc3;
    if (cc3) counts.set(cc3, (counts.get(cc3) || 0) + 1);
  }
  return counts;
}

export function getNearestDeforestDriver(lat, lng, radiusDeg = 2) {
  if (!deforestFeatures.length) return null;
  let nearest = null;
  let minDist = Infinity;
  const r2 = radiusDeg * radiusDeg;
  for (const f of deforestFeatures) {
    const [fLng, fLat] = f.geometry.coordinates;
    const dist = (fLat - lat) ** 2 + (fLng - lng) ** 2;
    if (dist < minDist && dist < r2) {
      minDist = dist;
      nearest = f.properties;
    }
  }
  return nearest;
}

let _definitiveDeforestCache = null;

/* Definitive drivers = 1 (commodity), 2 (shifting), 5 (urbanization).
   Always uses unfiltered dataset so the conclusion chart is independent of filters. */
export function getDefinitiveDeforestPctByCountry() {
  if (_definitiveDeforestCache) return _definitiveDeforestCache;
  if (!deforestGeoJSON) return null;
  const totals = new Map();
  for (const f of deforestGeoJSON.features) {
    const cc3 = f.properties.cc3;
    if (!cc3) continue;
    if (!totals.has(cc3)) totals.set(cc3, { def: 0, total: 0 });
    const c = totals.get(cc3);
    c.total++;
    const d = f.properties.driver;
    if (d === 1 || d === 2 || d === 5) c.def++;
  }
  _definitiveDeforestCache = new Map(
    [...totals].map(([iso3, c]) => [iso3, c.total > 0 ? (c.def / c.total) * 100 : 0]),
  );
  return _definitiveDeforestCache;
}

export function setDeforestDriverFilter(activeDrivers) {
  deforestActiveDrivers = new Set(activeDrivers);
  rebuildDeforestLayer();
}

export function setDeforestCountryFilter(iso3) {
  deforestCountryIso3 = iso3;
  rebuildDeforestLayer();
}

function rebuildDeforestLayer() {
  if (!deforestVisible || !deforestGeoJSON || !deforestMap) return;
  if (deforestLayer) deforestMap.removeLayer(deforestLayer);
  buildDeforestLayerFromData(deforestMap, deforestGeoJSON);
}

class DeforestCanvasLayer extends CanvasOverlayLayer {
  constructor(features) {
    super("deforestPane", 360, 0.2);
    this._features = features;
  }

  _paint(ctx, map, w, h, nw) {
    const vb = map.getBounds();
    const s = vb.getSouth() - CELL_HALF;
    const n = vb.getNorth() + CELL_HALF;
    const we = vb.getWest() - CELL_HALF;
    const e = vb.getEast() + CELL_HALF;

    const byDriver = {};
    for (const f of this._features) {
      if (f.lat < s || f.lat > n || f.lng < we || f.lng > e) continue;
      (byDriver[f.driver] ??= []).push(f);
    }
    for (const [driver, pts] of Object.entries(byDriver)) {
      ctx.fillStyle = (DEFOREST_COLORS[driver] ?? "#ccc") + "aa";
      for (const p of pts) {
        const nwPt = map.latLngToLayerPoint([p.lat + CELL_HALF, p.lng - CELL_HALF]);
        const sePt = map.latLngToLayerPoint([p.lat - CELL_HALF, p.lng + CELL_HALF]);
        ctx.fillRect(nwPt.x - nw.x, nwPt.y - nw.y,
          Math.max(1, sePt.x - nwPt.x), Math.max(1, sePt.y - nwPt.y));
      }
    }
  }
}

function buildDeforestLayerFromData(map, geojson) {
  const bboxFiltered = deforestCountryIso3
    ? geojson.features.filter((f) => f.properties.cc3 === deforestCountryIso3)
    : geojson.features;

  deforestFeatures = bboxFiltered;

  const visible = deforestActiveDrivers.size === ALL_DRIVERS.length
    ? bboxFiltered
    : bboxFiltered.filter((f) => deforestActiveDrivers.has(f.properties.driver));

  const pts = visible.map((f) => ({
    lng: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
    driver: f.properties.driver,
  }));

  deforestLayer = new DeforestCanvasLayer(pts);
  deforestLayer.addTo(map);

  document.dispatchEvent(
    new CustomEvent("deforest-toggled", { detail: { active: true } }),
  );
}

export function buildDeforestToggle(map) {
  deforestMap = map;
  const btn = document.getElementById("deforest-toggle");
  btn.addEventListener("click", () => {
    deforestVisible = !deforestVisible;
    btn.classList.toggle("active", deforestVisible);
    if (!deforestVisible) {
      if (deforestLayer) {
        map.removeLayer(deforestLayer);
        deforestLayer = null;
      }
      document.dispatchEvent(new CustomEvent("deforest-toggled", { detail: { active: false } }));
      return;
    }
    if (deforestGeoJSON) {
      buildDeforestLayerFromData(map, deforestGeoJSON);
      return;
    }
    loadGeoJSON("data/8-deforestation.geojson", "Deforestation layer", "deforest-toggle")
      .then((geojson) => {
        deforestGeoJSON = geojson;
        buildDeforestLayerFromData(map, geojson);
      })
      .catch(() => { deforestVisible = false; });
  });
}

/* ── Population Overlay ───────────────────────────────────────────────────── */

let populationMap = null;
let populationLayer = null;
let populationVisible = false;
let populationGeoJSON = null; // cached so re-toggle skips re-fetch
let populationThreshold = 0; // norm value [0,1] — hide points below this
let populationCountryIso3 = null; // ISO alpha-3 string or null for no filter


export function setPopulationThreshold(t) {
  populationThreshold = t;
  if (populationLayer) populationLayer.redraw();
}

export function setPopulationCountryFilter(iso3) {
  populationCountryIso3 = iso3;

  if (!populationVisible || !populationLayer) return;

  // just trigger a visual refresh
  populationLayer.redraw();
}

const popColorScale = d3.scaleSequential()
  .domain([0, 1])
  .interpolator(d3.interpolateInferno);

function formatPop(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "k";
  return String(n);
}

class PopHeatmapLayer extends L.Layer {
  
  constructor(geojson, colorScale) {
    super();
    this._geojson = geojson;
    this._color = colorScale;
    this._layer = null;
    // const norms = geojson.features.map(f => f.properties.norm);
    // console.log("min", Math.min(...norms));
    // console.log("max", Math.max(...norms));
    // console.log("avg", norms.reduce((a,b)=>a+b,0)/norms.length);
    
  }

  onAdd(map) {
    this._map = map;

    if (!map.getPane("populationPane")) {
      const pane = map.createPane("populationPane");
      pane.style.zIndex = "350";
    }

    this._layer = L.geoJSON(this._geojson, {
      pane: "populationPane",

      style: (feature) => {
        const v = feature.properties.value ?? 0;
        const norm = feature.properties.norm ?? 0;

        if (norm < populationThreshold) {
          return { fillOpacity: 0, opacity: 0 };
        }

        return {
          fillColor: d3.interpolateInferno(feature.properties.norm),
          fillOpacity: 0.6,
          opacity: 0,
          weight: 0
        };
      },

      filter: (feature) => {
        if (!populationCountryIso3) return true;
        return feature.properties.cc3 === populationCountryIso3;
      }
    }).addTo(map);

    return this;
  }

  onRemove(map) {
    if (this._layer) {
      map.removeLayer(this._layer);
      this._layer = null;
    }
  }


  redraw() {
    if (!this._layer) return;
    this._layer.setStyle(this._layer.options.style);
  }
}

function buildPopLayerFromData(map, geojson) {
  populationLayer = new PopHeatmapLayer(geojson, popColorScale);
  populationLayer.addTo(map);
}

function loadPopulationLayer(map) {
  if (populationGeoJSON) {
    buildPopLayerFromData(map, populationGeoJSON);
    return;
  }
  fetch("data/population_grid.geojson")
    .then((r) => {
      if (!r.ok) throw new Error(r.statusText);
      return r.json();
    })
    .then((geojson) => {
      populationGeoJSON = geojson;
      buildPopLayerFromData(map, geojson);
    })
    .catch((err) => {
      console.warn("Population layer failed to load:", err.message);
      populationVisible = false;
      document.getElementById("population-toggle").classList.remove("active");
      showToast("Failed to load population layer.");
    });
}

export function buildPopulationToggle(map) {
  populationMap = map;
  const btn = document.getElementById("population-toggle");
  btn.addEventListener("click", () => {
    populationVisible = !populationVisible;
    btn.classList.toggle("active", populationVisible);
    document.getElementById("population-tool").classList.toggle("hidden", !populationVisible);
    document.getElementById("population-divider").classList.toggle("hidden", !populationVisible);
    if (populationVisible) {
      loadPopulationLayer(map);
    } else {
      if (populationLayer) {
        map.removeLayer(populationLayer);
        populationLayer = null;
      }
    }
  });
}
