import { FUELS, FUEL_COLORS, normalizeFuel, DEFOREST_COLORS } from "./constants.js";

const T = 350; // shared transition duration (ms)

/* ── CorrelationScatter ───────────────────────────────────────────────────── */

const SCATTER_FOSSIL = new Set(["Coal", "Gas", "Oil", "Petcoke"]);

export class CorrelationScatter {
  constructor(id, correlationData, onCountryClick) {
    this.onCountryClick = onCountryClick;
    this._selectedCountry = "ALL";
    // ISO3 → pre-computed global deforest count (x-axis stays stable while panning)
    this._deforestByCode = new Map(correlationData.map((d) => [d.code, d.deforest_count]));

    this.svg = d3.select("#" + id);
    const vb = this.svg.node().viewBox.baseVal;
    const m = { top: 10, right: 12, bottom: 44, left: 46 };
    this.W = vb.width - m.left - m.right;
    this.H = vb.height - m.top - m.bottom;

    this.g = this.svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

    const counts = correlationData.map((d) => d.deforest_count);
    this.xS = d3.scaleLog().domain([d3.min(counts), 10000]).range([0, this.W]).clamp(true);
    this.yS = d3.scaleLinear().domain([0, 100]).range([this.H, 0]);
    this.rS = d3.scaleSqrt().domain([0, 1]).range([2, 9]);

    const gridG = this.g.append("g");
    [0, 25, 50, 75, 100].forEach((v) => {
      gridG.append("line")
        .attr("x1", 0).attr("x2", this.W)
        .attr("y1", this.yS(v)).attr("y2", this.yS(v))
        .attr("stroke", "#dde5dd").attr("stroke-width", 0.5);
    });

    this._xTickGroup = this.g.append("g");
    this._updateXAxis();

    [0, 25, 50, 75, 100].forEach((v) => {
      this.g.append("text").attr("class", "tick")
        .attr("x", -4).attr("y", this.yS(v))
        .attr("text-anchor", "end").attr("dominant-baseline", "middle")
        .text(v + "%");
    });

    this.svg.append("text").attr("class", "axis-label")
      .attr("x", m.left + this.W / 2).attr("y", m.top + this.H + 40)
      .attr("text-anchor", "middle").text("Deforestation pixels (log scale)");

    this.svg.append("text").attr("class", "axis-label")
      .attr("transform", "rotate(-90)")
      .attr("x", -(m.top + this.H / 2)).attr("y", 11)
      .attr("text-anchor", "middle").text("Fossil fuel capacity %");

    this.hoverLabel = this.svg.append("text")
      .attr("class", "scatter-label").attr("font-size", "7px")
      .attr("fill", "#1c2e1c").attr("font-weight", "600")
      .style("pointer-events", "none").attr("visibility", "hidden");
  }

  _updateXAxis() {
    const tr = d3.transition().duration(400).ease(d3.easeCubicOut);
    const ticks = [10, 100, 1000, 10000];

    const lines = this._xTickGroup.selectAll("line.x-grid").data(ticks);
    lines.enter().append("line").attr("class", "x-grid")
      .attr("stroke", "#dde5dd").attr("stroke-width", 0.5)
      .attr("y1", 0).attr("y2", this.H)
      .attr("x1", (d) => this.xS(d)).attr("x2", (d) => this.xS(d))
      .attr("opacity", 0)
      .merge(lines).transition(tr)
      .attr("x1", (d) => this.xS(d)).attr("x2", (d) => this.xS(d))
      .attr("opacity", 1);
    lines.exit().transition(tr).attr("opacity", 0).remove();

    const texts = this._xTickGroup.selectAll("text.x-tick").data(ticks);
    texts.enter().append("text").attr("class", "tick x-tick")
      .attr("y", this.H + 9).attr("text-anchor", "middle")
      .attr("x", (d) => this.xS(d)).attr("opacity", 0)
      .merge(texts).transition(tr)
      .attr("x", (d) => this.xS(d))
      .attr("opacity", 1)
      .text((d) => d3.format("~s")(d));
    texts.exit().transition(tr).attr("opacity", 0).remove();
  }

  _setupDotHandlers(sel) {
    const { xS, yS, rS, hoverLabel, W, onCountryClick } = this;
    const mLeft = 46, mTop = 10;
    sel
      .attr("cx", (d) => xS(d.deforest_count))
      .attr("cy", (d) => yS(d.fossil_pct))
      .attr("fill", (d) => FUEL_COLORS[normalizeFuel(d.dominant_fuel)])
      .attr("stroke", "#fff").attr("stroke-width", 0.6)
      .style("cursor", "pointer")
      .on("mouseover", function (d) {
        d3.select(this).transition().duration(120)
          .attr("stroke", "#1c2e1c").attr("stroke-width", 1.5).attr("fill-opacity", 1);
        const cx = mLeft + xS(d.deforest_count);
        const cy = mTop + yS(d.fossil_pct);
        const labelX = cx > W * 0.75 ? cx - 4 : cx + 4;
        hoverLabel.attr("x", labelX).attr("y", cy - rS(d.plant_count) - 3)
          .attr("text-anchor", cx > W * 0.75 ? "end" : "start")
          .text(`${d.country} — ${d.fossil_pct.toFixed(1)}% fossil`)
          .attr("visibility", "visible");
      })
      .on("mouseout", function () {
        d3.select(this).transition().duration(120)
          .attr("stroke", "#fff").attr("stroke-width", 0.6).attr("fill-opacity", 0.75);
        hoverLabel.attr("visibility", "hidden");
      })
      .on("click", (d) => onCountryClick(this._selectedCountry === d.country ? "ALL" : d.country));
  }

  /* Recompute per-country stats from the currently visible plants and redraw.
     deforestByIso3: Map<iso3,count> from getDeforestStatsByCountry, or null to
     fall back to the pre-computed global values from correlationData. */
  update(plants, deforestByIso3) {
    const byIso3 = new Map();
    plants.forEach((p) => {
      if (!p.iso3 || !p.country) return;
      if (!byIso3.has(p.iso3)) {
        byIso3.set(p.iso3, { country: p.country, iso3: p.iso3, total: 0, fossil: 0, count: 0, fuelCap: {} });
      }
      const c = byIso3.get(p.iso3);
      const cap = p.capacity || 0;
      c.total += cap;
      c.count++;
      const nf = normalizeFuel(p.fuel);
      c.fuelCap[nf] = (c.fuelCap[nf] || 0) + cap;
      if (SCATTER_FOSSIL.has(p.fuel)) c.fossil += cap;
    });

    const newData = [...byIso3.values()]
      .map((c) => ({
        country: c.country,
        iso3: c.iso3,
        fossil_pct: c.total > 0 ? (c.fossil / c.total) * 100 : 0,
        plant_count: c.count,
        dominant_fuel: Object.entries(c.fuelCap).sort((a, b) => b[1] - a[1])[0]?.[0] || "Other",
        deforest_count: (deforestByIso3 ?? this._deforestByCode).get(c.iso3) || 0,
      }))
      .filter((d) => d.deforest_count > 0);

    this.rS.domain([0, d3.max(newData, (d) => d.plant_count) || 1]);

    const t = d3.transition().duration(400).ease(d3.easeCubicOut);
    const sel = this._selectedCountry;
    const dots = this.g.selectAll("circle.dot").data(newData, (d) => d.iso3);

    const entering = dots.enter().append("circle").attr("class", "dot")
      .attr("r", 0).attr("fill-opacity", 0);
    this._setupDotHandlers(entering);

    dots.exit().remove();

    const allDots = entering.merge(dots);

    // Set position/color synchronously — never depends on a transition completing,
    // so filter changes always land at the exact right coordinates immediately.
    allDots
      .attr("cx", (d) => this.xS(d.deforest_count))
      .attr("cy", (d) => this.yS(d.fossil_pct))
      .attr("fill", (d) => FUEL_COLORS[normalizeFuel(d.dominant_fuel)])
      .attr("stroke", (d) => sel !== "ALL" && d.country === sel ? "#1c2e1c" : "#fff")
      .attr("stroke-width", (d) => sel !== "ALL" && d.country === sel ? 1.5 : 0.6);

    // Animate only size and opacity so entering dots fade in smoothly.
    allDots.transition(t)
      .attr("fill-opacity", (d) => sel !== "ALL" && d.country !== sel ? 0.12 : 0.75)
      .attr("r", (d) => {
        const base = this.rS(d.plant_count);
        return sel !== "ALL" && d.country === sel ? base * 1.5 : base;
      });
  }

  _applyDotStyles() {
    const sel = this._selectedCountry;
    // Named transition avoids cancelling any in-flight update transition.
    this.g.selectAll("circle.dot").transition("style").duration(200)
      .attr("fill-opacity", (d) => sel !== "ALL" && d.country !== sel ? 0.12 : 0.75)
      .attr("r", (d) => {
        const base = this.rS(d.plant_count);
        return sel !== "ALL" && d.country === sel ? base * 1.5 : base;
      })
      .attr("stroke-width", (d) => sel !== "ALL" && d.country === sel ? 1.5 : 0.6)
      .attr("stroke", (d) => sel !== "ALL" && d.country === sel ? "#1c2e1c" : "#fff");
  }

  highlightCountry(country) {
    this._selectedCountry = country;
    this._applyDotStyles();
  }
}

/* ── BarChart (shared base) ───────────────────────────────────────────────── */

class BarChart {
  constructor(id, data, { leftMargin = 30, yLabel = "" } = {}) {
    this.data = data;
    this.svg = d3.select("#" + id);
    const vb = this.svg.node().viewBox.baseVal;
    const m = { top: 8, right: 8, bottom: 40, left: leftMargin };
    this.W = vb.width - m.left - m.right;
    this.H = vb.height - m.top - m.bottom;

    this.g = this.svg
      .append("g")
      .attr("transform", `translate(${m.left},${m.top})`);

    // Grid group rendered first so it stays behind bars
    this.gridGroup = this.g.append("g");

    this.xS = d3.scaleBand().domain(FUELS).range([0, this.W]).padding(0.25);
    this.yS = d3.scaleLinear().domain([0, 1]).range([this.H, 0]);

    // X axis label
    this.svg
      .append("text")
      .attr("class", "axis-label")
      .attr("x", m.left + this.W / 2)
      .attr("y", m.top + this.H + 38)
      .attr("text-anchor", "middle")
      .text("Fuel type");

    // Y axis label
    this.svg
      .append("text")
      .attr("class", "axis-label")
      .attr("transform", "rotate(-90)")
      .attr("x", -(m.top + this.H / 2))
      .attr("y", 10)
      .attr("text-anchor", "middle")
      .text(yLabel);

    // X tick labels (rotated)
    FUELS.forEach((f) => {
      const cx = this.xS(f) + this.xS.bandwidth() / 2;
      this.g
        .append("text")
        .attr("class", "tick")
        .attr("x", cx)
        .attr("y", this.H + 8)
        .attr("text-anchor", "end")
        .attr("transform", `rotate(-40, ${cx}, ${this.H + 8})`)
        .text(f);
    });

    // Hover label (hidden until mouseover)
    this.hoverLabel = this.g
      .append("text")
      .attr("class", "bar-label")
      .attr("text-anchor", "middle")
      .attr("font-size", "9px")
      .attr("fill", "#333")
      .style("pointer-events", "none")
      .attr("visibility", "hidden");
  }

  _updateYGrid() {
    const t = d3.transition().duration(T);
    const yTicks = this.yS.ticks(4);

    const yLines = this.gridGroup.selectAll("line.y-grid").data(yTicks);
    yLines
      .enter()
      .append("line")
      .attr("class", "y-grid")
      .attr("x1", 0)
      .attr("x2", this.W)
      .attr("stroke", "#dde5dd")
      .attr("stroke-width", 0.5)
      .attr("y1", (d) => this.yS(d))
      .attr("y2", (d) => this.yS(d))
      .merge(yLines)
      .transition(t)
      .attr("y1", (d) => this.yS(d))
      .attr("y2", (d) => this.yS(d));
    yLines.exit().remove();

    const yTickTexts = this.gridGroup.selectAll("text.y-tick").data(yTicks);
    yTickTexts
      .enter()
      .append("text")
      .attr("class", "tick y-tick")
      .attr("x", -4)
      .attr("text-anchor", "end")
      .attr("dominant-baseline", "middle")
      .merge(yTickTexts)
      .transition(t)
      .attr("y", (d) => this.yS(d))
      .text((d) => (d === 0 ? "0" : d3.format("~s")(d)));
    yTickTexts.exit().remove();
  }

  _filterData(minLat, maxLat, minLng, maxLng, activeFuels, activeCountry) {
    return this.data.filter((d) => {
      if (d.lat < minLat || d.lat > maxLat || d.lng < minLng || d.lng > maxLng)
        return false;
      if (activeCountry !== "ALL" && d.country !== activeCountry) return false;
      if (!activeFuels.includes(normalizeFuel(d.fuel))) return false;
      return true;
    });
  }

  // Shared bar update logic used by both subclasses
  _updateBars(barData, activeFuels, formatValue) {
    const { xS, yS, H, hoverLabel } = this;
    const t = d3.transition().duration(T).ease(d3.easeCubicOut);

    const bars = this.g.selectAll("rect.bar").data(barData);

    // Enter: bars start collapsed at baseline
    bars
      .enter()
      .append("rect")
      .attr("class", "bar")
      .attr("rx", 3)
      .attr("ry", 3)
      .attr("x", (d) => xS(d.fuel))
      .attr("width", xS.bandwidth())
      .attr("fill", (d) => FUEL_COLORS[d.fuel])
      .attr("y", H)
      .attr("height", 0);

    // Update + enter: set static attrs and events, then transition geometry
    const merged = this.g.selectAll("rect.bar");

    merged
      .attr("rx", 3)
      .attr("ry", 3)
      .attr("x", (d) => xS(d.fuel))
      .attr("width", xS.bandwidth())
      .attr("fill", (d) => FUEL_COLORS[d.fuel])
      .attr("opacity", (d) => (activeFuels.includes(d.fuel) ? 0.85 : 0.2))
      .style("cursor", (d) => (d.val > 0 ? "pointer" : "default"))
      .on("mouseover", function (d) {
        if (d.val === 0) return;
        d3.select(this)
          .attr("opacity", 1)
          .attr("stroke", "#fff")
          .attr("stroke-width", 1.5);
        hoverLabel
          .attr("x", xS(d.fuel) + xS.bandwidth() / 2)
          .attr("y", yS(d.val) - 4)
          .text(formatValue(d.val))
          .attr("visibility", "visible");
      })
      .on("mouseout", function (d) {
        d3.select(this)
          .attr("opacity", activeFuels.includes(d.fuel) ? 0.85 : 0.2)
          .attr("stroke", "none");
        hoverLabel.attr("visibility", "hidden");
      });

    merged
      .transition(t)
      .attr("y", (d) => yS(d.val))
      .attr("height", (d) => H - yS(d.val));

    bars.exit().remove();
    hoverLabel.raise();
  }
}

/* ── EnergyHistogram ──────────────────────────────────────────────────────── */

export class EnergyHistogram extends BarChart {
  constructor(id, data) {
    super(id, data, { leftMargin: 30, yLabel: "Avg capacity (MW)" });
  }

  update(minLat, maxLat, minLng, maxLng, activeFuels, activeCountry) {
    const sums = Object.fromEntries(FUELS.map((f) => [f, 0]));
    const counts = Object.fromEntries(FUELS.map((f) => [f, 0]));

    this._filterData(
      minLat,
      maxLat,
      minLng,
      maxLng,
      activeFuels,
      activeCountry,
    ).forEach((d) => {
      const fuel = normalizeFuel(d.fuel);
      sums[fuel] += d.capacity || 0;
      counts[fuel]++;
    });

    const rawAvg = FUELS.map((f) =>
      counts[f] === 0 ? 0 : sums[f] / counts[f],
    );
    const mx = Math.max(...rawAvg, 0);
    this.yS.domain([0, mx > 0 ? mx : 1]);
    this._updateYGrid();

    const barData = FUELS.map((f, i) => ({ fuel: f, val: rawAvg[i] }));
    this._updateBars(barData, activeFuels, (v) => d3.format(",.0f")(v) + " MW");
  }
}

/* ── CountHistogram ───────────────────────────────────────────────────────── */

export class CountHistogram extends BarChart {
  constructor(id, data) {
    super(id, data, { leftMargin: 36, yLabel: "Plant count" });
  }

  update(minLat, maxLat, minLng, maxLng, activeFuels, activeCountry) {
    const counts = Object.fromEntries(FUELS.map((f) => [f, 0]));

    this._filterData(
      minLat,
      maxLat,
      minLng,
      maxLng,
      activeFuels,
      activeCountry,
    ).forEach((d) => {
      counts[normalizeFuel(d.fuel)]++;
    });

    const mx = Math.max(...Object.values(counts), 0);
    this.yS.domain([0, mx > 0 ? mx : 1]);
    this._updateYGrid();

    const barData = FUELS.map((f) => ({ fuel: f, val: counts[f] }));
    this._updateBars(barData, activeFuels, (v) => d3.format(",")(v));
  }
}

/* ── DeforestHistogram ────────────────────────────────────────────────────── */

const DRIVER_SHORT = { 1: "Commodity", 2: "Shifting", 3: "Forestry", 4: "Wildfire", 5: "Urban." };
const DRIVERS = [1, 2, 3, 4, 5];

export class DeforestHistogram {
  constructor(id) {
    this.svg = d3.select("#" + id);
    const vb = this.svg.node().viewBox.baseVal;
    const m = { top: 8, right: 8, bottom: 42, left: 40 };
    this.W = vb.width - m.left - m.right;
    this.H = vb.height - m.top - m.bottom;

    this.g = this.svg.append("g").attr("transform", `translate(${m.left},${m.top})`);
    this.gridGroup = this.g.append("g");

    this.xS = d3.scaleBand().domain(DRIVERS).range([0, this.W]).padding(0.25);
    this.yS = d3.scaleLinear().domain([0, 1]).range([this.H, 0]);

    this.svg.append("text").attr("class", "axis-label")
      .attr("x", m.left + this.W / 2).attr("y", m.top + this.H + 40)
      .attr("text-anchor", "middle").text("Driver");

    this.svg.append("text").attr("class", "axis-label")
      .attr("transform", "rotate(-90)")
      .attr("x", -(m.top + this.H / 2)).attr("y", 10)
      .attr("text-anchor", "middle").text("Pixel count");

    DRIVERS.forEach((d) => {
      const cx = this.xS(d) + this.xS.bandwidth() / 2;
      this.g.append("text").attr("class", "tick")
        .attr("x", cx).attr("y", this.H + 8)
        .attr("text-anchor", "end")
        .attr("transform", `rotate(-40, ${cx}, ${this.H + 8})`)
        .text(DRIVER_SHORT[d]);
    });

    this.hoverLabel = this.g.append("text")
      .attr("class", "bar-label").attr("text-anchor", "middle")
      .attr("font-size", "9px").attr("fill", "#333")
      .style("pointer-events", "none").attr("visibility", "hidden");

    this.placeholder = this.g.append("text")
      .attr("x", this.W / 2).attr("y", this.H / 2)
      .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
      .attr("font-size", "9.5px").attr("fill", "var(--ink-4)")
      .style("font-style", "italic")
      .text("Enable deforestation overlay");
  }

  update(counts) {
    const hasData = counts && Object.values(counts).some((v) => v > 0);
    this.placeholder.attr("visibility", hasData ? "hidden" : "visible");

    const t = d3.transition().duration(T).ease(d3.easeCubicOut);

    if (!hasData) {
      this.g.selectAll("rect.bar").transition(t).attr("y", this.H).attr("height", 0);
      return;
    }

    const mx = Math.max(...Object.values(counts), 1);
    this.yS.domain([0, mx]);

    const yTicks = this.yS.ticks(4);
    const yLines = this.gridGroup.selectAll("line.y-grid").data(yTicks);
    yLines.enter().append("line").attr("class", "y-grid")
      .attr("x1", 0).attr("x2", this.W).attr("stroke", "#dde5dd").attr("stroke-width", 0.5)
      .attr("y1", (d) => this.yS(d)).attr("y2", (d) => this.yS(d))
      .merge(yLines).transition(t).attr("y1", (d) => this.yS(d)).attr("y2", (d) => this.yS(d));
    yLines.exit().remove();

    const yTickTexts = this.gridGroup.selectAll("text.y-tick").data(yTicks);
    yTickTexts.enter().append("text").attr("class", "tick y-tick")
      .attr("x", -4).attr("text-anchor", "end").attr("dominant-baseline", "middle")
      .merge(yTickTexts).transition(t)
      .attr("y", (d) => this.yS(d))
      .text((d) => (d === 0 ? "0" : d3.format("~s")(d)));
    yTickTexts.exit().remove();

    const { xS, yS, H, hoverLabel } = this;
    const barData = DRIVERS.map((dr) => ({ driver: dr, val: counts[dr] || 0 }));

    const bars = this.g.selectAll("rect.bar").data(barData);
    bars.enter().append("rect").attr("class", "bar")
      .attr("rx", 3).attr("ry", 3)
      .attr("x", (d) => xS(d.driver)).attr("width", xS.bandwidth())
      .attr("fill", (d) => DEFOREST_COLORS[d.driver])
      .attr("y", H).attr("height", 0).attr("opacity", 0.85);

    const merged = this.g.selectAll("rect.bar");
    merged
      .attr("rx", 3).attr("ry", 3)
      .attr("x", (d) => xS(d.driver)).attr("width", xS.bandwidth())
      .attr("fill", (d) => DEFOREST_COLORS[d.driver]).attr("opacity", 0.85)
      .on("mouseover", function (d) {
        if (d.val === 0) return;
        d3.select(this).attr("opacity", 1).attr("stroke", "#fff").attr("stroke-width", 1.5);
        hoverLabel.attr("x", xS(d.driver) + xS.bandwidth() / 2)
          .attr("y", yS(d.val) - 4).text(d3.format(",")(d.val)).attr("visibility", "visible");
      })
      .on("mouseout", function () {
        d3.select(this).attr("opacity", 0.85).attr("stroke", "none");
        hoverLabel.attr("visibility", "hidden");
      });

    merged.transition(t).attr("y", (d) => yS(d.val)).attr("height", (d) => H - yS(d.val));
    bars.exit().remove();
    hoverLabel.raise();
  }
}

/* ── CapacityTreemap ──────────────────────────────────────────────────────── */

export class CapacityTreemap {
  constructor(id, data, onFuelFilter) {
    this.data = data;
    this._onFuelFilter = onFuelFilter || null;
    this._selectedFuel = null;
    this.svg = d3.select("#" + id);
    const vb = this.svg.node().viewBox.baseVal;
    this.W = vb.width;
    this.H = vb.height;
    this.layout = d3.treemap().size([this.W, this.H]).padding(2).round(true);
  }

  resetSelection() {
    this._selectedFuel = null;
  }

  update(minLat, maxLat, minLng, maxLng, activeFuels, activeCountry) {
    const sums = Object.fromEntries(FUELS.map((f) => [f, 0]));

    this.data.forEach((d) => {
      if (d.lat < minLat || d.lat > maxLat || d.lng < minLng || d.lng > maxLng) return;
      if (activeCountry !== "ALL" && d.country !== activeCountry) return;
      const fuel = normalizeFuel(d.fuel);
      if (!activeFuels.includes(fuel)) return;
      sums[fuel] += d.capacity || 0;
    });

    const total = d3.sum(Object.values(sums));
    document.getElementById("total-mw").textContent =
      total > 0 ? d3.format(",.0f")(total) + " MW" : "—";

    const hoverEl = document.getElementById("treemap-label");

    const root = d3
      .hierarchy({ children: FUELS.map((f) => ({ fuel: f, value: sums[f] })) })
      .sum((d) => d.value || 0);
    this.layout(root);

    const t = d3.transition().duration(T);
    const cells = this.svg
      .selectAll("g.tm-cell")
      .data(root.leaves(), (d) => d.data.fuel);

    const entering = cells.enter().append("g").attr("class", "tm-cell");
    entering.append("rect").attr("rx", 2).attr("ry", 2);
    entering
      .append("text")
      .attr("class", "tm-label")
      .attr("pointer-events", "none")
      .attr("fill", "#fff")
      .attr("font-weight", "600");

    const merged = entering.merge(cells);

    merged
      .select("rect")
      .attr("fill", (d) => FUEL_COLORS[d.data.fuel])
      .attr("opacity", (d) => (activeFuels.includes(d.data.fuel) ? 0.85 : 0.2))
      .attr("stroke", (d) => d.data.fuel === this._selectedFuel ? "#fff" : "none")
      .attr("stroke-width", 2)
      .style("cursor", (d) => (d.value > 0 ? "pointer" : "default"))
      .on("mouseover", function (d) {
        if (d.value === 0) return;
        d3.select(this).attr("opacity", 1);
        const pct = ((d.value / total) * 100).toFixed(1);
        hoverEl.textContent = `${d.data.fuel} — ${d3.format(",.0f")(d.value)} MW (${pct}%)`;
      })
      .on("mouseout", function (d) {
        d3.select(this).attr("opacity", activeFuels.includes(d.data.fuel) ? 0.85 : 0.2);
        hoverEl.textContent = "Hover a cell";
      })
      .on("click", (d) => {
        if (d.value === 0 || !this._onFuelFilter) return;
        const newFuel = this._selectedFuel === d.data.fuel ? null : d.data.fuel;
        this._selectedFuel = newFuel;
        this._onFuelFilter(newFuel);
      });

    merged
      .transition(t)
      .attr("transform", (d) => `translate(${d.x0},${d.y0})`);

    merged
      .select("rect")
      .transition(t)
      .attr("width", (d) => Math.max(0, d.x1 - d.x0))
      .attr("height", (d) => Math.max(0, d.y1 - d.y0));

    merged
      .select("text.tm-label")
      .text((d) => (d.x1 - d.x0 > 30 && d.y1 - d.y0 > 13 ? d.data.fuel : ""))
      .attr("font-size", (d) => (d.x1 - d.x0 > 48 ? "7px" : "6px"))
      .transition(t)
      .attr("x", 4)
      .attr("y", (d) => Math.min(11, (d.y1 - d.y0) * 0.65));

    cells.exit().remove();
  }
}

/* ── RegionalCompass ──────────────────────────────────────────────────────── */

const COMPASS_FOSSIL = new Set(["Coal", "Gas", "Oil", "Petcoke"]);

export class RegionalCompass {
  constructor(id, allData, correlationData) {
    this.svg = d3.select("#" + id);
    const vb = this.svg.node().viewBox.baseVal;
    const m = { top: 10, right: 14, bottom: 32, left: 40 };
    this.W = vb.width - m.left - m.right;
    this.H = vb.height - m.top - m.bottom;

    this.g = this.svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

    this.xS = d3.scaleLinear().domain([0, 100]).range([0, this.W]);
    this.yS = d3.scaleLog().domain([10, 200000]).range([this.H, 0]).clamp(true);

    // Quadrant background rectangles
    const midX = this.xS(50);
    const midY = this.H / 2;
    const quads = [
      { x: 0,    y: 0,    w: midX,         h: midY,         fill: "rgba(0,160,80,0.06)" },  // low fossil, high deforest
      { x: midX, y: 0,    w: this.W - midX, h: midY,         fill: "rgba(200,60,0,0.06)" },  // high fossil, high deforest
      { x: 0,    y: midY, w: midX,         h: this.H - midY, fill: "rgba(0,180,100,0.04)" }, // low fossil, low deforest
      { x: midX, y: midY, w: this.W - midX, h: this.H - midY, fill: "rgba(200,160,0,0.05)" }, // high fossil, low deforest
    ];
    quads.forEach((q) => {
      this.g.append("rect")
        .attr("x", q.x).attr("y", q.y).attr("width", q.w).attr("height", q.h)
        .attr("fill", q.fill);
    });

    // Quadrant labels
    const qlabels = [
      { x: 4,           y: 9,  text: "agri pressure" },
      { x: this.W - 4,  y: 9,  text: "double pressure", anchor: "end" },
      { x: 4,           y: this.H - 4, text: "clean" },
      { x: this.W - 4,  y: this.H - 4, text: "industrial", anchor: "end" },
    ];
    qlabels.forEach((q) => {
      this.g.append("text")
        .attr("x", q.x).attr("y", q.y)
        .attr("font-size", "7px").attr("fill", "var(--ink-4)")
        .attr("text-anchor", q.anchor || "start")
        .style("font-style", "italic")
        .text(q.text);
    });

    // Grid lines: x at 50, y at log ticks
    this.g.append("line")
      .attr("x1", midX).attr("x2", midX).attr("y1", 0).attr("y2", this.H)
      .attr("stroke", "var(--rule)").attr("stroke-width", 0.5);
    this.g.append("line")
      .attr("x1", 0).attr("x2", this.W).attr("y1", midY).attr("y2", midY)
      .attr("stroke", "var(--rule)").attr("stroke-width", 0.5);

    // X ticks
    [0, 25, 50, 75, 100].forEach((v) => {
      this.g.append("text").attr("class", "tick")
        .attr("x", this.xS(v)).attr("y", this.H + 10)
        .attr("text-anchor", "middle").text(v + "%");
    });

    // Y ticks
    [100, 1000, 10000, 100000].forEach((v) => {
      this.g.append("text").attr("class", "tick")
        .attr("x", -4).attr("y", this.yS(v))
        .attr("text-anchor", "end").attr("dominant-baseline", "middle")
        .text(d3.format("~s")(v));
    });

    // Axis labels
    this.svg.append("text").attr("class", "axis-label")
      .attr("x", m.left + this.W / 2).attr("y", m.top + this.H + 28)
      .attr("text-anchor", "middle").text("Fossil capacity %");
    this.svg.append("text").attr("class", "axis-label")
      .attr("transform", "rotate(-90)")
      .attr("x", -(m.top + this.H / 2)).attr("y", 11)
      .attr("text-anchor", "middle").text("Deforest. (log)");

    // Compute per-iso3 fossil_pct from allData
    const byIso3 = new Map();
    allData.forEach((p) => {
      if (!p.iso3) return;
      if (!byIso3.has(p.iso3)) byIso3.set(p.iso3, { total: 0, fossil: 0 });
      const c = byIso3.get(p.iso3);
      c.total += p.capacity || 0;
      if (COMPASS_FOSSIL.has(p.fuel)) c.fossil += p.capacity || 0;
    });
    // Viewport dot (starts at center)
    this._dot = this.g.append("circle")
      .attr("r", 6)
      .attr("cx", this.xS(50))
      .attr("cy", this.H / 2)
      .attr("fill", "var(--forest)")
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)
      .attr("opacity", 0);

    this._noDataLabel = this.g.append("text")
      .attr("x", this.W / 2).attr("y", this.H / 2)
      .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
      .attr("font-size", "9.5px").attr("fill", "var(--ink-4)")
      .style("font-style", "italic")
      .attr("visibility", "hidden")
      .text("Enable deforestation overlay");
  }

  update(visiblePlants, deforestByIso3) {
    let totalCap = 0, fossilCap = 0;
    visiblePlants.forEach((p) => {
      const cap = p.capacity || 0;
      totalCap += cap;
      if (COMPASS_FOSSIL.has(p.fuel)) fossilCap += cap;
    });
    const fossilPct = totalCap > 0 ? (fossilCap / totalCap) * 100 : 0;

    let totalDeforest = 0;
    if (deforestByIso3) {
      deforestByIso3.forEach((v) => { totalDeforest += v; });
    }

    const hasData = deforestByIso3 && totalDeforest > 0;
    this._noDataLabel.attr("visibility", hasData ? "hidden" : "visible");
    this._dot.transition().duration(400).ease(d3.easeCubicOut)
      .attr("opacity", hasData ? 0.9 : 0)
      .attr("cx", this.xS(fossilPct))
      .attr("cy", hasData ? this.yS(Math.max(10, totalDeforest)) : this.H / 2);
  }
}

/* ── FuelDeforestProfile ──────────────────────────────────────────────────── */

export class FuelDeforestProfile extends BarChart {
  constructor(id, data) {
    super(id, data, { leftMargin: 42, yLabel: "Avg deforest. px" });

    this.placeholder = this.g.append("text")
      .attr("x", this.W / 2).attr("y", this.H / 2)
      .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
      .attr("font-size", "9.5px").attr("fill", "var(--ink-4)")
      .style("font-style", "italic")
      .text("Enable deforestation overlay");
  }

  update(minLat, maxLat, minLng, maxLng, activeFuels, activeCountry, deforestByIso3) {
    const hasDeforest = deforestByIso3 && deforestByIso3.size > 0;
    this.placeholder.attr("visibility", hasDeforest ? "hidden" : "visible");

    if (!hasDeforest) {
      const t = d3.transition().duration(T).ease(d3.easeCubicOut);
      this.g.selectAll("rect.bar").transition(t).attr("y", this.H).attr("height", 0);
      return;
    }

    const avgByFuel = {};
    FUELS.forEach((f) => {
      const plantsForFuel = this._filterData(minLat, maxLat, minLng, maxLng, [f], activeCountry);
      const iso3Set = new Set(plantsForFuel.filter((d) => d.iso3).map((d) => d.iso3));
      if (iso3Set.size === 0) { avgByFuel[f] = 0; return; }
      let total = 0;
      iso3Set.forEach((iso3) => { total += deforestByIso3.get(iso3) || 0; });
      avgByFuel[f] = total / iso3Set.size;
    });

    const mx = Math.max(...Object.values(avgByFuel), 1);
    this.yS.domain([0, mx]);
    this._updateYGrid();

    const barData = FUELS.map((f) => ({ fuel: f, val: avgByFuel[f] }));
    this._updateBars(barData, activeFuels, (v) => d3.format(",d")(v) + " px");
  }
}

/* ── TopDeforestCountries ─────────────────────────────────────────────────── */

export class TopDeforestCountries {
  constructor(id, iso3ToCountry) {
    // iso3ToCountry: Map<iso3, countryName>
    this._iso3ToCountry = iso3ToCountry;

    this.svg = d3.select("#" + id);
    const vb = this.svg.node().viewBox.baseVal;
    const m = { top: 6, right: 50, bottom: 6, left: 90 };
    this.W = vb.width - m.left - m.right;
    this.H = vb.height - m.top - m.bottom;

    this.g = this.svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

    this.xS = d3.scaleLinear().domain([0, 1]).range([0, this.W]);
    this.yS = d3.scaleBand().domain([0,1,2,3,4]).range([0, this.H]).padding(0.25);

    this.placeholder = this.g.append("text")
      .attr("x", this.W / 2).attr("y", this.H / 2)
      .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
      .attr("font-size", "9.5px").attr("fill", "var(--ink-4)")
      .style("font-style", "italic")
      .text("Enable deforestation overlay");
  }

  update(deforestByIso3) {
    const t = d3.transition().duration(T).ease(d3.easeCubicOut);
    const hasData = deforestByIso3 && deforestByIso3.size > 0;
    this.placeholder.attr("visibility", hasData ? "hidden" : "visible");

    if (!hasData) {
      this.g.selectAll("rect.top-bar").transition(t).attr("width", 0);
      return;
    }

    // Top 5 by count — rank stored in datum so position callbacks use d.rank,
    // not the selection index i (which reflects DOM order, not sorted rank).
    const top5 = [...deforestByIso3.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([iso3, count], rank) => ({
        iso3,
        name: (this._iso3ToCountry.get(iso3) || iso3).slice(0, 16),
        count,
        rank,
      }));

    const maxCount = top5[0].count;
    this.xS.domain([0, maxCount]);
    this.yS.domain(top5.map((_, i) => i));

    // Bars
    const bars = this.g.selectAll("rect.top-bar").data(top5, (d) => d.iso3);
    bars.enter().append("rect").attr("class", "top-bar")
      .attr("rx", 3).attr("ry", 3)
      .attr("y", (d) => this.yS(d.rank)).attr("height", this.yS.bandwidth())
      .attr("width", 0).attr("fill", "var(--forest)").attr("opacity", 0.75);

    this.g.selectAll("rect.top-bar").transition(t)
      .attr("y", (d) => this.yS(d.rank))
      .attr("height", this.yS.bandwidth())
      .attr("width", (d) => this.xS(d.count))
      .attr("fill", "var(--forest)");

    bars.exit().transition(t).attr("width", 0).remove();

    // Country name labels (left of bar)
    const names = this.g.selectAll("text.top-name").data(top5, (d) => d.iso3);
    names.enter().append("text").attr("class", "tick top-name")
      .attr("x", -4).attr("text-anchor", "end").attr("dominant-baseline", "middle");
    this.g.selectAll("text.top-name").transition(t)
      .attr("y", (d) => this.yS(d.rank) + this.yS.bandwidth() / 2)
      .text((d) => d.name);
    names.exit().remove();

    // Count labels (right of bar)
    const labels = this.g.selectAll("text.top-val").data(top5, (d) => d.iso3);
    labels.enter().append("text").attr("class", "tick top-val")
      .attr("x", 0).attr("dominant-baseline", "middle");
    this.g.selectAll("text.top-val").transition(t)
      .attr("x", (d) => this.xS(d.count) + 3)
      .attr("y", (d) => this.yS(d.rank) + this.yS.bandwidth() / 2)
      .text((d) => d3.format(",")(d.count));
    labels.exit().remove();
  }
}

/* ── FossilGauge ──────────────────────────────────────────────────────────── */

const FOSSIL_FUELS = new Set(["Coal", "Gas", "Oil", "Petcoke"]);

export class FossilGauge {
  constructor(id) {
    const svg = d3.select("#" + id);
    const vb = svg.node().viewBox.baseVal;
    const cx = vb.width / 2;
    const cy = vb.height - 18;
    const R = Math.min(cx, cy) - 10;

    this._cx = cx;
    this._cy = cy;
    this._R = R;
    this._needleG = null;
    this._label = null;
    this._fossilPct = 0;

    const g = svg.append("g");

    // Gradient arc: green → orange → red
    const arcColors = [
      { offset: "0%", color: "#4caf50" },
      { offset: "50%", color: "#ff9800" },
      { offset: "100%", color: "#f44336" },
    ];
    const defs = svg.append("defs");
    const gradId = "fossil-grad-" + id;
    const grad = defs.append("linearGradient").attr("id", gradId)
      .attr("x1", "0%").attr("y1", "0%").attr("x2", "100%").attr("y2", "0%");
    arcColors.forEach((c) => grad.append("stop").attr("offset", c.offset).attr("stop-color", c.color));

    // Arc generator for the gauge track
    const arc = d3.arc()
      .innerRadius(R - 14)
      .outerRadius(R)
      .startAngle(-Math.PI / 2)
      .endAngle(Math.PI / 2);

    g.append("path")
      .attr("d", arc())
      .attr("transform", `translate(${cx},${cy})`)
      .attr("fill", `url(#${gradId})`)
      .attr("opacity", 0.85);

    // Global avg tick at 50% (π/2 - π*0.5 = 0 rad from top = right of half arc)
    // The half-arc goes from -90° (left, 0%) to +90° (right, 100%)
    // 50% position: angle = 0 (straight up from center, so bottom of half-arc)
    // Let's mark 50% position:
    const avgAngle = 0; // 50% = middle of arc = pointing straight down
    const tickR = R + 4;
    const tx = cx + tickR * Math.sin(avgAngle);
    const ty = cy - tickR * Math.cos(avgAngle);
    g.append("line")
      .attr("x1", cx + (R - 14) * Math.sin(avgAngle))
      .attr("y1", cy - (R - 14) * Math.cos(avgAngle))
      .attr("x2", cx + R * Math.sin(avgAngle))
      .attr("y2", cy - R * Math.cos(avgAngle))
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5);

    g.append("text")
      .attr("x", tx).attr("y", ty - 3)
      .attr("text-anchor", "middle").attr("font-size", "7px")
      .attr("fill", "var(--ink-3)").text("avg");

    // Axis labels
    g.append("text").attr("x", cx - R - 2).attr("y", cy + 2)
      .attr("text-anchor", "end").attr("font-size", "8px").attr("fill", "var(--ink-3)").text("0%");
    g.append("text").attr("x", cx + R + 2).attr("y", cy + 2)
      .attr("text-anchor", "start").attr("font-size", "8px").attr("fill", "var(--ink-3)").text("100%");

    // Needle group
    this._needleG = g.append("g").attr("transform", `translate(${cx},${cy}) rotate(0)`);
    this._needleG.append("line")
      .attr("x1", 0).attr("y1", 0)
      .attr("x2", -(R - 6)).attr("y2", 0)
      .attr("stroke", "var(--ink)").attr("stroke-width", 2)
      .attr("stroke-linecap", "round");
    this._needleG.append("circle").attr("r", 4).attr("fill", "var(--ink)");

    // Value label
    this._label = g.append("text")
      .attr("x", cx).attr("y", cy - 12)
      .attr("text-anchor", "middle").attr("font-size", "14px")
      .attr("font-weight", "600").attr("fill", "var(--ink)")
      .text("—");
  }

  update(visiblePlants) {
    let total = 0, fossil = 0;
    visiblePlants.forEach((p) => {
      const cap = p.capacity || 0;
      total += cap;
      if (FOSSIL_FUELS.has(p.fuel)) fossil += cap;
    });
    const pct = total > 0 ? fossil / total : 0;
    this._fossilPct = pct;

    // Needle: 0deg = 0% (left/9 o'clock), 180deg = 100% (right/3 o'clock)
    const angle = pct * 180;
    this._needleG.transition().duration(T).ease(d3.easeCubicOut)
      .attr("transform", `translate(${this._cx},${this._cy}) rotate(${angle})`);
    this._label.text(total > 0 ? (pct * 100).toFixed(1) + "%" : "—");
  }
}

/* ── FuelCountryOverlap ───────────────────────────────────────────────────── */

export class FuelCountryOverlap extends BarChart {
  constructor(id, data) {
    super(id, data, { leftMargin: 30, yLabel: "% countries" });
    this.yS.domain([0, 100]);
    this._updateYGrid();

    this.placeholder = this.g.append("text")
      .attr("x", this.W / 2).attr("y", this.H / 2)
      .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
      .attr("font-size", "9.5px").attr("fill", "var(--ink-4)")
      .style("font-style", "italic")
      .text("Enable deforestation overlay");
  }

  update(minLat, maxLat, minLng, maxLng, activeFuels, activeCountry, deforestByIso3) {
    const hasDeforest = deforestByIso3 && deforestByIso3.size > 0;
    this.placeholder.attr("visibility", hasDeforest ? "hidden" : "visible");

    if (!hasDeforest) {
      const t = d3.transition().duration(T).ease(d3.easeCubicOut);
      this.g.selectAll("rect.bar").transition(t).attr("y", this.H).attr("height", 0);
      return;
    }

    const pctByFuel = {};
    FUELS.forEach((f) => {
      const plantsForFuel = this._filterData(minLat, maxLat, minLng, maxLng, [f], activeCountry);
      const iso3Set = new Set(plantsForFuel.filter((d) => d.iso3).map((d) => d.iso3));
      if (iso3Set.size === 0) { pctByFuel[f] = 0; return; }
      let overlap = 0;
      iso3Set.forEach((iso3) => { if ((deforestByIso3.get(iso3) || 0) > 0) overlap++; });
      pctByFuel[f] = (overlap / iso3Set.size) * 100;
    });

    this.yS.domain([0, 100]);
    this._updateYGrid();

    const barData = FUELS.map((f) => ({ fuel: f, val: pctByFuel[f] }));
    this._updateBars(barData, activeFuels, (v) => v.toFixed(0) + "%");
  }
}
