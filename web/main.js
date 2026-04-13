/* ── Constants ────────────────────────────────────────────────────────────── */

const FUEL_COLORS = {
  Coal: "#2c2c2c",
  Gas: "#e67e22",
  Hydro: "#2980b9",
  Solar: "#f1c40f",
  Wind: "#27ae60",
  Nuclear: "#8e44ad",
  Other: "#95a5a6",
};

const FUELS = Object.keys(FUEL_COLORS);

const normalizeFuel = (raw) => (FUELS.includes(raw) ? raw : "Other");

const getRadius = (cap) =>
  !cap || cap <= 0 ? 3 : Math.max(Math.log(cap + 1), 2);

const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function whenDocumentLoaded(fn) {
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", fn);
  else fn();
}

const loading = document.getElementById("loading");
const showLoading = () => loading.classList.add("visible");
const hideLoading = () => loading.classList.remove("visible");

function showToast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

/* ── Legend ───────────────────────────────────────────────────────────────── */

function buildLegend() {
  const el = document.getElementById("legend");
  FUELS.forEach((fuel) => {
    el.insertAdjacentHTML(
      "beforeend",
      `
      <div class="legend-item">
        <span class="legend-dot" style="background:${FUEL_COLORS[fuel]}"></span>
        <span>${fuel}</span>
      </div>`,
    );
  });
}

/* ── Fuel chips ───────────────────────────────────────────────────────────── */

function buildFuelChips(onChange) {
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

const getActiveFuels = () =>
  [...document.querySelectorAll("#fuel-chips input:checked")].map(
    (el) => el.value,
  );

/* ── Country select ───────────────────────────────────────────────────────── */

function buildCountrySelect(countries, onChange) {
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

function showDetail(plant) {
  const fuel = normalizeFuel(plant.fuel);
  document.getElementById("detail-content").innerHTML = `
    <div class="detail-name">${escapeHtml(plant.name)}</div>
    <div class="detail-row">
      <span class="detail-key">Country</span>
      <span class="detail-val">${escapeHtml(plant.country)}</span>
    </div>
    <div class="detail-row">
      <span class="detail-key">Fuel</span>
      <span class="detail-val">
        <span class="detail-fuel-dot" style="background:${FUEL_COLORS[fuel]}"></span>
        ${escapeHtml(fuel)}
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

function clearDetail() {
  document.getElementById("detail-content").innerHTML =
    '<p class="detail-placeholder">Hover or click a marker on the map to see details about a power plant.</p>';
}

/* ── Deforestation Overlay ────────────────────────────────────────────────── */

let deforestLayer = null;
let deforestVisible = false;

const DEFOREST_COLORS = {
  1: "#b5179e", // commodity-driven
  2: "#f77f00", // shifting agriculture
  3: "#4cc9f0", // forestry
  4: "#ffba08", // wildfire
  5: "#3a86ff", // urbanization
};

function buildDeforestToggle(map) {
  const btn = document.getElementById("deforest-toggle");
  btn.addEventListener("click", () => {
    deforestVisible = !deforestVisible;
    btn.classList.toggle("active", deforestVisible);
    if (deforestVisible) loadDeforestLayer(map);
    else if (deforestLayer) {
      map.removeLayer(deforestLayer);
      deforestLayer = null;
    }
  });
}

function loadDeforestLayer(map) {
  fetch("data/8-deforestation.geojson")
    .then((r) => {
      if (!r.ok) throw new Error(r.statusText);
      return r.json();
    })
    .then((geojson) => {
      deforestLayer = L.geoJSON(geojson, {
        style: (f) => ({
          fillColor: DEFOREST_COLORS[f.properties.driver] ?? "#ccc",
          fillOpacity: 0.45,
          weight: 0,
        }),
      }).addTo(map);
    })
    .catch((err) => {
      console.warn("Deforestation layer not available:", err.message);
      deforestVisible = false;
      document.getElementById("deforest-toggle").classList.remove("active");
      showToast("Deforestation layer not available. Wait for the milestone 3.");
    });
}

/* ── EnergyHistogram ──────────────────────────────────────────────────────── */

class EnergyHistogram {
  constructor(id, data) {
    this.data = data;
    this.svg = d3.select("#" + id);
    const vb = this.svg.node().viewBox.baseVal;
    const m = { top: 8, right: 8, bottom: 26, left: 30 };
    const W = vb.width - m.left - m.right;
    const H = vb.height - m.top - m.bottom;

    this.g = this.svg
      .append("g")
      .attr("transform", `translate(${m.left},${m.top})`);
    this.xS = d3
      .scaleLinear()
      .domain([0, FUELS.length - 1])
      .range([0, W]);
    this.yS = d3.scaleLinear().domain([0, 1]).range([H, 0]);

    // X label
    this.svg
      .append("text")
      .attr("class", "axis-label")
      .attr("x", m.left + W / 2)
      .attr("y", m.top + H + 22)
      .attr("text-anchor", "middle")
      .text("Fuel type");

    // Y label
    this.svg
      .append("text")
      .attr("class", "axis-label")
      .attr("transform", "rotate(-90)")
      .attr("x", -(m.top + H / 2))
      .attr("y", 10)
      .attr("text-anchor", "middle")
      .text("Avg capacity (norm.)");

    // Gridlines
    [0, 0.25, 0.5, 0.75, 1].forEach((v) => {
      this.g
        .append("line")
        .attr("x1", 0)
        .attr("x2", W)
        .attr("y1", this.yS(v))
        .attr("y2", this.yS(v))
        .attr("stroke", "#dde5dd")
        .attr("stroke-width", 0.5);
    });

    // X ticks
    FUELS.forEach((f, i) => {
      this.g
        .append("text")
        .attr("class", "tick")
        .attr("x", this.xS(i))
        .attr("y", H + 8)
        .attr("text-anchor", "end")
        .attr("transform", `rotate(-40, ${this.xS(i)}, ${H + 8})`)
        .text(f);
    });

    this._line = d3
      .line()
      .x((_, i) => this.xS(i))
      .y((d) => this.yS(d))
      .curve(d3.curveCatmullRom.alpha(0.5));
  }

  update(min_lat, max_lat, min_lng, max_lng, activeFuels, activeCountry) {
    const sums = {},
      counts = {};
    FUELS.forEach((f) => {
      sums[f] = 0;
      counts[f] = 0;
    });

    this.data.forEach((d) => {
      if (
        d.lat < min_lat ||
        d.lat > max_lat ||
        d.lng < min_lng ||
        d.lng > max_lng
      )
        return;
      if (activeCountry !== "ALL" && d.country !== activeCountry) return;
      const fuel = normalizeFuel(d.fuel);
      if (!activeFuels.includes(fuel)) return;
      sums[fuel] += d.capacity || 0;
      counts[fuel]++;
    });

    let hist = FUELS.map((f) => (counts[f] === 0 ? 0 : sums[f] / counts[f]));
    const mx = Math.max(...hist, 0);
    if (mx > 0) hist = hist.map((v) => v / mx);

    // Dots
    const dots = this.g.selectAll("circle.data-dot").data(hist);
    dots
      .enter()
      .append("circle")
      .attr("class", "data-dot")
      .attr("r", 2)
      .attr("fill", "white")
      .attr("stroke-width", 1.2)
      .merge(dots)
      .attr("cx", (_, i) => this.xS(i))
      .attr("cy", (d) => this.yS(d))
      .attr("stroke", (_, i) => FUEL_COLORS[FUELS[i]]);
    dots.exit().remove();

    // Line
    const paths = this.g.selectAll("path.curve").data([hist]);
    paths
      .enter()
      .append("path")
      .attr("class", "curve")
      .merge(paths)
      .attr("d", this._line(hist));
    paths.exit().remove();
  }
}

/* ── Map markers ──────────────────────────────────────────────────────────── */

function buildMarkers(map, data, renderer) {
  const markers = [];
  data.forEach((d) => {
    if (isNaN(d.lat) || isNaN(d.lng)) return;
    const m = L.circleMarker([d.lat, d.lng], {
      renderer,
      radius: getRadius(d.capacity),
      fillColor: FUEL_COLORS[normalizeFuel(d.fuel)],
      color: "rgba(255,255,255,0.5)",
      weight: 0.8,
      fillOpacity: 0.75,
    });
    m.on("click", () => showDetail(d));
    m.on("mouseover", () => showDetail(d));
    m.on("mouseout", clearDetail);
    m.plantData = d;
    m.addTo(map);
    markers.push(m);
  });
  return markers;
}

function applyFilters(markers, activeFuels, activeCountry) {
  markers.forEach((m) => {
    const { fuel, country } = m.plantData;
    const show =
      activeFuels.includes(normalizeFuel(fuel)) &&
      (activeCountry === "ALL" || country === activeCountry);
    m.setStyle(
      show ? { opacity: 1, fillOpacity: 0.75 } : { opacity: 0, fillOpacity: 0 },
    );
    m.setInteractive(show);
  });
}

/* ── Entry point ──────────────────────────────────────────────────────────── */

whenDocumentLoaded(() => {
  buildLegend();

  const map = L.map("map", { zoomControl: true, minZoom: 2 }).setView(
    [20, 0],
    2,
  );

  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    {
      attribution: "© OpenStreetMap © CARTO",
      subdomains: "abcd",
      maxZoom: 19,
    },
  ).addTo(map);

  buildDeforestToggle(map);

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
      const histogram = new EnergyHistogram("plot-1", data);

      function getFilters() {
        return {
          fuels:   getActiveFuels(),
          country: document.getElementById("country-select").value,
        };
      }

      function refreshHistogram() {
        const { fuels, country } = getFilters();
        const b = map.getBounds();
        histogram.update(b.getSouth(), b.getNorth(), b.getWest(), b.getEast(), fuels, country);
      }

      function onFilterChange() {
        const { fuels, country } = getFilters();
        applyFilters(markers, fuels, country);
        refreshHistogram();
      }

      map.on("moveend", refreshHistogram);
      map.fire("moveend");
    })
    .catch(() => hideLoading());
});
