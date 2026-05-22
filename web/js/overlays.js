import { DEFOREST_COLORS, DEFOREST_CAUSES } from "./constants.js";
import { showToast } from "./ui.js";

/* ── Deforestation Overlay ────────────────────────────────────────────────── */

let deforestMap = null;
let deforestLayer = null;
let deforestVisible = false;
let deforestFeatures = []; // all features — used for stats + nearest lookup
let deforestGeoJSON = null; // cached raw GeoJSON so re-toggle skips re-fetch
let deforestActiveDrivers = new Set([1, 2, 3, 4, 5]);

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

function buildDeforestLegend() {
  const el = document.getElementById("deforest-legend");
  if (!el || el.children.length > 0) return;
  Object.entries(DEFOREST_CAUSES).forEach(([driver, label]) => {
    el.insertAdjacentHTML(
      "beforeend",
      `<div class="legend-item">
        <span class="legend-dot" style="background:${DEFOREST_COLORS[driver]}"></span>
        <span>${label}</span>
      </div>`,
    );
  });
}

function buildDeforestLayerFromData(map, geojson) {
  deforestFeatures = geojson.features;

  const visible =
    deforestActiveDrivers.size === 5
      ? geojson.features
      : geojson.features.filter((f) =>
          deforestActiveDrivers.has(f.properties.driver),
        );

  deforestLayer = L.geoJSON(
    { type: "FeatureCollection", features: visible },
    {
      pointToLayer: (f, latlng) =>
        L.circleMarker(latlng, {
          radius: 4,
          fillColor: DEFOREST_COLORS[f.properties.driver] ?? "#ccc",
          fillOpacity: 0.55,
          color: "transparent",
          weight: 0,
        }),
      onEachFeature: (f, layer) => {
        layer.bindTooltip(f.properties.cause, {
          sticky: true,
          className: "deforest-tooltip",
        });
      },
    },
  ).addTo(map);

  buildDeforestLegend();
  document.getElementById("deforest-legend-card").classList.remove("hidden");
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
      document.getElementById("deforest-legend-card").classList.add("hidden");
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

const popColorScale = d3.scaleSequential(d3.interpolateYlOrRd).domain([0, 1]);

function formatPop(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "k";
  return String(n);
}

function buildPopulationLegend() {
  const el = document.getElementById("population-legend");
  if (!el || el.children.length > 0) return;
  const steps = [
    { label: "< 1 k", norm: 0.1 },
    { label: "10 k", norm: 0.4 },
    { label: "100 k", norm: 0.65 },
    { label: "1 M+", norm: 1.0 },
  ];
  steps.forEach(({ label, norm }) => {
    el.insertAdjacentHTML(
      "beforeend",
      `<div class="legend-item">
        <span class="legend-dot" style="background:${popColorScale(norm)}"></span>
        <span>${label} people / 10 km²</span>
      </div>`,
    );
  });
}

function buildPopLayerFromData(map, geojson) {
  populationLayer = L.geoJSON(geojson, {
    pointToLayer: (f, latlng) =>
      L.circleMarker(latlng, {
        radius: 3,
        fillColor: popColorScale(f.properties.norm),
        fillOpacity: 0.6,
        color: "transparent",
        weight: 0,
      }),
    onEachFeature: (f, layer) => {
      layer.bindTooltip(`${formatPop(f.properties.pop)} people`, {
        sticky: true,
        className: "deforest-tooltip",
      });
    },
  }).addTo(map);

  buildPopulationLegend();
  document.getElementById("population-legend-card").classList.remove("hidden");
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
    if (populationVisible) {
      loadPopulationLayer(map);
    } else {
      if (populationLayer) {
        map.removeLayer(populationLayer);
        populationLayer = null;
      }
      document.getElementById("population-legend-card").classList.add("hidden");
    }
  });
}
