import {
  FUELS,
  FUEL_COLORS,
  normalizeFuel,
  escapeHtml,
  DEFOREST_COLORS,
  DEFOREST_CAUSES,
} from "./constants.js";

/* ── Toolbar height → CSS variable (keeps map sticky offset correct) ──────── */

const toolbar = document.getElementById("controls");
function syncToolbarHeight() {
  document.documentElement.style.setProperty("--toolbar-h", toolbar.offsetHeight + "px");
}
syncToolbarHeight();
new ResizeObserver(syncToolbarHeight).observe(toolbar);

/* ── Intro banner ─────────────────────────────────────────────────────────── */

const introBanner = document.getElementById("intro-banner");
document.getElementById("intro-dismiss").addEventListener("click", () => {
  introBanner.classList.add("intro-hidden");
});

/* ── Loading overlay ──────────────────────────────────────────────────────── */

const loading = document.getElementById("loading");
export const showLoading = () => loading.classList.add("visible");
export const hideLoading = () => loading.classList.remove("visible");

/* ── Toast notification ───────────────────────────────────────────────────── */

export function showToast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

/* ── Fuel chips ───────────────────────────────────────────────────────────── */

export function buildFuelChips(onChange) {
  const container = document.getElementById("fuel-chips");
  FUELS.forEach((fuel) => {
    const chip = document.createElement("label");
    chip.className = "fuel-chip checked";
    chip.innerHTML = `
      <input type="checkbox" value="${fuel}" checked>
      <span class="chip-dot" style="background:${FUEL_COLORS[fuel]}"></span>
      ${fuel}`;
    chip.querySelector("input").addEventListener("change", (e) => {
      chip.classList.toggle("checked", e.target.checked);
      onChange();
    });
    container.appendChild(chip);
  });
}

export const getActiveFuels = () =>
  [...document.querySelectorAll("#fuel-chips input:checked")].map(
    (el) => el.value,
  );

/* ── Country select ───────────────────────────────────────────────────────── */

export function buildCountrySelect(countries, onChange) {
  const sel = document.getElementById("country-select");
  [...countries].sort().forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  });
  sel.addEventListener("change", onChange);
}

/* ── Detail Panel ─────────────────────────────────────────────────────────── */

export function showDetail(plant, nearestDriver = null) {
  const fuelColor = normalizeFuel(plant.fuel);
  const deforestRow = nearestDriver
    ? `<div class="detail-row">
        <span class="detail-key">Nearby deforest.</span>
        <span class="detail-val">
          <span class="detail-fuel-dot" style="background:${DEFOREST_COLORS[nearestDriver.driver]}"></span>
          ${escapeHtml(nearestDriver.cause)}
        </span>
      </div>`
    : "";
  document.getElementById("detail-content").innerHTML = `
    <div class="detail-name">${escapeHtml(plant.name)}</div>
    <div class="detail-row">
      <span class="detail-key">Country</span>
      <span class="detail-val">${escapeHtml(plant.country)}</span>
    </div>
    <div class="detail-row">
      <span class="detail-key">Fuel</span>
      <span class="detail-val">
        <span class="detail-fuel-dot" style="background:${FUEL_COLORS[fuelColor]}"></span>
        ${escapeHtml(plant.fuel || "Unknown")}
      </span>
    </div>
    <div class="detail-row">
      <span class="detail-key">Capacity</span>
      <span class="detail-val">${plant.capacity > 0 ? plant.capacity.toLocaleString() + " MW" : "N/A"}</span>
    </div>
    <div class="detail-row">
      <span class="detail-key">Coordinates</span>
      <span class="detail-val">${plant.lat.toFixed(2)}°, ${plant.lng.toFixed(2)}°</span>
    </div>
    ${deforestRow}`;
}

export function clearDetail() {
  document.getElementById("detail-content").innerHTML =
    '<p class="detail-placeholder">Hover or click a marker on the map to see details about a power plant.</p>';
}

/* ── Deforestation Stats Panel ────────────────────────────────────────────── */

export function showDeforestStats(driverCounts) {
  const statsEl = document.getElementById("deforest-stats");
  const rowsEl = document.getElementById("deforest-stats-rows");
  if (!statsEl || !rowsEl) return;

  const total = Object.values(driverCounts).reduce((s, v) => s + v, 0);
  if (total === 0) {
    rowsEl.innerHTML =
      '<p class="detail-placeholder">No deforestation pixels in current view.</p>';
    statsEl.classList.remove("hidden");
    return;
  }

  rowsEl.innerHTML = Object.entries(DEFOREST_CAUSES)
    .map(([driver, label]) => {
      const count = driverCounts[driver] || 0;
      const pct = total > 0 ? (count / total) * 100 : 0;
      return `
        <div class="deforest-stat-row">
          <span class="legend-dot" style="background:${DEFOREST_COLORS[driver]};flex-shrink:0"></span>
          <span class="deforest-stat-label">${label}</span>
          <div class="deforest-stat-bar-wrap">
            <div class="deforest-stat-bar" style="width:${pct.toFixed(1)}%;background:${DEFOREST_COLORS[driver]}"></div>
          </div>
          <span class="deforest-stat-pct">${pct.toFixed(0)}%</span>
        </div>`;
    })
    .join("");

  statsEl.classList.remove("hidden");
}

export function hideDeforestStats() {
  document.getElementById("deforest-stats")?.classList.add("hidden");
}

/* ── Plant Stats Panel ────────────────────────────────────────────────────── */

export function showPlantStats(fuelCounts) {
  const rowsEl = document.getElementById("plant-stats-rows");
  if (!rowsEl) return;

  const total = Object.values(fuelCounts).reduce((s, v) => s + v, 0);
  if (total === 0) {
    rowsEl.innerHTML = '<p class="detail-placeholder">No plants in current view.</p>';
    return;
  }

  rowsEl.innerHTML = FUELS.map((fuel) => {
    const count = fuelCounts[fuel] || 0;
    const pct = (count / total) * 100;
    return `
      <div class="deforest-stat-row">
        <span class="legend-dot" style="background:${FUEL_COLORS[fuel]};flex-shrink:0"></span>
        <span class="deforest-stat-label">${fuel}</span>
        <div class="deforest-stat-bar-wrap">
          <div class="deforest-stat-bar" style="width:${pct.toFixed(1)}%;background:${FUEL_COLORS[fuel]}"></div>
        </div>
        <span class="deforest-stat-pct">${pct.toFixed(0)}%</span>
      </div>`;
  }).join("");
}
