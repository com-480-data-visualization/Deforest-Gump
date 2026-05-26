import {
  FUELS,
  FUEL_COLORS,
  normalizeFuel,
  isFossil,
  escapeHtml,
  DEFOREST_COLORS,
  DEFOREST_CAUSES,
  OTHER_FUEL_EXAMPLES,
} from "./constants.js";

/* ── Toolbar height → CSS variable (keeps map sticky offset correct) ──────── */
const toolbar = document.getElementById("controls");
const syncToolbarHeight = () =>
  document.documentElement.style.setProperty("--toolbar-h", toolbar.offsetHeight + "px");
syncToolbarHeight();
new ResizeObserver(syncToolbarHeight).observe(toolbar);

/* Toolbar slides up as the conclusion section scrolls into view. */
(function () {
  const conclusion = document.querySelector(".conclusion-section");
  if (!conclusion) return;
  let rafId = null;
  const update = () => {
    const h = toolbar.offsetHeight;
    const overlap = Math.min(h, Math.max(0, h - conclusion.getBoundingClientRect().top));
    toolbar.style.transform = `translateY(${-overlap}px)`;
    toolbar.style.pointerEvents = overlap >= h ? "none" : "";
  };
  window.addEventListener("scroll", () => {
    if (rafId) return;
    rafId = requestAnimationFrame(() => { rafId = null; update(); });
  }, { passive: true });
  update();
})();

/* ── Driver tool visibility tracks the deforest overlay ──────────────────── */
document.addEventListener("deforest-toggled", (e) => {
  document.getElementById("driver-tool").classList.toggle("hidden", !e.detail.active);
  document.getElementById("driver-divider").classList.toggle("hidden", !e.detail.active);
});

/* ── Loading + Toast ─────────────────────────────────────────────────────── */
const loading = document.getElementById("loading");
export const showLoading = () => loading.classList.add("visible");
export const hideLoading = () => loading.classList.remove("visible");

export function showToast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

/* ── Fuel chips + country select ─────────────────────────────────────────── */
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
  [...document.querySelectorAll("#fuel-chips input:checked")].map((el) => el.value);

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

const EMPTY_VAL = `<span class="detail-val detail-empty">—</span>`;

function detailRow(key, valHtml) {
  return `<div class="detail-row"><span class="detail-key">${key}</span>${valHtml}</div>`;
}

function renderDetail(plant, nearestDriver) {
  const target = document.getElementById("detail-content");
  if (!plant) {
    target.innerHTML = `
      <div class="detail-name detail-empty">Hover a marker…</div>
      ${["Country", "Fuel", "Energy type", "Capacity", "Coordinates", "Nearby deforest."]
        .map((k) => detailRow(k, EMPTY_VAL)).join("")}`;
    return;
  }
  const fuelColor = FUEL_COLORS[normalizeFuel(plant.fuel)];
  const fossil = isFossil(plant.fuel);
  const energyColor = fossil ? "#e74c3c" : "#27ae60";
  const energyLabel = fossil ? "Fossil" : "Clean";
  const nearby = nearestDriver
    ? `<span class="detail-val"><span class="detail-fuel-dot" style="background:${DEFOREST_COLORS[nearestDriver.driver]}"></span>${escapeHtml(nearestDriver.cause)}</span>`
    : EMPTY_VAL;

  target.innerHTML = `
    <div class="detail-name">${escapeHtml(plant.name)}</div>
    ${detailRow("Country", `<span class="detail-val">${escapeHtml(plant.country)}</span>`)}
    ${detailRow("Fuel", `<span class="detail-val"><span class="detail-fuel-dot" style="background:${fuelColor}"></span>${escapeHtml(plant.fuel || "Unknown")}</span>`)}
    ${detailRow("Energy type", `<span class="detail-val" style="color:${energyColor};font-weight:600">${energyLabel}</span>`)}
    ${detailRow("Capacity", `<span class="detail-val">${plant.capacity > 0 ? plant.capacity.toLocaleString() + " MW" : "N/A"}</span>`)}
    ${detailRow("Coordinates", `<span class="detail-val">${plant.lat.toFixed(2)}°, ${plant.lng.toFixed(2)}°</span>`)}
    ${detailRow("Nearby deforest.", nearby)}`;
}

export const showDetail = (plant, nearestDriver = null) => renderDetail(plant, nearestDriver);
export const clearDetail = () => renderDetail(null);

/* ── Stat-bar panels (shared layout for deforest drivers + plant fuels) ──── */

function ensureStatRows(rowsEl, entries, dataKey) {
  if (!rowsEl || rowsEl.querySelector(`[data-${dataKey}]`)) return;
  rowsEl.innerHTML = entries.map(([key, label, color]) => `
    <div class="deforest-stat-row" data-${dataKey}="${key}">
      <span class="legend-dot" style="background:${color};flex-shrink:0"></span>
      <span class="deforest-stat-label">${label}</span>
      <div class="deforest-stat-bar-wrap">
        <div class="deforest-stat-bar" style="width:0%;background:${color}"></div>
      </div>
      <span class="deforest-stat-pct">0%</span>
    </div>`).join("");
}

function updateStatRows(rowsEl, entries, dataKey, counts) {
  ensureStatRows(rowsEl, entries, dataKey);
  const total = Object.values(counts).reduce((s, v) => s + v, 0);
  entries.forEach(([key]) => {
    const row = rowsEl.querySelector(`[data-${dataKey}="${key}"]`);
    if (!row) return;
    const pct = total > 0 ? ((counts[key] || 0) / total) * 100 : 0;
    row.querySelector(".deforest-stat-bar").style.width = pct.toFixed(1) + "%";
    row.querySelector(".deforest-stat-pct").textContent = pct.toFixed(0) + "%";
  });
}

const DRIVER_ENTRIES = Object.entries(DEFOREST_CAUSES)
  .map(([id, label]) => [id, label, DEFOREST_COLORS[id]]);
const FUEL_ENTRIES = FUELS.map((f) => [f, f, FUEL_COLORS[f]]);

export function showDeforestStats(driverCounts) {
  const statsEl = document.getElementById("deforest-stats");
  const rowsEl = document.getElementById("deforest-stats-rows");
  if (!statsEl || !rowsEl) return;
  statsEl.classList.remove("hidden");
  updateStatRows(rowsEl, DRIVER_ENTRIES, "driver", driverCounts);
}

export function hideDeforestStats() {
  const statsEl = document.getElementById("deforest-stats");
  const rowsEl = document.getElementById("deforest-stats-rows");
  if (!statsEl) return;
  rowsEl?.querySelectorAll(".deforest-stat-bar").forEach((b) => { b.style.width = "0%"; });
  rowsEl?.querySelectorAll(".deforest-stat-pct").forEach((el) => { el.textContent = "0%"; });
  statsEl.classList.add("hidden");
}

export function showPlantStats(fuelCounts) {
  const rowsEl = document.getElementById("plant-stats-rows");
  if (!rowsEl) return;
  updateStatRows(rowsEl, FUEL_ENTRIES, "fuel", fuelCounts);
}
