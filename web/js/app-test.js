import {
  buildLegend,
  buildFuelChips,
  buildCountrySelect,
  getActiveFuels,
  showLoading,
  hideLoading,
  showDeforestStats,
  hideDeforestStats,
} from "./ui.js";
import {
  buildDeforestToggle,
  buildPopulationToggle,
  isDeforestVisible,
  getDeforestStats,
  getNearestDeforestDriver,
  setDeforestDriverFilter,
} from "./overlays.js";
import { DEFOREST_COLORS, DEFOREST_CAUSES } from "./constants.js";
import { buildMarkers, applyFilters } from "./map.js";
import {
  EnergyHistogram,
  CountHistogram,
  CapacityPieChart,
  CorrelationScatter,
} from "./charts.js";

buildLegend();

const map = L.map("map", { zoomControl: true, minZoom: 2 }).setView([20, 0], 2);

L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
  attribution: "© OpenStreetMap © CARTO",
  subdomains: "abcd",
  maxZoom: 19,
}).addTo(map);

buildDeforestToggle(map);
buildPopulationToggle(map);

const renderer = L.canvas({ padding: 0.5 });

showLoading();

Promise.all([
  d3.csv("data/4-power-plants.csv", (d) => ({
    name: d.name,
    country: d.country_long,
    fuel: d.primary_fuel,
    capacity: +d.capacity_mw,
    lat: +d.latitude,
    lng: +d.longitude,
  })),
  d3.json("data/country-correlation.json"),
])
  .then(([data, correlationData]) => {
    hideLoading();

    const countries = new Set(data.map((d) => d.country).filter(Boolean));
    buildCountrySelect(countries, onFilterChange);
    buildFuelChips(onFilterChange);
    buildDriverChips();

    /* getNearest callback: injected into buildMarkers to avoid circular dep */
    const getNearest = (lat, lng) =>
      isDeforestVisible() ? getNearestDeforestDriver(lat, lng) : null;

    const markers = buildMarkers(map, data, renderer, getNearest);
    const avgCapacityChart = new EnergyHistogram("plot-1", data);
    const countChart = new CountHistogram("plot-2", data);
    const pieChart = new CapacityPieChart("plot-3", data);

    const scatter = new CorrelationScatter(
      "plot-4",
      correlationData,
      (countryName) => {
        const sel = document.getElementById("country-select");
        if ([...sel.options].some((o) => o.value === countryName)) {
          sel.value = countryName;
        } else {
          sel.value = "ALL";
        }
        onFilterChange();
      },
    );

    function getViewArgs() {
      const b = map.getBounds();
      return [b.getSouth(), b.getNorth(), b.getWest(), b.getEast()];
    }

    function refreshCharts() {
      const fuels = getActiveFuels();
      const country = document.getElementById("country-select").value;
      const viewArgs = [...getViewArgs(), fuels, country];
      avgCapacityChart.update(...viewArgs);
      countChart.update(...viewArgs);
      pieChart.update(...viewArgs);
    }

    function refreshDeforestSidebar() {
      if (!isDeforestVisible()) return;
      const [s, n, w, e] = getViewArgs();
      showDeforestStats(getDeforestStats(s, n, w, e));
    }

    function onFilterChange() {
      const fuels = getActiveFuels();
      const country = document.getElementById("country-select").value;
      applyFilters(markers, fuels, country);
      refreshCharts();
      scatter.highlightCountry(country);
    }

    document.addEventListener("deforest-toggled", (e) => {
      if (e.detail.active) {
        refreshDeforestSidebar();
      } else {
        hideDeforestStats();
      }
    });

    map.on("moveend", () => {
      refreshCharts();
      refreshDeforestSidebar();
    });
    map.fire("moveend");

    wireGuidedViews();
  })
  .catch(() => hideLoading());

/* ── Driver filter chips ────────────────────────────────────────────────── */

function buildDriverChips() {
  const container = document.getElementById("driver-chips");
  if (!container) return;
  Object.entries(DEFOREST_CAUSES).forEach(([driver, label]) => {
    const shortLabel = label.split(" ")[0]; // "Commodity", "Shifting", "Forestry"…
    const chip = document.createElement("label");
    chip.className = "driver-chip checked";
    chip.innerHTML = `
      <input type="checkbox" value="${driver}" checked>
      <span class="chip-dot" style="background:${DEFOREST_COLORS[driver]}"></span>
      ${shortLabel}`;
    chip.querySelector("input").addEventListener("change", (e) => {
      chip.classList.toggle("checked", e.target.checked);
      const active = [
        ...document.querySelectorAll("#driver-chips input:checked"),
      ].map((el) => +el.value);
      setDeforestDriverFilter(active);
    });
    container.appendChild(chip);
  });
}

/* ── Guided view buttons ────────────────────────────────────────────────── */

function wireGuidedViews() {
  document.querySelectorAll(".act-card[data-lat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const lat = +btn.dataset.lat;
      const lng = +btn.dataset.lng;
      const zoom = +btn.dataset.zoom;
      map.flyTo([lat, lng], zoom, { duration: 1.5 });

      /* Auto-enable deforestation overlay for context */
      const deforestBtn = document.getElementById("deforest-toggle");
      if (!deforestBtn.classList.contains("active")) {
        deforestBtn.click();
      }
    });
  });
}
