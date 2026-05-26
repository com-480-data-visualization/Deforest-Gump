import {
  FUELS,
  FUEL_COLORS,
  normalizeFuel,
  escapeHtml,
  DEFOREST_COLORS,
  DEFOREST_CAUSES,
  OTHER_FUEL_EXAMPLES,
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
      ${fuel}${fuel === "Other" ? ` <span class="chip-info" title="Includes: ${OTHER_FUEL_EXAMPLES}">ⓘ</span>` : ""}`;
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
  const deforestRow = `<div class="detail-row">
      <span class="detail-key">Nearby deforest.</span>
      <span class="detail-val${nearestDriver ? "" : " detail-empty"}">
        ${nearestDriver
          ? `<span class="detail-fuel-dot" style="background:${DEFOREST_COLORS[nearestDriver.driver]}"></span>${escapeHtml(nearestDriver.cause)}`
          : "—"}
      </span>
    </div>`;
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
  document.getElementById("detail-content").innerHTML = `
    <div class="detail-name detail-empty">Hover a marker…</div>
    <div class="detail-row">
      <span class="detail-key">Country</span>
      <span class="detail-val detail-empty">—</span>
    </div>
    <div class="detail-row">
      <span class="detail-key">Fuel</span>
      <span class="detail-val detail-empty">—</span>
    </div>
    <div class="detail-row">
      <span class="detail-key">Capacity</span>
      <span class="detail-val detail-empty">—</span>
    </div>
    <div class="detail-row">
      <span class="detail-key">Coordinates</span>
      <span class="detail-val detail-empty">—</span>
    </div>
    <div class="detail-row">
      <span class="detail-key">Nearby deforest.</span>
      <span class="detail-val detail-empty">—</span>
    </div>`;
}

/* ── Deforestation Stats Panel ────────────────────────────────────────────── */

function ensureDeforestRows() {
  const rowsEl = document.getElementById("deforest-stats-rows");
  if (!rowsEl || rowsEl.querySelector("[data-driver]")) return;
  rowsEl.innerHTML = Object.entries(DEFOREST_CAUSES).map(([driver, label]) => `
    <div class="deforest-stat-row" data-driver="${driver}">
      <span class="legend-dot" style="background:${DEFOREST_COLORS[driver]};flex-shrink:0"></span>
      <span class="deforest-stat-label">${label}</span>
      <div class="deforest-stat-bar-wrap">
        <div class="deforest-stat-bar" style="width:0%;background:${DEFOREST_COLORS[driver]}"></div>
      </div>
      <span class="deforest-stat-pct">0%</span>
    </div>`).join("");
}

export function showDeforestStats(driverCounts) {
  const statsEl = document.getElementById("deforest-stats");
  const rowsEl = document.getElementById("deforest-stats-rows");
  if (!statsEl || !rowsEl) return;
  ensureDeforestRows();
  statsEl.classList.remove("hidden");

  const total = Object.values(driverCounts).reduce((s, v) => s + v, 0);
  Object.entries(DEFOREST_CAUSES).forEach(([driver]) => {
    const row = rowsEl.querySelector(`[data-driver="${driver}"]`);
    if (!row) return;
    const pct = total > 0 ? ((driverCounts[driver] || 0) / total) * 100 : 0;
    row.querySelector(".deforest-stat-bar").style.width = pct.toFixed(1) + "%";
    row.querySelector(".deforest-stat-pct").textContent = pct.toFixed(0) + "%";
  });
}

export function hideDeforestStats() {
  const statsEl = document.getElementById("deforest-stats");
  const rowsEl = document.getElementById("deforest-stats-rows");
  if (!statsEl) return;
  rowsEl?.querySelectorAll("[data-driver] .deforest-stat-bar")
    .forEach((bar) => { bar.style.width = "0%"; });
  rowsEl?.querySelectorAll("[data-driver] .deforest-stat-pct")
    .forEach((el) => { el.textContent = "0%"; });
  statsEl.classList.add("hidden");
}

/* ── Plant Stats Panel ────────────────────────────────────────────────────── */

function ensurePlantRows() {
  const rowsEl = document.getElementById("plant-stats-rows");
  if (!rowsEl || rowsEl.querySelector("[data-fuel]")) return;
  rowsEl.innerHTML = FUELS.map((fuel) => `
    <div class="deforest-stat-row" data-fuel="${fuel}">
      <span class="legend-dot" style="background:${FUEL_COLORS[fuel]};flex-shrink:0"></span>
      <span class="deforest-stat-label">${fuel}</span>
      <div class="deforest-stat-bar-wrap">
        <div class="deforest-stat-bar" style="width:0%;background:${FUEL_COLORS[fuel]}"></div>
      </div>
      <span class="deforest-stat-pct">0%</span>
    </div>`).join("");
}

export function showPlantStats(fuelCounts) {
  const rowsEl = document.getElementById("plant-stats-rows");
  if (!rowsEl) return;
  ensurePlantRows();

  const total = Object.values(fuelCounts).reduce((s, v) => s + v, 0);
  FUELS.forEach((fuel) => {
    const row = rowsEl.querySelector(`[data-fuel="${fuel}"]`);
    if (!row) return;
    const pct = total > 0 ? ((fuelCounts[fuel] || 0) / total) * 100 : 0;
    row.querySelector(".deforest-stat-bar").style.width = pct.toFixed(1) + "%";
    row.querySelector(".deforest-stat-pct").textContent = pct.toFixed(0) + "%";
  });
}
