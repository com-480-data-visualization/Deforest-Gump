import { FUELS, FUEL_COLORS, normalizeFuel, escapeHtml } from "./constants.js";

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

/* ── Legend ───────────────────────────────────────────────────────────────── */

export function buildLegend() {
  const el = document.getElementById("legend");
  FUELS.forEach((fuel) => {
    el.insertAdjacentHTML(
      "beforeend",
      `<div class="legend-item">
        <span class="legend-dot" style="background:${FUEL_COLORS[fuel]}"></span>
        <span>${fuel}</span>
      </div>`,
    );
  });
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

export function showDetail(plant) {
  const fuelColor = normalizeFuel(plant.fuel);
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
    </div>`;
}

export function clearDetail() {
  document.getElementById("detail-content").innerHTML =
    '<p class="detail-placeholder">Hover or click a marker on the map to see details about a power plant.</p>';
}
