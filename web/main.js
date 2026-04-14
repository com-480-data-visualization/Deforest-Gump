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

function buildPopulationToggle() {
  const btn = document.getElementById("population-toggle");
  btn.addEventListener("click", () => {
    btn.classList.add("active");
    showToast("Population layer not available. Wait for the milestone 3.");
    setTimeout(() => btn.classList.remove("active"), 4000);
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
    const m = { top: 8, right: 8, bottom: 40, left: 30 };
    this.W = vb.width - m.left - m.right;
    this.H = vb.height - m.top - m.bottom;
    const W = this.W,
      H = this.H;

    this.g = this.svg
      .append("g")
      .attr("transform", `translate(${m.left},${m.top})`);

    // Grid group must be first child so it's always behind bars
    this.gridGroup = this.g.append("g");

    this.xS = d3.scaleBand().domain(FUELS).range([0, W]).padding(0.25);
    this.yS = d3.scaleLinear().domain([0, 1]).range([H, 0]);

    // X label
    this.svg
      .append("text")
      .attr("class", "axis-label")
      .attr("x", m.left + W / 2)
      .attr("y", m.top + H + 38)
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
      .text("Avg capacity (MW)");

    // Hover label (hidden until mouseover)
    this.hoverLabel = this.g
      .append("text")
      .attr("class", "bar-label")
      .attr("text-anchor", "middle")
      .attr("font-size", "9px")
      .attr("fill", "#333")
      .style("pointer-events", "none")
      .attr("visibility", "hidden");

    // X ticks
    FUELS.forEach((f) => {
      this.g
        .append("text")
        .attr("class", "tick")
        .attr("x", this.xS(f) + this.xS.bandwidth() / 2)
        .attr("y", H + 8)
        .attr("text-anchor", "end")
        .attr(
          "transform",
          `rotate(-40, ${this.xS(f) + this.xS.bandwidth() / 2}, ${H + 8})`,
        )
        .text(f);
    });
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

    const rawAvg = FUELS.map((f) =>
      counts[f] === 0 ? 0 : sums[f] / counts[f],
    );
    const mx = Math.max(...rawAvg, 0);

    // Update Y scale to actual MW values
    this.yS.domain([0, mx > 0 ? mx : 1]);

    // Redraw Y gridlines + tick labels with MW values
    const yTicks = this.yS.ticks(4);
    const yLines = this.gridGroup.selectAll("line.y-grid").data(yTicks);
    yLines
      .enter()
      .append("line")
      .attr("class", "y-grid")
      .merge(yLines)
      .attr("x1", 0)
      .attr("x2", this.W)
      .attr("y1", (d) => this.yS(d))
      .attr("y2", (d) => this.yS(d))
      .attr("stroke", "#dde5dd")
      .attr("stroke-width", 0.5);
    yLines.exit().remove();

    const yTickTexts = this.gridGroup.selectAll("text.y-tick").data(yTicks);
    yTickTexts
      .enter()
      .append("text")
      .attr("class", "tick y-tick")
      .merge(yTickTexts)
      .attr("x", -4)
      .attr("y", (d) => this.yS(d))
      .attr("text-anchor", "end")
      .attr("dominant-baseline", "middle")
      .text((d) => (d === 0 ? "0" : d3.format("~s")(d)));
    yTickTexts.exit().remove();

    const barData = FUELS.map((f, i) => ({ fuel: f, raw: rawAvg[i] }));
    const hoverLabel = this.hoverLabel;
    const xS = this.xS;
    const yS = this.yS;
    const H = this.H;

    const bars = this.g.selectAll("rect.bar").data(barData);
    bars
      .enter()
      .append("rect")
      .attr("class", "bar")
      .merge(bars)
      .attr("x", (d) => xS(d.fuel))
      .attr("width", xS.bandwidth())
      .attr("y", (d) => yS(d.raw))
      .attr("height", (d) => H - yS(d.raw))
      .attr("fill", (d) => FUEL_COLORS[d.fuel])
      .attr("opacity", (d) => (activeFuels.includes(d.fuel) ? 0.85 : 0.2))
      .on("mouseover", function (d) {
        if (d.raw === 0) return;
        hoverLabel
          .attr("x", xS(d.fuel) + xS.bandwidth() / 2)
          .attr("y", yS(d.raw) - 4)
          .text(d3.format(",.0f")(d.raw) + " MW")
          .attr("visibility", "visible");
      })
      .on("mouseout", function () {
        hoverLabel.attr("visibility", "hidden");
      });
    bars.exit().remove();

    // Keep hover label on top of all other elements
    this.hoverLabel.raise();
  }
}

/* ── CountHistogram ───────────────────────────────────────────────────────── */

class CountHistogram {
  constructor(id, data) {
    this.data = data;
    this.svg = d3.select("#" + id);
    const vb = this.svg.node().viewBox.baseVal;
    const m = { top: 8, right: 8, bottom: 40, left: 36 };
    this.W = vb.width - m.left - m.right;
    this.H = vb.height - m.top - m.bottom;
    const W = this.W,
      H = this.H;

    this.g = this.svg
      .append("g")
      .attr("transform", `translate(${m.left},${m.top})`);

    // Grid group must be first child so it's always behind bars
    this.gridGroup = this.g.append("g");

    this.xS = d3.scaleBand().domain(FUELS).range([0, W]).padding(0.25);
    this.yS = d3.scaleLinear().domain([0, 1]).range([H, 0]);

    // X label
    this.svg
      .append("text")
      .attr("class", "axis-label")
      .attr("x", m.left + W / 2)
      .attr("y", m.top + H + 38)
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
      .text("Plant count");

    // X ticks
    FUELS.forEach((f) => {
      this.g
        .append("text")
        .attr("class", "tick")
        .attr("x", this.xS(f) + this.xS.bandwidth() / 2)
        .attr("y", H + 8)
        .attr("text-anchor", "end")
        .attr(
          "transform",
          `rotate(-40, ${this.xS(f) + this.xS.bandwidth() / 2}, ${H + 8})`,
        )
        .text(f);
    });

    // Hover label
    this.hoverLabel = this.g
      .append("text")
      .attr("class", "bar-label")
      .attr("text-anchor", "middle")
      .attr("font-size", "9px")
      .attr("fill", "#333")
      .style("pointer-events", "none")
      .attr("visibility", "hidden");
  }

  update(min_lat, max_lat, min_lng, max_lng, activeFuels, activeCountry) {
    const counts = {};
    FUELS.forEach((f) => {
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
      counts[fuel]++;
    });

    const mx = Math.max(...Object.values(counts), 0);
    this.yS.domain([0, mx > 0 ? mx : 1]);

    // Y gridlines + ticks
    const yTicks = this.yS.ticks(4);
    const yLines = this.gridGroup.selectAll("line.y-grid").data(yTicks);
    yLines
      .enter()
      .append("line")
      .attr("class", "y-grid")
      .merge(yLines)
      .attr("x1", 0)
      .attr("x2", this.W)
      .attr("y1", (d) => this.yS(d))
      .attr("y2", (d) => this.yS(d))
      .attr("stroke", "#dde5dd")
      .attr("stroke-width", 0.5);
    yLines.exit().remove();

    const yTickTexts = this.gridGroup.selectAll("text.y-tick").data(yTicks);
    yTickTexts
      .enter()
      .append("text")
      .attr("class", "tick y-tick")
      .merge(yTickTexts)
      .attr("x", -4)
      .attr("y", (d) => this.yS(d))
      .attr("text-anchor", "end")
      .attr("dominant-baseline", "middle")
      .text((d) => (d === 0 ? "0" : d3.format("~s")(d)));
    yTickTexts.exit().remove();

    const barData = FUELS.map((f) => ({ fuel: f, count: counts[f] }));
    const hoverLabel = this.hoverLabel;
    const xS = this.xS;
    const yS = this.yS;
    const H = this.H;

    const bars = this.g.selectAll("rect.bar").data(barData);
    bars
      .enter()
      .append("rect")
      .attr("class", "bar")
      .merge(bars)
      .attr("x", (d) => xS(d.fuel))
      .attr("width", xS.bandwidth())
      .attr("y", (d) => yS(d.count))
      .attr("height", (d) => H - yS(d.count))
      .attr("fill", (d) => FUEL_COLORS[d.fuel])
      .attr("opacity", (d) => (activeFuels.includes(d.fuel) ? 0.85 : 0.2))
      .on("mouseover", function (d) {
        if (d.count === 0) return;
        hoverLabel
          .attr("x", xS(d.fuel) + xS.bandwidth() / 2)
          .attr("y", yS(d.count) - 4)
          .text(d3.format(",")(d.count))
          .attr("visibility", "visible");
      })
      .on("mouseout", function () {
        hoverLabel.attr("visibility", "hidden");
      });
    bars.exit().remove();

    this.hoverLabel.raise();
  }
}

/* ── CapacityPieChart ─────────────────────────────────────────────────────── */

class CapacityPieChart {
  constructor(id, data) {
    this.data = data;
    this.svg = d3.select("#" + id);
    const vb = this.svg.node().viewBox.baseVal;
    const m = { top: 6, right: 6, bottom: 6, left: 6 };
    const W = vb.width - m.left - m.right;
    const H = vb.height - m.top - m.bottom;
    this.R = Math.min(W, H) / 2;

    this.g = this.svg
      .append("g")
      .attr("transform", `translate(${m.left + W / 2},${m.top + H / 2})`);

    this.arc = d3.arc().innerRadius(0).outerRadius(this.R);
    this.pie = d3.pie().value((d) => d.value).sort(null);
  }

  update(min_lat, max_lat, min_lng, max_lng, activeFuels, activeCountry) {
    const sums = {};
    FUELS.forEach((f) => { sums[f] = 0; });

    this.data.forEach((d) => {
      if (d.lat < min_lat || d.lat > max_lat || d.lng < min_lng || d.lng > max_lng) return;
      if (activeCountry !== "ALL" && d.country !== activeCountry) return;
      const fuel = normalizeFuel(d.fuel);
      if (!activeFuels.includes(fuel)) return;
      sums[fuel] += d.capacity || 0;
    });

    const pieData = FUELS.map((f) => ({ fuel: f, value: sums[f] }));
    const total = d3.sum(pieData, (d) => d.value);
    const pieLabel = document.getElementById("pie-label");

    document.getElementById("total-mw").textContent =
      total > 0 ? d3.format(",.0f")(total) + " MW" : "—";

    const arcs = this.pie(pieData);
    const slices = this.g.selectAll("path.slice").data(arcs);
    slices.enter().append("path").attr("class", "slice")
      .merge(slices)
      .attr("d", this.arc)
      .attr("fill", (d) => FUEL_COLORS[d.data.fuel])
      .attr("opacity", (d) => (activeFuels.includes(d.data.fuel) ? 0.85 : 0.2))
      .attr("stroke", "#fff").attr("stroke-width", 0.5)
      .on("mouseover", function(d) {
        if (d.data.value === 0) return;
        const pct = (d.data.value / total * 100).toFixed(1);
        pieLabel.textContent =
          `${d.data.fuel} — ${d3.format(",.0f")(d.data.value)} MW (${pct}%)`;
      })
      .on("mouseout", function() {
        pieLabel.textContent = "Hover a slice";
      });
    slices.exit().remove();
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
      const histogram = new EnergyHistogram("plot-1", data);
      const countChart = new CountHistogram("plot-2", data);
      const pieChart = new CapacityPieChart("plot-3", data);

      function getFilters() {
        return {
          fuels: getActiveFuels(),
          country: document.getElementById("country-select").value,
        };
      }

      function refreshHistogram() {
        const { fuels, country } = getFilters();
        const b = map.getBounds();
        const args = [
          b.getSouth(),
          b.getNorth(),
          b.getWest(),
          b.getEast(),
          fuels,
          country,
        ];
        histogram.update(...args);
        countChart.update(...args);
        pieChart.update(...args);
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
