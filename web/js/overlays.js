import { DEFOREST_COLORS, DEFOREST_CAUSES } from "./constants.js";
import { showToast } from "./ui.js";

/* ── Deforestation Overlay ────────────────────────────────────────────────── */

let deforestLayer = null;
let deforestVisible = false;

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

function loadDeforestLayer(map) {
  fetch("data/8-deforestation.geojson")
    .then((r) => {
      if (!r.ok) throw new Error(r.statusText);
      return r.json();
    })
    .then((geojson) => {
      deforestLayer = L.geoJSON(geojson, {
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
      }).addTo(map);

      buildDeforestLegend();
      document.getElementById("deforest-legend-card").classList.remove("hidden");
    })
    .catch((err) => {
      console.warn("Deforestation layer failed to load:", err.message);
      deforestVisible = false;
      document.getElementById("deforest-toggle").classList.remove("active");
      showToast("Failed to load deforestation layer.");
    });
}

export function buildDeforestToggle(map) {
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
    }
  });
}

/* ── Population Overlay ───────────────────────────────────────────────────── */

let populationLayer = null;
let populationVisible = false;

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
    { label: "10 k",  norm: 0.4 },
    { label: "100 k", norm: 0.65 },
    { label: "1 M+",  norm: 1.0 },
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

function loadPopulationLayer(map) {
  fetch("data/5-population.geojson")
    .then((r) => {
      if (!r.ok) throw new Error(r.statusText);
      return r.json();
    })
    .then((geojson) => {
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
