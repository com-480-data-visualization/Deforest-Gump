import {
  buildFuelChips,
  buildCountrySelect,
  getActiveFuels,
  showLoading,
  hideLoading,
  showDeforestStats,
  hideDeforestStats,
  showPlantStats,
} from "./ui.js";
import {
  buildDeforestToggle,
  buildPopulationToggle,
  isDeforestVisible,
  getDeforestStats,
  getNearestDeforestDriver,
  setDeforestDriverFilter,
  setDeforestCountryFilter,
  setPopulationThreshold,
  setPopulationCountryFilter,
} from "./overlays.js";
import { DEFOREST_COLORS, DEFOREST_CAUSES, FUELS, normalizeFuel } from "./constants.js";
import { buildMarkers, applyFilters } from "./map.js";
import {
  EnergyHistogram,
  CountHistogram,
  CapacityPieChart,
  CorrelationScatter,
  DeforestHistogram,
} from "./charts.js";

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
    iso3: d.country,
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
    const countryToIso3 = new Map(data.filter((d) => d.country && d.iso3).map((d) => [d.country, d.iso3]));
    buildCountrySelect(countries, onFilterChange);
    buildFuelChips(onFilterChange);
    buildDriverChips(() => { refreshDeforestSidebar(); refreshDeforestDist(); });
    buildPopSlider();

    /* getNearest callback: injected into buildMarkers to avoid circular dep */
    const getNearest = (lat, lng) =>
      isDeforestVisible() ? getNearestDeforestDriver(lat, lng) : null;

    const { markers, group: plantsGroup } = buildMarkers(map, data, renderer, getNearest);

    let plantsVisible = true;
    const plantsBtn = document.getElementById("plants-toggle");
    const fuelTool = document.getElementById("fuel-tool");
    const fuelDivider = document.getElementById("fuel-divider");
    const plantDetailCard = document.getElementById("plant-detail-card");
    const plantStatsCard = document.getElementById("plant-stats");
    plantsBtn.addEventListener("click", () => {
      plantsVisible = !plantsVisible;
      plantsBtn.classList.toggle("active", plantsVisible);
      fuelTool.classList.toggle("hidden", !plantsVisible);
      fuelDivider.classList.toggle("hidden", !plantsVisible);
      plantDetailCard.classList.toggle("hidden", !plantsVisible);
      plantStatsCard.classList.toggle("hidden", !plantsVisible);
      if (plantsVisible) {
        plantsGroup.addTo(map);
      } else {
        map.removeLayer(plantsGroup);
      }
    });
    const avgCapacityChart = new EnergyHistogram("plot-1", data);
    const countChart = new CountHistogram("plot-2", data);
    const pieChart = new CapacityPieChart("plot-3", data);
    const deforestDistChart = new DeforestHistogram("plot-5");
    const plantDistChart = new CountHistogram("plot-6", data);

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

    function refreshPlantStats() {
      const fuels = getActiveFuels();
      const country = document.getElementById("country-select").value;
      const [s, n, w, e] = getViewArgs();
      const counts = Object.fromEntries(FUELS.map((f) => [f, 0]));
      data.forEach((d) => {
        if (d.lat < s || d.lat > n || d.lng < w || d.lng > e) return;
        if (country !== "ALL" && d.country !== country) return;
        const fuel = normalizeFuel(d.fuel);
        if (!fuels.includes(fuel)) return;
        counts[fuel]++;
      });
      showPlantStats(counts);
    }

    function refreshCharts() {
      const fuels = getActiveFuels();
      const country = document.getElementById("country-select").value;
      const viewArgs = [...getViewArgs(), fuels, country];
      avgCapacityChart.update(...viewArgs);
      countChart.update(...viewArgs);
      pieChart.update(...viewArgs);
      plantDistChart.update(...viewArgs);
      refreshPlantStats();
    }

    function getActiveDrivers() {
      return new Set(
        [...document.querySelectorAll("#driver-chips input:checked")].map((el) => +el.value)
      );
    }

    function filterByActiveDrivers(counts) {
      const active = getActiveDrivers();
      return Object.fromEntries(
        Object.entries(counts).map(([k, v]) => [k, active.has(+k) ? v : 0])
      );
    }

    function refreshDeforestSidebar() {
      if (!isDeforestVisible()) return;
      const [s, n, w, e] = getViewArgs();
      showDeforestStats(filterByActiveDrivers(getDeforestStats(s, n, w, e)));
    }

    function refreshDeforestDist() {
      if (!isDeforestVisible()) { deforestDistChart.update(null); return; }
      deforestDistChart.update(filterByActiveDrivers(getDeforestStats(...getViewArgs())));
    }

    function onFilterChange() {
      const fuels = getActiveFuels();
      const country = document.getElementById("country-select").value;
      applyFilters(markers, fuels, country);
      refreshCharts();
      scatter.highlightCountry(country);
      const iso3 = country === "ALL" ? null : (countryToIso3.get(country) ?? null);
      setDeforestCountryFilter(iso3);
      setPopulationCountryFilter(iso3);
    }

    document.addEventListener("deforest-toggled", (e) => {
      if (e.detail.active) {
        refreshDeforestSidebar();
        refreshDeforestDist();
      } else {
        hideDeforestStats();
        deforestDistChart.update(null);
      }
    });

    map.on("moveend", () => {
      refreshCharts();
      refreshDeforestSidebar();
      refreshDeforestDist();
    });
    map.fire("moveend");

    wireGuidedViews();
  })
  .catch(() => hideLoading());

/* ── Driver filter chips ────────────────────────────────────────────────── */

function buildDriverChips(onDriverChange) {
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
      onDriverChange?.();
    });
    container.appendChild(chip);
  });
}

/* ── Population density slider ──────────────────────────────────────────── */

function buildPopSlider() {
  const slider = document.getElementById("population-slider");
  const label = document.getElementById("pop-threshold-label");
  const bar = document.getElementById("pop-gradient-bar");
  if (!slider) return;
  slider.addEventListener("input", () => {
    const val = +slider.value;
    label.textContent = val === 0 ? "All" : `≥ ${val}%`;
    bar.style.setProperty("--filter-pct", val + "%");
    setPopulationThreshold(val / 100);
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
