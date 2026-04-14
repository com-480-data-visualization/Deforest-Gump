import { DEFOREST_COLORS } from "./constants.js";
import { showToast } from "./ui.js";

/* ── Deforestation Overlay ────────────────────────────────────────────────── */

let deforestLayer = null;
let deforestVisible = false;

function loadDeforestLayer(map) {
  fetch("data/8-deforestation.geojson")
    .then((r) => {
      if (!r.ok) throw new Error(r.statusText);
      return r.json();
    })
    .then((geojson) => {
      deforestLayer = L.geoJSON(geojson, {
        style: (f) => ({
          fillColor: DEFOREST_COLORS[f.properties.driver] ?? "#ccc",
          fillOpacity: 0.45,
          weight: 0,
        }),
      }).addTo(map);
    })
    .catch((err) => {
      console.warn("Deforestation layer not available:", err.message);
      deforestVisible = false;
      document.getElementById("deforest-toggle").classList.remove("active");
      showToast("Deforestation layer not available. Wait for the milestone 3.");
    });
}

export function buildDeforestToggle(map) {
  const btn = document.getElementById("deforest-toggle");
  btn.addEventListener("click", () => {
    deforestVisible = !deforestVisible;
    btn.classList.toggle("active", deforestVisible);
    if (deforestVisible) {
      loadDeforestLayer(map);
    } else if (deforestLayer) {
      map.removeLayer(deforestLayer);
      deforestLayer = null;
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
      showToast("Population layer not available. Wait for the milestone 3.");
    }
  });
}
