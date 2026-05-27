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
  getDeforestStatsByCountry,
  getDefinitiveDeforestPctByCountry,
  getNearestDeforestDriver,
  setDeforestDriverFilter,
  setDeforestCountryFilter,
  setPopulationThreshold,
  setPopulationCountryFilter,
} from "./overlays.js";
import { DEFOREST_COLORS, DEFOREST_CAUSES, FUELS, normalizeFuel } from "./constants.js";
import { buildMarkers, applyFilters } from "./map.js";
import {
  CapacityTreemap,
  CorrelationScatter,
  TopDeforestCountries,
  FossilGauge,
  DeforestGauge,
  ConclusionScatter,
} from "./charts.js";

const map = L.map("map", { zoomControl: true, minZoom: 2 }).setView([20, 0], 2);

L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
  attribution: "© OpenStreetMap © CARTO",
  subdomains: "abcd",
  maxZoom: 19,
}).addTo(map);

buildDeforestToggle(map);
buildPopulationToggle(map);
document.getElementById("deforest-toggle").click();

const plantsPane = map.createPane("plantsPane");
plantsPane.style.zIndex = "410";
const renderer = L.canvas({ padding: 0.5, pane: "plantsPane" });

/* Toggle a button so its active state matches `want`. */
const setToggle = (btn, want) => {
  if (btn.classList.contains("active") !== want) btn.click();
};

/* Set every checkbox under selector to checked + sync its chip class. */
const checkAllChips = (selector, chipClass) => {
  document.querySelectorAll(selector).forEach((inp) => {
    if (!inp.checked) {
      inp.checked = true;
      inp.closest("." + chipClass).classList.add("checked");
    }
  });
};

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
    const countryToIso3 = new Map(
      data.filter((d) => d.country && d.iso3).map((d) => [d.country, d.iso3]),
    );
    const iso3ToCountry = new Map(
      data.filter((d) => d.iso3 && d.country).map((d) => [d.iso3, d.country]),
    );

    buildCountrySelect(countries, onFilterChange);
    let pieChart;
    buildFuelChips(() => { pieChart?.resetSelection(); onFilterChange(); });
    buildDriverChips(() => { refreshDeforestSidebar(); refreshCharts(); });
    buildPopSlider();

    const { markers, group: plantsGroup } = buildMarkers(
      map, data, renderer,
      (lat, lng) => getNearestDeforestDriver(lat, lng),
    );

    let plantsVisible = true;
    const plantsBtn = document.getElementById("plants-toggle");
    const deforestBtn = document.getElementById("deforest-toggle");
    const populationBtn = document.getElementById("population-toggle");
    const fuelTool = document.getElementById("fuel-tool");
    const fuelDivider = document.getElementById("fuel-divider");

    const cards = {
      detail: document.getElementById("plant-detail-card"),
      plantStats: document.getElementById("plant-stats"),
      totalCap: document.getElementById("total-capacity-card"),
      fossilForest: document.getElementById("fossil-forest-card"),
      fossilShare: document.getElementById("fossil-share-card"),
      topDeforest: document.getElementById("top-deforest-card"),
      deforestShare: document.getElementById("deforest-share-card"),
    };

    function updateSidePanelVisibility() {
      const deforestOn = isDeforestVisible();
      const both = plantsVisible && deforestOn;
      cards.detail.classList.toggle("hidden", !plantsVisible);
      cards.plantStats.classList.toggle("hidden", !plantsVisible);
      cards.totalCap.classList.toggle("hidden", !plantsVisible);
      cards.fossilShare.classList.toggle("hidden", !plantsVisible);
      cards.topDeforest.classList.toggle("hidden", !deforestOn);
      cards.deforestShare.classList.toggle("hidden", !deforestOn);
      cards.fossilForest.classList.toggle("hidden", !both);
    }

    plantsBtn.addEventListener("click", () => {
      plantsVisible = !plantsVisible;
      plantsBtn.classList.toggle("active", plantsVisible);
      fuelTool.classList.toggle("hidden", !plantsVisible);
      fuelDivider.classList.toggle("hidden", !plantsVisible);
      updateSidePanelVisibility();
      if (plantsVisible) plantsGroup.addTo(map);
      else map.removeLayer(plantsGroup);
    });

    map.on("zoomstart", () => { plantsPane.style.visibility = "hidden"; });
    map.on("zoomend", () => { if (plantsVisible) plantsPane.style.visibility = ""; });

    pieChart = new CapacityTreemap("plot-3", data, (fuel) => {
      document.querySelectorAll("#fuel-chips input").forEach((inp) => {
        const checked = fuel === null || inp.value === fuel;
        inp.checked = checked;
        inp.closest(".fuel-chip").classList.toggle("checked", checked);
      });
      onFilterChange();
    });
    const fossilGauge = new FossilGauge("plot-7");
    const deforestGauge = new DeforestGauge("plot-9");
    const topDeforestChart = new TopDeforestCountries("plot-8", iso3ToCountry);
    const conclusionScatter = new ConclusionScatter("plot-11", correlationData);

    const scatter = new CorrelationScatter("plot-4", correlationData, (countryName) => {
      const sel = document.getElementById("country-select");
      sel.value = [...sel.options].some((o) => o.value === countryName) ? countryName : "ALL";
      onFilterChange();
    });

    const getViewArgs = () => {
      const b = map.getBounds();
      return [b.getSouth(), b.getNorth(), b.getWest(), b.getEast()];
    };

    const getActiveDrivers = () =>
      new Set([...document.querySelectorAll("#driver-chips input:checked")].map((el) => +el.value));

    const filterByActiveDrivers = (counts) => {
      const active = getActiveDrivers();
      return Object.fromEntries(
        Object.entries(counts).map(([k, v]) => [k, active.has(+k) ? v : 0]),
      );
    };

    function refreshCharts() {
      const fuels = getActiveFuels();
      const country = document.getElementById("country-select").value;
      const [s, n, w, e] = getViewArgs();
      pieChart.update(s, n, w, e, fuels, country);

      const visiblePlants = data.filter((d) =>
        d.lat >= s && d.lat <= n && d.lng >= w && d.lng <= e &&
        (country === "ALL" || d.country === country) &&
        fuels.includes(normalizeFuel(d.fuel))
      );

      const counts = Object.fromEntries(FUELS.map((f) => [f, 0]));
      visiblePlants.forEach((d) => { counts[normalizeFuel(d.fuel)]++; });
      showPlantStats(counts);

      const deforestByIso3 = getDeforestStatsByCountry(s, n, w, e);
      scatter.update(visiblePlants, deforestByIso3);
      fossilGauge.update(visiblePlants);
      deforestGauge.update(filterByActiveDrivers(getDeforestStats(s, n, w, e)));
      topDeforestChart.update(deforestByIso3);
    }

    function refreshDeforestSidebar() {
      if (!isDeforestVisible()) return;
      const [s, n, w, e] = getViewArgs();
      showDeforestStats(filterByActiveDrivers(getDeforestStats(s, n, w, e)));
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

    let conclusionSeeded = false;

    // Deforest GeoJSON (3.5MB) may finish loading before Promise.all resolves,
    // firing deforest-toggled before our listener was attached. Seed eagerly.
    if (isDeforestVisible()) {
      const defData = getDefinitiveDeforestPctByCountry();
      if (defData) {
        conclusionScatter.update(defData);
        conclusionSeeded = true;
      }
    }

    document.addEventListener("deforest-toggled", (e) => {
      updateSidePanelVisibility();
      if (e.detail.active) {
        refreshDeforestSidebar();
        refreshCharts();
        if (!conclusionSeeded) {
          conclusionScatter.update(getDefinitiveDeforestPctByCountry());
          conclusionSeeded = true;
        }
      } else {
        hideDeforestStats();
        refreshCharts();
      }
    });

    map.on("moveend", () => { refreshCharts(); refreshDeforestSidebar(); });
    map.fire("moveend");

    document.getElementById("reset-btn").addEventListener("click", () => {
      map.setView([20, 0], 2);

      document.getElementById("country-select").value = "ALL";

      checkAllChips("#fuel-chips input", "fuel-chip");
      pieChart?.resetSelection();

      const allDrivers = [];
      document.querySelectorAll("#driver-chips input").forEach((inp) => {
        allDrivers.push(+inp.value);
        if (!inp.checked) {
          inp.checked = true;
          inp.closest(".driver-chip").classList.add("checked");
        }
      });
      setDeforestDriverFilter(allDrivers);

      setToggle(plantsBtn, true);
      setToggle(deforestBtn, true);
      setToggle(populationBtn, false);

      const slider = document.getElementById("population-slider");
      if (slider) { slider.value = 0; slider.dispatchEvent(new Event("input")); }

      onFilterChange();
    });

    document.querySelectorAll(".dispatch[data-lat]").forEach((btn) => {
      btn.addEventListener("click", () => {
        checkAllChips("#fuel-chips input", "fuel-chip");
        const allDrivers = [];
        document.querySelectorAll("#driver-chips input").forEach((inp) => allDrivers.push(+inp.value));
        checkAllChips("#driver-chips input", "driver-chip");
        setDeforestDriverFilter(allDrivers);

        document.getElementById("country-select").value = btn.dataset.country || "ALL";
        onFilterChange();

        const overlays = btn.dataset.overlays
          ? btn.dataset.overlays.split(",").map((s) => s.trim())
          : ["plants", "deforest", "population"];
        if (overlays.includes("plants") !== plantsVisible) plantsBtn.click();
        setToggle(deforestBtn, overlays.includes("deforest"));
        setToggle(populationBtn, overlays.includes("population"));

        document.querySelector(".top-row").scrollIntoView({ behavior: "smooth" });
        map.flyTo([+btn.dataset.lat, +btn.dataset.lng], +btn.dataset.zoom, { duration: 1.5 });
      });
    });
  })
  .catch(() => hideLoading());

function buildDriverChips(onDriverChange) {
  const container = document.getElementById("driver-chips");
  if (!container) return;
  Object.entries(DEFOREST_CAUSES).forEach(([driver, label]) => {
    const chip = document.createElement("label");
    chip.className = "driver-chip checked";
    chip.innerHTML = `
      <input type="checkbox" value="${driver}" checked>
      <span class="chip-dot" style="background:${DEFOREST_COLORS[driver]}"></span>
      ${label.split(" ")[0]}`;
    chip.querySelector("input").addEventListener("change", (e) => {
      chip.classList.toggle("checked", e.target.checked);
      const active = [...document.querySelectorAll("#driver-chips input:checked")].map((el) => +el.value);
      setDeforestDriverFilter(active);
      onDriverChange?.();
    });
    container.appendChild(chip);
  });
}

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
