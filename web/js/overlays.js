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

/* ── Population Overlay (stub) ────────────────────────────────────────────── */

export function buildPopulationToggle() {
  const btn = document.getElementById("population-toggle");
  btn.addEventListener("click", () => {
    btn.classList.toggle("active");
    const active = btn.classList.contains("active");
    if (active) {
      btn.classList.remove("active");
      showToast("Population layer coming soon.");
    }
  });
}
