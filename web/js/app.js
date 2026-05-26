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
    let pieChart;
    buildFuelChips(() => { if (pieChart) pieChart.resetSelection(); onFilterChange(); });
    buildDriverChips(() => { refreshDeforestSidebar(); refreshCharts(); });
    buildPopSlider();

    /* getNearest callback: injected into buildMarkers to avoid circular dep */
    const getNearest = (lat, lng) => getNearestDeforestDriver(lat, lng);

    const { markers, group: plantsGroup } = buildMarkers(map, data, renderer, getNearest);

    let plantsVisible = true;
    const plantsBtn = document.getElementById("plants-toggle");
    const fuelTool = document.getElementById("fuel-tool");
    const fuelDivider = document.getElementById("fuel-divider");
    const plantDetailCard = document.getElementById("plant-detail-card");
    const plantStatsCard = document.getElementById("plant-stats");
    const totalCapacityCard = document.getElementById("total-capacity-card");
    const fossilForestCard = document.getElementById("fossil-forest-card");
    const fossilShareCard = document.getElementById("fossil-share-card");
    const topDeforestCard = document.getElementById("top-deforest-card");
    const deforestShareCard = document.getElementById("deforest-share-card");

    function updateSidePanelVisibility() {
      const deforestOn = isDeforestVisible();
      const both = plantsVisible && deforestOn;
      plantDetailCard.classList.toggle("hidden", !plantsVisible);
      plantStatsCard.classList.toggle("hidden", !plantsVisible);
      totalCapacityCard.classList.toggle("hidden", !plantsVisible);
      fossilShareCard.classList.toggle("hidden", !plantsVisible);
      topDeforestCard.classList.toggle("hidden", !deforestOn);
      deforestShareCard.classList.toggle("hidden", !deforestOn);
      fossilForestCard.classList.toggle("hidden", !both);
    }

    plantsBtn.addEventListener("click", () => {
      plantsVisible = !plantsVisible;
      plantsBtn.classList.toggle("active", plantsVisible);
      fuelTool.classList.toggle("hidden", !plantsVisible);
      fuelDivider.classList.toggle("hidden", !plantsVisible);
      updateSidePanelVisibility();
      if (plantsVisible) {
        plantsGroup.addTo(map);
      } else {
        map.removeLayer(plantsGroup);
      }
    });

    map.on("zoomstart", () => { plantsPane.style.visibility = "hidden"; });
    map.on("zoomend",   () => { if (plantsVisible) plantsPane.style.visibility = ""; });

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
    const iso3ToCountry = new Map(data.filter((d) => d.iso3 && d.country).map((d) => [d.iso3, d.country]));
    const topDeforestChart = new TopDeforestCountries("plot-8", iso3ToCountry);
    const conclusionScatter = new ConclusionScatter("plot-11", correlationData);

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
      const [s, n, w, e] = getViewArgs();
      const viewArgs = [s, n, w, e, fuels, country];
      pieChart.update(...viewArgs);
      refreshPlantStats();

      const visiblePlants = data.filter((d) =>
        d.lat >= s && d.lat <= n && d.lng >= w && d.lng <= e &&
        (country === "ALL" || d.country === country) &&
        fuels.includes(normalizeFuel(d.fuel))
      );
      const deforestByIso3 = getDeforestStatsByCountry(s, n, w, e);
      scatter.update(visiblePlants, deforestByIso3);
      fossilGauge.update(visiblePlants);
      deforestGauge.update(filterByActiveDrivers(getDeforestStats(s, n, w, e)));
      topDeforestChart.update(deforestByIso3);
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

    let conclusionScatterSeeded = false;
    document.addEventListener("deforest-toggled", (e) => {
      updateSidePanelVisibility();
      if (e.detail.active) {
        refreshDeforestSidebar();
        refreshCharts();
        if (!conclusionScatterSeeded) {
          conclusionScatter.update(getDefinitiveDeforestPctByCountry());
          conclusionScatterSeeded = true;
        }
      } else {
        hideDeforestStats();
        refreshCharts();
      }
    });

    map.on("moveend", () => {
      refreshCharts();
      refreshDeforestSidebar();
    });
    map.fire("moveend");

    function wireGuidedViews() {
      document.querySelectorAll(".act-card[data-lat]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const lat = +btn.dataset.lat;
          const lng = +btn.dataset.lng;
          const zoom = +btn.dataset.zoom;

          // Select all fuel types
          document.querySelectorAll("#fuel-chips input").forEach((inp) => {
            if (!inp.checked) {
              inp.checked = true;
              inp.closest(".fuel-chip").classList.add("checked");
            }
          });

          // Select all deforestation drivers
          const allDrivers = [];
          document.querySelectorAll("#driver-chips input").forEach((inp) => {
            if (!inp.checked) {
              inp.checked = true;
              inp.closest(".driver-chip").classList.add("checked");
            }
            allDrivers.push(+inp.value);
          });
          setDeforestDriverFilter(allDrivers);

          // Set country filter (use data-country if specified, else ALL)
          const country = btn.dataset.country || "ALL";
          document.getElementById("country-select").value = country;
          onFilterChange();

          // Activate the correct overlays before flying
          const overlays = btn.dataset.overlays ? btn.dataset.overlays.split(",").map((s) => s.trim()) : ["plants", "deforest", "population"];

          const wantPlants = overlays.includes("plants");
          if (wantPlants && !plantsVisible) plantsBtn.click();
          if (!wantPlants && plantsVisible) plantsBtn.click();

          const deforestBtn = document.getElementById("deforest-toggle");
          const wantDeforest = overlays.includes("deforest");
          if (wantDeforest && !deforestBtn.classList.contains("active")) deforestBtn.click();
          if (!wantDeforest && deforestBtn.classList.contains("active")) deforestBtn.click();

          const populationBtn = document.getElementById("population-toggle");
          const wantPop = overlays.includes("population");
          if (wantPop && !populationBtn.classList.contains("active")) populationBtn.click();
          if (!wantPop && populationBtn.classList.contains("active")) populationBtn.click();

          // Scroll to map and fly simultaneously
          document.querySelector(".top-row").scrollIntoView({ behavior: "smooth" });
          map.flyTo([lat, lng], zoom, { duration: 1.5 });
        });
      });
    }

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

/* ── Toolbar pushed up by conclusion section on scroll ───────────────────── */

(function () {
  const toolbar = document.getElementById("controls");
  const conclusion = document.querySelector(".conclusion-section");
  if (!toolbar || !conclusion) return;

  let rafId = null;

  function update() {
    const toolbarH = toolbar.offsetHeight;
    const conclusionTop = conclusion.getBoundingClientRect().top;
    // overlap = how many px of the conclusion section are above the toolbar bottom
    const overlap = Math.min(toolbarH, Math.max(0, toolbarH - conclusionTop));
    toolbar.style.transform = `translateY(${-overlap}px)`;
    toolbar.style.pointerEvents = overlap >= toolbarH ? "none" : "";
  }

  window.addEventListener("scroll", () => {
    if (rafId) return;
    rafId = requestAnimationFrame(() => { rafId = null; update(); });
  }, { passive: true });

  update();
})();
