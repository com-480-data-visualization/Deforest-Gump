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

const popColorScale = d3.scaleSequential(d3.interpolateYlOrRd).domain([0, 1]);

let populationMap = null;
let populationLayer = null;
let populationVisible = false;
let populationGeoJSON = null;
let populationThreshold = 0;
let populationCountryIso3 = null;

export function setPopulationThreshold(t) {
  populationThreshold = t;
  if (populationLayer) populationLayer._scheduleDraw();
}

export function setPopulationCountryFilter(iso3) {
  populationCountryIso3 = iso3;
  if (!populationVisible || !populationGeoJSON || !populationMap) return;
  if (populationLayer) populationMap.removeLayer(populationLayer);
  buildPopLayerFromData(populationMap, populationGeoJSON);
}

class PopHeatmapLayer extends CanvasOverlayLayer {
  constructor(pts) {
    super("populationPane", 350, 0.1);
    this._pts = pts;
  }

  _paint(outCtx, map, w, h, nw) {
    const zoom = map.getZoom();
    const radius = Math.max(15, Math.min(40, zoom * 4));

    const vb = map.getBounds();
    const visible = this._pts.filter(
      (p) =>
        p.norm >= populationThreshold &&
        p.lat >= vb.getSouth() - 1 &&
        p.lat <= vb.getNorth() + 1 &&
        p.lng >= vb.getWest() - 1 &&
        p.lng <= vb.getEast() + 1,
    );

    const MAX = 8000;
    const step = visible.length > MAX ? Math.ceil(visible.length / MAX) : 1;
    const pts = step > 1 ? visible.filter((_, i) => i % step === 0) : visible;
    if (pts.length === 0) return;

    // Pass 1 — accumulate intensity using additive alpha blending on offscreen canvas
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const ctx = off.getContext("2d");
    ctx.globalCompositeOperation = "lighter";

    pts.forEach((p) => {
      const lp = map.latLngToLayerPoint([p.lat, p.lng]);
      const x = lp.x - nw.x;
      const y = lp.y - nw.y;
      const a = p.norm * 0.5 + 0.05;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
      grad.addColorStop(0, `rgba(0,0,0,${a.toFixed(3)})`);
      grad.addColorStop(0.4, `rgba(0,0,0,${(a * 0.35).toFixed(3)})`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    });

    // Pass 2 — map accumulated alpha → color scale
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha === 0) continue;
      const t = Math.min(1, alpha / 255);
      const c = d3.color(popColorScale(t));
      data[i] = c.r;
      data[i + 1] = c.g;
      data[i + 2] = c.b;
      data[i + 3] = Math.round(t * 210);
    }
    outCtx.putImageData(imageData, 0, 0);
  }
}

function buildPopLayerFromData(map, geojson) {
  const source = populationCountryIso3
    ? geojson.features.filter((f) => f.properties.cc3 === populationCountryIso3)
    : geojson.features;

  const pts = source.map((f) => ({
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
    norm: f.properties.norm,
  }));

  populationLayer = new PopHeatmapLayer(pts);
  populationLayer.addTo(map);
}

export function buildPopulationToggle(map) {
  populationMap = map;
  const btn = document.getElementById("population-toggle");
  btn.addEventListener("click", () => {
    populationVisible = !populationVisible;
    btn.classList.toggle("active", populationVisible);
    document.getElementById("population-tool").classList.toggle("hidden", !populationVisible);
    document.getElementById("population-divider").classList.toggle("hidden", !populationVisible);
    if (!populationVisible) {
      if (populationLayer) {
        map.removeLayer(populationLayer);
        populationLayer = null;
      }
      return;
    }
    if (populationGeoJSON) {
      buildPopLayerFromData(map, populationGeoJSON);
      return;
    }
    loadGeoJSON("data/5-population.geojson", "Population layer", "population-toggle")
      .then((geojson) => {
        populationGeoJSON = geojson;
        buildPopLayerFromData(map, geojson);
      })
      .catch(() => { populationVisible = false; });
  });
}
