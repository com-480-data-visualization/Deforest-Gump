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
    const dots = this.g.selectAll("circle.dot").data(newData, (d) => d.iso3);

    const entering = dots.enter().append("circle").attr("class", "dot")
      .attr("r", 0).attr("fill-opacity", 0);
    this._setupDotHandlers(entering);

    dots.exit().remove();

    dots.transition(t)
      .attr("cx", (d) => this.xS(d.deforest_count))
      .attr("cy", (d) => this.yS(d.fossil_pct))
      .attr("fill", (d) => FUEL_COLORS[normalizeFuel(d.dominant_fuel)]);

    this._applyDotStyles();
  }

  _applyDotStyles() {
    const sel = this._selectedCountry;
    this.g.selectAll("circle.dot").transition().duration(200)
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
  constructor(id, data) {
    this.data = data;
    this.svg = d3.select("#" + id);
    const vb = this.svg.node().viewBox.baseVal;
    this.W = vb.width;
    this.H = vb.height;
    this.layout = d3.treemap().size([this.W, this.H]).padding(2).round(true);
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
