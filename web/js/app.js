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
import { buildDeforestToggle, buildPopulationToggle, isDeforestVisible, getDeforestStats } from "./overlays.js";
import { buildMarkers, applyFilters } from "./map.js";
import { EnergyHistogram, CountHistogram, CapacityPieChart, CorrelationScatter } from "./charts.js";

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

    const markers = buildMarkers(map, data, renderer);
    const avgCapacityChart = new EnergyHistogram("plot-1", data);
    const countChart = new CountHistogram("plot-2", data);
    const pieChart = new CapacityPieChart("plot-3", data);

    new CorrelationScatter("plot-4", correlationData, (countryName) => {
      const sel = document.getElementById("country-select");
      if ([...sel.options].some((o) => o.value === countryName)) {
        sel.value = countryName;
      } else {
        sel.value = "ALL";
      }
      onFilterChange();
    });

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
    }

    document.addEventListener("deforest-toggled", (e) => {
      if (e.detail.active) {
        refreshDeforestSidebar();
      } else {
        hideDeforestStats();
      }
    });

    map.on("moveend", () => { refreshCharts(); refreshDeforestSidebar(); });
    map.fire("moveend");
  })
  .catch(() => hideLoading());
