import { FUELS, FUEL_COLORS, normalizeFuel } from "./constants.js";

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
    const { xS, yS, H, hoverLabel } = this;

    const bars = this.g.selectAll("rect.bar").data(barData);
    bars
      .enter()
      .append("rect")
      .attr("class", "bar")
      .merge(bars)
      .attr("x", (d) => xS(d.fuel))
      .attr("width", xS.bandwidth())
      .attr("y", (d) => yS(d.val))
      .attr("height", (d) => H - yS(d.val))
      .attr("fill", (d) => FUEL_COLORS[d.fuel])
      .attr("opacity", (d) => (activeFuels.includes(d.fuel) ? 0.85 : 0.2))
      .on("mouseover", function (d) {
        if (d.val === 0) return;
        hoverLabel
          .attr("x", xS(d.fuel) + xS.bandwidth() / 2)
          .attr("y", yS(d.val) - 4)
          .text(d3.format(",.0f")(d.val) + " MW")
          .attr("visibility", "visible");
      })
      .on("mouseout", () => hoverLabel.attr("visibility", "hidden"));
    bars.exit().remove();

    hoverLabel.raise();
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
    const { xS, yS, H, hoverLabel } = this;

    const bars = this.g.selectAll("rect.bar").data(barData);
    bars
      .enter()
      .append("rect")
      .attr("class", "bar")
      .merge(bars)
      .attr("x", (d) => xS(d.fuel))
      .attr("width", xS.bandwidth())
      .attr("y", (d) => yS(d.val))
      .attr("height", (d) => H - yS(d.val))
      .attr("fill", (d) => FUEL_COLORS[d.fuel])
      .attr("opacity", (d) => (activeFuels.includes(d.fuel) ? 0.85 : 0.2))
      .on("mouseover", function (d) {
        if (d.val === 0) return;
        hoverLabel
          .attr("x", xS(d.fuel) + xS.bandwidth() / 2)
          .attr("y", yS(d.val) - 4)
          .text(d3.format(",")(d.val))
          .attr("visibility", "visible");
      })
      .on("mouseout", () => hoverLabel.attr("visibility", "hidden"));
    bars.exit().remove();

    hoverLabel.raise();
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

    this.arc = d3.arc().innerRadius(0).outerRadius(this.R);
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

    document.getElementById("total-mw").textContent =
      total > 0 ? d3.format(",.0f")(total) + " MW" : "—";

    const slices = this.g.selectAll("path.slice").data(this.pie(pieData));
    slices
      .enter()
      .append("path")
      .attr("class", "slice")
      .merge(slices)
      .attr("d", this.arc)
      .attr("fill", (d) => FUEL_COLORS[d.data.fuel])
      .attr("opacity", (d) => (activeFuels.includes(d.data.fuel) ? 0.85 : 0.2))
      .attr("stroke", "#fff")
      .attr("stroke-width", 0.5)
      .on("mouseover", function (d) {
        if (d.data.value === 0) return;
        const pct = ((d.data.value / total) * 100).toFixed(1);
        pieLabel.textContent = `${d.data.fuel} — ${d3.format(",.0f")(d.data.value)} MW (${pct}%)`;
      })
      .on("mouseout", () => {
        pieLabel.textContent = "Hover a slice";
      });
    slices.exit().remove();
  }
}
