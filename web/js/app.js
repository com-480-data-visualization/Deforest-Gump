import {
  buildLegend,
  buildFuelChips,
  buildCountrySelect,
  getActiveFuels,
  showLoading,
  hideLoading,
} from "./ui.js";
import { buildDeforestToggle, buildPopulationToggle } from "./overlays.js";
import { buildMarkers, applyFilters } from "./map.js";
import { EnergyHistogram, CountHistogram, CapacityPieChart } from "./charts.js";

buildLegend();

const map = L.map("map", { zoomControl: true, minZoom: 2 }).setView([20, 0], 2);

L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
  attribution: "© OpenStreetMap © CARTO",
  subdomains: "abcd",
  maxZoom: 19,
}).addTo(map);

buildDeforestToggle(map);
buildPopulationToggle();

const renderer = L.canvas({ padding: 0.5 });

showLoading();

d3.csv("data/4-power-plants.csv", (d) => ({
  name: d.name,
  country: d.country_long,
  fuel: d.primary_fuel,
  capacity: +d.capacity_mw,
  lat: +d.latitude,
  lng: +d.longitude,
}))
  .then((data) => {
    hideLoading();

    const countries = new Set(data.map((d) => d.country).filter(Boolean));
    buildCountrySelect(countries, onFilterChange);
    buildFuelChips(onFilterChange);

    const markers = buildMarkers(map, data, renderer);
    const avgCapacityChart = new EnergyHistogram("plot-1", data);
    const countChart = new CountHistogram("plot-2", data);
    const pieChart = new CapacityPieChart("plot-3", data);

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

    function onFilterChange() {
      const fuels = getActiveFuels();
      const country = document.getElementById("country-select").value;
      applyFilters(markers, fuels, country);
      refreshCharts();
    }

    map.on("moveend", refreshCharts);
    map.fire("moveend");
  })
  .catch(() => hideLoading());
