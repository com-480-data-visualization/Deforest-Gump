import { DEFOREST_COLORS, DEFOREST_CAUSES } from "./constants.js";
import { showToast } from "./ui.js";

/* ── Deforestation Overlay ────────────────────────────────────────────────── */

let deforestMap = null;
let deforestLayer = null;
let deforestVisible = false;
let deforestFeatures = []; // all features — used for stats + nearest lookup
let deforestGeoJSON = null; // cached raw GeoJSON so re-toggle skips re-fetch
let deforestActiveDrivers = new Set([1, 2, 3, 4, 5]);
let deforestCountryBbox = null; // {s, n, w, e} or null for no country filter

export const isDeforestVisible = () => deforestVisible;

export function getDeforestStats(south, north, west, east) {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  deforestFeatures.forEach((f) => {
    const [lon, lat] = f.geometry.coordinates;
    if (lat < south || lat > north || lon < west || lon > east) return;
    const d = f.properties.driver;
    if (counts[d] !== undefined) counts[d]++;
  });
  return counts;
}

/* Returns nearest deforestation pixel within radiusDeg degrees, or null. */
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

/* Update which drivers are shown on the overlay without re-fetching. */
export function setDeforestDriverFilter(activeDrivers) {
  deforestActiveDrivers = new Set(activeDrivers);
  if (!deforestVisible || !deforestGeoJSON || !deforestMap) return;
  if (deforestLayer) deforestMap.removeLayer(deforestLayer);
  buildDeforestLayerFromData(deforestMap, deforestGeoJSON);
}

/* Filter deforestation to an approximate country bounding box.
   Pass null to remove the filter. */
export function setDeforestCountryFilter(bbox) {
  deforestCountryBbox = bbox;
  if (!deforestVisible || !deforestGeoJSON || !deforestMap) return;
  if (deforestLayer) deforestMap.removeLayer(deforestLayer);
  buildDeforestLayerFromData(deforestMap, deforestGeoJSON);
}

/* Half the 10km cell in degrees (≈ 0.0964° / 2). Used to project each
   point to its four cell corners so adjacent pixels share edges. */
const CELL_HALF = 0.0482;

class DeforestCanvasLayer extends L.Layer {
  constructor(features) {
    super();
    this._features = features; // [{lng, lat, driver}]
    this._draw = this._draw.bind(this);
    this._hide = this._hide.bind(this);
  }

  onAdd(map) {
    this._map = map;
    if (!map.getPane("deforestPane")) {
      const pane = map.createPane("deforestPane");
      pane.style.zIndex = "360";
      pane.style.pointerEvents = "none";
    }
    this._canvas = L.DomUtil.create(
      "canvas",
      "leaflet-zoom-hide",
      map.getPane("deforestPane"),
    );
    map.on("movestart zoomstart", this._hide);
    map.on("viewreset moveend zoomend resize", this._draw);
    this._draw();
    return this;
  }

  onRemove(map) {
    L.DomUtil.remove(this._canvas);
    map.off("movestart zoomstart", this._hide);
    map.off("viewreset moveend zoomend resize", this._draw);
    return this;
  }

  _hide() {
    this._canvas.style.display = "none";
  }

  _draw() {
    const map = this._map;
    const bounds = map.getBounds().pad(0.05);
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

    // At low zoom, expand cells so nearby clusters merge into solid regions.
    // At zoom ≥ 5 it falls back to the actual 10km footprint.
    const zoom = map.getZoom();
    const cellHalf = Math.max(CELL_HALF, 0.4 / Math.pow(2, zoom - 2));

    const vb = map.getBounds();
    const s = vb.getSouth() - cellHalf;
    const n = vb.getNorth() + cellHalf;
    const we = vb.getWest() - cellHalf;
    const e = vb.getEast() + cellHalf;

    // Group by driver so we batch fillRect calls per color
    const byDriver = {};
    for (const f of this._features) {
      if (f.lat < s || f.lat > n || f.lng < we || f.lng > e) continue;
      (byDriver[f.driver] ??= []).push(f);
    }

    for (const [driver, pts] of Object.entries(byDriver)) {
      const color = DEFOREST_COLORS[driver] ?? "#ccc";
      ctx.fillStyle = color + "aa"; // ~67% opacity
      for (const p of pts) {
        const nwPt = map.latLngToLayerPoint([p.lat + cellHalf, p.lng - cellHalf]);
        const sePt = map.latLngToLayerPoint([p.lat - cellHalf, p.lng + cellHalf]);
        const x = nwPt.x - nw.x;
        const y = nwPt.y - nw.y;
        const rw = Math.max(1, sePt.x - nwPt.x);
        const rh = Math.max(1, sePt.y - nwPt.y);
        ctx.fillRect(x, y, rw, rh);
      }
    }
  }
}

function buildDeforestLayerFromData(map, geojson) {
  // Apply country bbox filter first, then driver filter
  const bboxFiltered = deforestCountryBbox
    ? geojson.features.filter((f) => {
        const [lng, lat] = f.geometry.coordinates;
        const { s, n, w, e } = deforestCountryBbox;
        return lat >= s && lat <= n && lng >= w && lng <= e;
      })
    : geojson.features;

  deforestFeatures = bboxFiltered;

  const visible =
    deforestActiveDrivers.size === 5
      ? bboxFiltered
      : bboxFiltered.filter((f) =>
          deforestActiveDrivers.has(f.properties.driver),
        );

  const pts = visible.map((f) => ({
    lng: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
    driver: f.properties.driver,
    cause: f.properties.cause,
  }));

  deforestLayer = new DeforestCanvasLayer(pts);
  deforestLayer.addTo(map);

  document.dispatchEvent(
    new CustomEvent("deforest-toggled", { detail: { active: true } }),
  );
}

function loadDeforestLayer(map) {
  if (deforestGeoJSON) {
    buildDeforestLayerFromData(map, deforestGeoJSON);
    return;
  }
  fetch("data/8-deforestation.geojson")
    .then((r) => {
      if (!r.ok) throw new Error(r.statusText);
      return r.json();
    })
    .then((geojson) => {
      deforestGeoJSON = geojson;
      buildDeforestLayerFromData(map, geojson);
    })
    .catch((err) => {
      console.warn("Deforestation layer failed to load:", err.message);
      deforestVisible = false;
      document.getElementById("deforest-toggle").classList.remove("active");
      showToast("Failed to load deforestation layer.");
    });
}

export function buildDeforestToggle(map) {
  deforestMap = map;
  const btn = document.getElementById("deforest-toggle");
  btn.addEventListener("click", () => {
    deforestVisible = !deforestVisible;
    btn.classList.toggle("active", deforestVisible);
    if (deforestVisible) {
      loadDeforestLayer(map);
    } else {
      if (deforestLayer) {
        map.removeLayer(deforestLayer);
        deforestLayer = null;
      }
      document.dispatchEvent(
        new CustomEvent("deforest-toggled", { detail: { active: false } }),
      );
    }
  });
}

/* ── Population Overlay ───────────────────────────────────────────────────── */

let populationLayer = null;
let populationVisible = false;
let populationGeoJSON = null; // cached so re-toggle skips re-fetch
let populationThreshold = 0; // norm value [0,1] — hide points below this

export function setPopulationThreshold(t) {
  populationThreshold = t;
  if (populationLayer) populationLayer._draw();
}

const popColorScale = d3.scaleSequential(d3.interpolateYlOrRd).domain([0, 1]);

function formatPop(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "k";
  return String(n);
}

class PopHeatmapLayer extends L.Layer {
  constructor(pts, colorScale) {
    super();
    this._pts = pts; // [{lat, lng, norm}]
    this._color = colorScale;
    this._draw = this._draw.bind(this);
    this._hide = this._hide.bind(this);
  }

  onAdd(map) {
    this._map = map;
    // Dedicated pane at z-index 350 — below overlayPane (400) where plant
    // markers live, so the heatmap never covers them.
    if (!map.getPane("populationPane")) {
      const pane = map.createPane("populationPane");
      pane.style.zIndex = "350";
      pane.style.pointerEvents = "none";
    }
    this._canvas = L.DomUtil.create(
      "canvas",
      "leaflet-zoom-hide",
      map.getPane("populationPane"),
    );
    map.on("movestart zoomstart", this._hide);
    map.on("viewreset moveend zoomend resize", this._draw);
    this._draw();
    return this;
  }

  onRemove(map) {
    L.DomUtil.remove(this._canvas);
    map.off("movestart zoomstart", this._hide);
    map.off("viewreset moveend zoomend resize", this._draw);
    return this;
  }

  _hide() {
    this._canvas.style.display = "none";
  }

  _draw() {
    const map = this._map;

    // Size and position the canvas to cover the visible area in layer coords
    const bounds = map.getBounds().pad(0.1);
    const nw = map.latLngToLayerPoint(bounds.getNorthWest());
    const se = map.latLngToLayerPoint(bounds.getSouthEast());
    const w = Math.max(1, se.x - nw.x);
    const h = Math.max(1, se.y - nw.y);

    const canvas = this._canvas;
    canvas.style.display = "";
    canvas.width = w;
    canvas.height = h;
    L.DomUtil.setPosition(canvas, nw); // positions via CSS transform in layer space

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

    const outCtx = canvas.getContext("2d");
    outCtx.clearRect(0, 0, w, h);
    if (pts.length === 0) return;

    // Pass 1 — accumulate intensity blobs using additive alpha blending
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const ctx = off.getContext("2d");
    ctx.globalCompositeOperation = "lighter";

    pts.forEach((p) => {
      // Draw in layer space offset by nw so (0,0) = canvas top-left
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
      const c = d3.color(this._color(t));
      data[i] = c.r;
      data[i + 1] = c.g;
      data[i + 2] = c.b;
      data[i + 3] = Math.round(t * 210);
    }
    outCtx.putImageData(imageData, 0, 0);
  }
}

function buildPopLayerFromData(map, geojson) {
  const pts = geojson.features.map((f) => ({
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
    norm: f.properties.norm,
  }));

  populationLayer = new PopHeatmapLayer(pts, popColorScale);
  populationLayer.addTo(map);
}

function loadPopulationLayer(map) {
  if (populationGeoJSON) {
    buildPopLayerFromData(map, populationGeoJSON);
    return;
  }
  fetch("data/5-population.geojson")
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
