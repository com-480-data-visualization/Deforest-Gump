import { FUELS, FUEL_COLORS, normalizeFuel } from "./constants.js";

const T = 350; // shared transition duration (ms)

/* ── CorrelationScatter ───────────────────────────────────────────────────── */

export class CorrelationScatter {
  constructor(id, data, onCountryClick) {
    this.data = data;
    this.onCountryClick = onCountryClick;

    this.svg = d3.select("#" + id);
    const vb = this.svg.node().viewBox.baseVal;
    const m = { top: 10, right: 12, bottom: 44, left: 46 };
    this.W = vb.width - m.left - m.right;
    this.H = vb.height - m.top - m.bottom;

    this.g = this.svg
      .append("g")
      .attr("transform", `translate(${m.left},${m.top})`);

    const counts = data.map((d) => d.deforest_count);
    const minX = d3.min(counts);
    const maxX = d3.max(counts);

    this.xS = d3.scaleLog().domain([minX, maxX]).range([0, this.W]).clamp(true);
    this.yS = d3.scaleLinear().domain([0, 100]).range([this.H, 0]);
    this.rS = d3
      .scaleSqrt()
      .domain([0, d3.max(data, (d) => d.plant_count)])
      .range([2, 9]);

    // Grid lines
    const gridG = this.g.append("g");
    [0, 25, 50, 75, 100].forEach((v) => {
      gridG
        .append("line")
        .attr("x1", 0)
        .attr("x2", this.W)
        .attr("y1", this.yS(v))
        .attr("y2", this.yS(v))
        .attr("stroke", "#dde5dd")
        .attr("stroke-width", 0.5);
    });

    // X axis ticks
    const xTicks = this.xS.ticks(5);
    xTicks.forEach((v) => {
      this.g
        .append("text")
        .attr("class", "tick")
        .attr("x", this.xS(v))
        .attr("y", this.H + 9)
        .attr("text-anchor", "middle")
        .text(d3.format("~s")(v));
      gridG
        .append("line")
        .attr("x1", this.xS(v))
        .attr("x2", this.xS(v))
        .attr("y1", 0)
        .attr("y2", this.H)
        .attr("stroke", "#dde5dd")
        .attr("stroke-width", 0.5);
    });

    // Y axis ticks
    [0, 25, 50, 75, 100].forEach((v) => {
      this.g
        .append("text")
        .attr("class", "tick")
        .attr("x", -4)
        .attr("y", this.yS(v))
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "middle")
        .text(v + "%");
    });

    // Axis labels
    this.svg
      .append("text")
      .attr("class", "axis-label")
      .attr("x", m.left + this.W / 2)
      .attr("y", m.top + this.H + 40)
      .attr("text-anchor", "middle")
      .text("Deforestation pixels (log scale)");

    this.svg
      .append("text")
      .attr("class", "axis-label")
      .attr("transform", "rotate(-90)")
      .attr("x", -(m.top + this.H / 2))
      .attr("y", 11)
      .attr("text-anchor", "middle")
      .text("Fossil fuel capacity %");

    // Hover label
    this.hoverLabel = this.svg
      .append("text")
      .attr("class", "scatter-label")
      .attr("font-size", "7px")
      .attr("fill", "#1c2e1c")
      .attr("font-weight", "600")
      .style("pointer-events", "none")
      .attr("visibility", "hidden");

    this._drawDots();
  }

  _drawDots() {
    const { g, xS, yS, rS, hoverLabel, W, onCountryClick } = this;
    const mLeft = 46;
    const mTop = 10;

    // Dots enter with r=0 and fade in with a staggered delay
    g.selectAll("circle.dot")
      .data(this.data)
      .enter()
      .append("circle")
      .attr("class", "dot")
      .attr("cx", (d) => xS(d.deforest_count))
      .attr("cy", (d) => yS(d.fossil_pct))
      .attr("r", 0)
      .attr("fill", (d) => FUEL_COLORS[normalizeFuel(d.dominant_fuel)])
      .attr("fill-opacity", 0)
      .attr("stroke", "#fff")
      .attr("stroke-width", 0.6)
      .style("cursor", "pointer")
      .on("mouseover", function (d) {
        d3.select(this)
          .transition()
          .duration(120)
          .attr("stroke", "#1c2e1c")
          .attr("stroke-width", 1.5)
          .attr("fill-opacity", 1);
        const cx = mLeft + xS(d.deforest_count);
        const cy = mTop + yS(d.fossil_pct);
        const labelX = cx > W * 0.75 ? cx - 4 : cx + 4;
        const anchor = cx > W * 0.75 ? "end" : "start";
        hoverLabel
          .attr("x", labelX)
          .attr("y", cy - rS(d.plant_count) - 3)
          .attr("text-anchor", anchor)
          .text(`${d.country} — ${d.fossil_pct}% fossil`)
          .attr("visibility", "visible");
      })
      .on("mouseout", function () {
        d3.select(this)
          .transition()
          .duration(120)
          .attr("stroke", "#fff")
          .attr("stroke-width", 0.6)
          .attr("fill-opacity", 0.75);
        hoverLabel.attr("visibility", "hidden");
      })
      .on("click", (d) => onCountryClick(d.country))
      .transition()
      .duration(500)
      .delay((d, i) => i * 4)
      .ease(d3.easeCubicOut)
      .attr("r", (d) => rS(d.plant_count))
      .attr("fill-opacity", 0.75);

    this._addKeyAnnotations();
  }

  /* Annotate the four most story-relevant outliers directly on the chart. */
  _addKeyAnnotations() {
    const KEY = {
      "Russian Federation": "Russia",
      Brazil: "Brazil",
      Indonesia: "Indonesia",
      "Congo, The Democratic Republic of the": "DRC",
    };
    this.data
      .filter((d) => KEY[d.country])
      .forEach((d) => {
        const cx = this.xS(d.deforest_count);
        const cy = this.yS(d.fossil_pct);
        const label = KEY[d.country];
        const anchor = cx > this.W * 0.62 ? "end" : "start";
        const dx = anchor === "end" ? -7 : 7;
        this.g
          .append("text")
          .attr("class", "scatter-annotation")
          .attr("x", cx + dx)
          .attr("y", cy - 5)
          .attr("text-anchor", anchor)
          .attr("font-size", "7px")
          .attr("fill", "#3a4a3a")
          .attr("font-weight", "700")
          .attr("pointer-events", "none")
          .text(label);
      });
  }

  /* Highlight a specific country's dot; pass "ALL" to reset. */
  highlightCountry(country) {
    this.g
      .selectAll("circle.dot")
      .transition()
      .duration(200)
      .attr("fill-opacity", (d) =>
        country === "ALL" || d.country === country ? 0.85 : 0.12,
      )
      .attr("r", (d) => {
        const base = this.rS(d.plant_count);
        return country !== "ALL" && d.country === country ? base * 1.5 : base;
      })
      .attr("stroke-width", (d) =>
        country !== "ALL" && d.country === country ? 1.5 : 0.6,
      )
      .attr("stroke", (d) =>
        country !== "ALL" && d.country === country ? "#1c2e1c" : "#fff",
      );
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

/* ── CapacityPieChart ─────────────────────────────────────────────────────── */

export class CapacityPieChart {
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

    this.arc = d3.arc().innerRadius(this.R * 0.42).outerRadius(this.R);
    this.pie = d3
      .pie()
      .value((d) => d.value)
      .sort(null);
  }

  update(minLat, maxLat, minLng, maxLng, activeFuels, activeCountry) {
    const sums = Object.fromEntries(FUELS.map((f) => [f, 0]));

    this.data.forEach((d) => {
      if (d.lat < minLat || d.lat > maxLat || d.lng < minLng || d.lng > maxLng)
        return;
      if (activeCountry !== "ALL" && d.country !== activeCountry) return;
      const fuel = normalizeFuel(d.fuel);
      if (!activeFuels.includes(fuel)) return;
      sums[fuel] += d.capacity || 0;
    });

    const pieData = FUELS.map((f) => ({ fuel: f, value: sums[f] }));
    const total = d3.sum(pieData, (d) => d.value);
    const pieLabel = document.getElementById("pie-label");
    const arc = this.arc;

    document.getElementById("total-mw").textContent =
      total > 0 ? d3.format(",.0f")(total) + " MW" : "—";

    const slices = this.g.selectAll("path.slice").data(this.pie(pieData));

    // Enter: initialise _current for the tween to interpolate from
    slices
      .enter()
      .append("path")
      .attr("class", "slice")
      .each(function (d) {
        this._current = d;
      })
      .attr("d", arc)
      .attr("stroke", "#fff")
      .attr("stroke-width", 0.5);

    const merged = this.g.selectAll("path.slice");

    merged
      .attr("fill", (d) => FUEL_COLORS[d.data.fuel])
      .attr("opacity", (d) => (activeFuels.includes(d.data.fuel) ? 0.85 : 0.2))
      .attr("stroke", "#fff")
      .attr("stroke-width", 0.5)
      .on("mouseover", function (d) {
        if (d.data.value === 0) return;
        d3.select(this).transition().duration(120).attr("opacity", 1);
        const pct = ((d.data.value / total) * 100).toFixed(1);
        pieLabel.textContent = `${d.data.fuel} — ${d3.format(",.0f")(d.data.value)} MW (${pct}%)`;
      })
      .on("mouseout", function (d) {
        d3.select(this)
          .transition()
          .duration(120)
          .attr("opacity", activeFuels.includes(d.data.fuel) ? 0.85 : 0.2);
        pieLabel.textContent = "Hover a slice";
      });

    // Smooth arc tween on every update
    merged
      .transition()
      .duration(T)
      .attrTween("d", function (d) {
        const interp = d3.interpolate(this._current, d);
        this._current = interp(1);
        return (t) => arc(interp(t));
      });

    slices.exit().remove();
  }
}
