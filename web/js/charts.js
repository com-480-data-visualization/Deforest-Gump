import { FUELS, FUEL_COLORS, FOSSIL_FUELS, normalizeFuel } from "./constants.js";

const T = 350;
const GRID_COLOR = "#dde5dd";
const EASE = d3.easeCubicOut;

/* Pull viewBox-aware width/height + an inner <g> with the given margins. */
function setupFrame(svgSel, m) {
  const vb = svgSel.node().viewBox.baseVal;
  const W = vb.width - m.left - m.right;
  const H = vb.height - m.top - m.bottom;
  const g = svgSel.append("g").attr("transform", `translate(${m.left},${m.top})`);
  return { W, H, g };
}

function makePlaceholder(g, W, H) {
  return g.append("text")
    .attr("x", W / 2).attr("y", H / 2)
    .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
    .attr("font-size", "9.5px").attr("fill", "var(--ink-4)")
    .style("font-style", "italic")
    .text("Enable deforestation overlay");
}

function makeHoverLabel(svgSel) {
  return svgSel.append("text")
    .attr("class", "scatter-label").attr("font-size", "7px")
    .attr("fill", "#1c2e1c").attr("font-weight", "600")
    .style("pointer-events", "none").attr("visibility", "hidden");
}

/* ── CorrelationScatter ───────────────────────────────────────────────────── */

export class CorrelationScatter {
  constructor(id, correlationData, onCountryClick) {
    this.onCountryClick = onCountryClick;
    this._selectedCountry = "ALL";
    this._deforestByCode = new Map(correlationData.map((d) => [d.code, d.deforest_count]));

    this.svg = d3.select("#" + id);
    this._m = { top: 10, right: 12, bottom: 44, left: 46 };
    const { W, H, g } = setupFrame(this.svg, this._m);
    this.W = W; this.H = H; this.g = g;

    const counts = correlationData.map((d) => d.deforest_count);
    this.xS = d3.scaleLog().domain([d3.min(counts), 10000]).range([0, W]).clamp(true);
    this.yS = d3.scaleLinear().domain([0, 100]).range([H, 0]);
    this.rS = d3.scaleSqrt().domain([0, 1]).range([2, 9]);

    const gridG = g.append("g");
    [0, 25, 50, 75, 100].forEach((v) => {
      gridG.append("line")
        .attr("x1", 0).attr("x2", W)
        .attr("y1", this.yS(v)).attr("y2", this.yS(v))
        .attr("stroke", GRID_COLOR).attr("stroke-width", 0.5);
      g.append("text").attr("class", "tick")
        .attr("x", -4).attr("y", this.yS(v))
        .attr("text-anchor", "end").attr("dominant-baseline", "middle")
        .text(v + "%");
    });

    const ticks = [10, 100, 1000, 10000];
    ticks.forEach((d) => {
      gridG.append("line")
        .attr("stroke", GRID_COLOR).attr("stroke-width", 0.5)
        .attr("y1", 0).attr("y2", H)
        .attr("x1", this.xS(d)).attr("x2", this.xS(d));
      g.append("text").attr("class", "tick")
        .attr("y", H + 9).attr("text-anchor", "middle")
        .attr("x", this.xS(d))
        .text(d3.format("~s")(d));
    });

    this.svg.append("text").attr("class", "axis-label")
      .attr("x", this._m.left + W / 2).attr("y", this._m.top + H + 40)
      .attr("text-anchor", "middle").text("Deforestation pixels (log scale)");
    this.svg.append("text").attr("class", "axis-label")
      .attr("transform", "rotate(-90)")
      .attr("x", -(this._m.top + H / 2)).attr("y", 11)
      .attr("text-anchor", "middle").text("Fossil fuel capacity %");

    this.hoverLabel = makeHoverLabel(this.svg);
  }

  _styleDots(sel, t) {
    const sel0 = this._selectedCountry;
    const isSel = (d) => sel0 !== "ALL" && d.country === sel0;
    const target = t || d3.transition().duration(200);
    sel.transition(target)
      .attr("fill-opacity", (d) => (sel0 !== "ALL" && d.country !== sel0 ? 0.12 : 0.75))
      .attr("r", (d) => this.rS(d.plant_count) * (isSel(d) ? 1.5 : 1))
      .attr("stroke", (d) => (isSel(d) ? "#1c2e1c" : "#fff"))
      .attr("stroke-width", (d) => (isSel(d) ? 1.5 : 0.6));
  }

  _attachHandlers(sel) {
    const { xS, yS, rS, hoverLabel, W, onCountryClick, _m } = this;
    sel
      .style("cursor", "pointer")
      .on("mouseover", function (d) {
        d3.select(this).transition().duration(120)
          .attr("stroke", "#1c2e1c").attr("stroke-width", 1.5).attr("fill-opacity", 1);
        const cx = _m.left + xS(d.deforest_count);
        const cy = _m.top + yS(d.fossil_pct);
        const right = cx > W * 0.75;
        hoverLabel.attr("x", right ? cx - 4 : cx + 4)
          .attr("y", cy - rS(d.plant_count) - 3)
          .attr("text-anchor", right ? "end" : "start")
          .text(`${d.country} — ${d.fossil_pct.toFixed(1)}% fossil`)
          .attr("visibility", "visible");
      })
      .on("mouseout", () => { this._styleDots(this.g.selectAll("circle.dot")); hoverLabel.attr("visibility", "hidden"); })
      .on("click", (d) => onCountryClick(this._selectedCountry === d.country ? "ALL" : d.country));
  }

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
      c.fuelCap[normalizeFuel(p.fuel)] = (c.fuelCap[normalizeFuel(p.fuel)] || 0) + cap;
      if (FOSSIL_FUELS.has(p.fuel)) c.fossil += cap;
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

    const t = d3.transition().duration(400).ease(EASE);
    const dots = this.g.selectAll("circle.dot").data(newData, (d) => d.iso3);

    const entering = dots.enter().append("circle").attr("class", "dot")
      .attr("r", 0).attr("fill-opacity", 0)
      .attr("stroke", "#fff").attr("stroke-width", 0.6);
    this._attachHandlers(entering);
    dots.exit().remove();

    const all = entering.merge(dots);
    all
      .attr("cx", (d) => this.xS(d.deforest_count))
      .attr("cy", (d) => this.yS(d.fossil_pct))
      .attr("fill", (d) => FUEL_COLORS[normalizeFuel(d.dominant_fuel)]);
    this._styleDots(all, t);
  }

  highlightCountry(country) {
    this._selectedCountry = country;
    this._styleDots(this.g.selectAll("circle.dot"));
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

  resetSelection() { this._selectedFuel = null; }

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
    const cells = this.svg.selectAll("g.tm-cell").data(root.leaves(), (d) => d.data.fuel);

    const entering = cells.enter().append("g").attr("class", "tm-cell");
    entering.append("rect").attr("rx", 2).attr("ry", 2);
    entering.append("text").attr("class", "tm-label")
      .attr("pointer-events", "none").attr("fill", "#fff").attr("font-weight", "600");

    const merged = entering.merge(cells);
    merged.select("rect")
      .attr("fill", (d) => FUEL_COLORS[d.data.fuel])
      .attr("opacity", (d) => (activeFuels.includes(d.data.fuel) ? 0.85 : 0.2))
      .attr("stroke", (d) => (d.data.fuel === this._selectedFuel ? "#fff" : "none"))
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

    merged.transition(t).attr("transform", (d) => `translate(${d.x0},${d.y0})`);
    merged.select("rect").transition(t)
      .attr("width", (d) => Math.max(0, d.x1 - d.x0))
      .attr("height", (d) => Math.max(0, d.y1 - d.y0));
    merged.select("text.tm-label")
      .text((d) => (d.x1 - d.x0 > 30 && d.y1 - d.y0 > 13 ? d.data.fuel : ""))
      .attr("font-size", (d) => (d.x1 - d.x0 > 48 ? "7px" : "6px"))
      .transition(t).attr("x", 4).attr("y", (d) => Math.min(11, (d.y1 - d.y0) * 0.65));

    cells.exit().remove();
  }
}

/* ── TopDeforestCountries ─────────────────────────────────────────────────── */

export class TopDeforestCountries {
  constructor(id, iso3ToCountry) {
    this._iso3ToCountry = iso3ToCountry;
    this.svg = d3.select("#" + id);
    const { W, H, g } = setupFrame(this.svg, { top: 6, right: 50, bottom: 6, left: 90 });
    this.W = W; this.H = H; this.g = g;

    this.xS = d3.scaleLinear().domain([0, 1]).range([0, W]);
    this.yS = d3.scaleBand().domain([0, 1, 2, 3, 4]).range([0, H]).padding(0.25);

    this.placeholder = makePlaceholder(g, W, H);
  }

  update(deforestByIso3) {
    const t = d3.transition().duration(T).ease(EASE);
    const hasData = deforestByIso3 && deforestByIso3.size > 0;
    this.placeholder.attr("visibility", hasData ? "hidden" : "visible");

    if (!hasData) {
      this.g.selectAll("rect.top-bar").transition(t).attr("width", 0);
      return;
    }

    const top5 = [...deforestByIso3.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([iso3, count], rank) => ({
        iso3,
        name: (this._iso3ToCountry.get(iso3) || iso3).slice(0, 16),
        count,
        rank,
      }));

    this.xS.domain([0, top5[0].count]);

    const bars = this.g.selectAll("rect.top-bar").data(top5, (d) => d.iso3);
    bars.enter().append("rect").attr("class", "top-bar")
      .attr("rx", 3).attr("ry", 3)
      .attr("y", (d) => this.yS(d.rank)).attr("height", this.yS.bandwidth())
      .attr("width", 0).attr("fill", "var(--forest)").attr("opacity", 0.75);
    this.g.selectAll("rect.top-bar").transition(t)
      .attr("y", (d) => this.yS(d.rank)).attr("height", this.yS.bandwidth())
      .attr("width", (d) => this.xS(d.count));
    bars.exit().transition(t).attr("width", 0).remove();

    const names = this.g.selectAll("text.top-name").data(top5, (d) => d.iso3);
    names.enter().append("text").attr("class", "tick top-name")
      .attr("x", -4).attr("text-anchor", "end").attr("dominant-baseline", "middle");
    this.g.selectAll("text.top-name").transition(t)
      .attr("y", (d) => this.yS(d.rank) + this.yS.bandwidth() / 2)
      .text((d) => d.name);
    names.exit().remove();

    const labels = this.g.selectAll("text.top-val").data(top5, (d) => d.iso3);
    labels.enter().append("text").attr("class", "tick top-val")
      .attr("dominant-baseline", "middle");
    this.g.selectAll("text.top-val").transition(t)
      .attr("x", (d) => this.xS(d.count) + 3)
      .attr("y", (d) => this.yS(d.rank) + this.yS.bandwidth() / 2)
      .text((d) => d3.format(",")(d.count));
    labels.exit().remove();
  }
}

/* ── Gauge (shared base for FossilGauge and DeforestGauge) ───────────────── */

class Gauge {
  constructor(id, gradId) {
    const svg = d3.select("#" + id);
    const vb = svg.node().viewBox.baseVal;
    const cx = vb.width / 2;
    const cy = vb.height - 18;
    const R = Math.min(cx, cy) - 10;
    this._cx = cx;
    this._cy = cy;

    const g = svg.append("g");

    const grad = svg.append("defs").append("linearGradient").attr("id", gradId)
      .attr("x1", "0%").attr("y1", "0%").attr("x2", "100%").attr("y2", "0%");
    [["0%", "#4caf50"], ["50%", "#ff9800"], ["100%", "#f44336"]]
      .forEach(([offset, color]) => grad.append("stop").attr("offset", offset).attr("stop-color", color));

    const arc = d3.arc()
      .innerRadius(R - 14).outerRadius(R)
      .startAngle(-Math.PI / 2).endAngle(Math.PI / 2);
    g.append("path").attr("d", arc())
      .attr("transform", `translate(${cx},${cy})`)
      .attr("fill", `url(#${gradId})`).attr("opacity", 0.85);

    g.append("line")
      .attr("x1", cx).attr("y1", cy - (R - 14))
      .attr("x2", cx).attr("y2", cy - R)
      .attr("stroke", "#fff").attr("stroke-width", 1.5);
    g.append("text")
      .attr("x", cx).attr("y", cy - R - 7)
      .attr("text-anchor", "middle").attr("font-size", "7px")
      .attr("fill", "var(--ink-3)").text("avg");

    g.append("text").attr("x", cx - R - 2).attr("y", cy + 2)
      .attr("text-anchor", "end").attr("font-size", "8px").attr("fill", "var(--ink-3)").text("0%");
    g.append("text").attr("x", cx + R + 2).attr("y", cy + 2)
      .attr("text-anchor", "start").attr("font-size", "8px").attr("fill", "var(--ink-3)").text("100%");

    this._needleG = g.append("g").attr("transform", `translate(${cx},${cy}) rotate(0)`);
    this._needleG.append("line")
      .attr("x1", 0).attr("y1", 0).attr("x2", -(R - 6)).attr("y2", 0)
      .attr("stroke", "var(--ink)").attr("stroke-width", 2).attr("stroke-linecap", "round");
    this._needleG.append("circle").attr("r", 4).attr("fill", "var(--ink)");

    this._label = g.append("text")
      .attr("x", cx).attr("y", cy - 12)
      .attr("text-anchor", "middle").attr("font-size", "14px")
      .attr("font-weight", "600").attr("fill", "var(--ink)").text("—");
  }

  _setPct(pct) {
    this._needleG.transition().duration(T).ease(EASE)
      .attr("transform", `translate(${this._cx},${this._cy}) rotate(${(pct ?? 0) * 180})`);
    this._label.text(pct != null ? (pct * 100).toFixed(1) + "%" : "—");
  }
}

export class FossilGauge extends Gauge {
  constructor(id) { super(id, "fossil-grad-" + id); }
  update(visiblePlants) {
    let total = 0, fossil = 0;
    visiblePlants.forEach((p) => {
      const cap = p.capacity || 0;
      total += cap;
      if (FOSSIL_FUELS.has(p.fuel)) fossil += cap;
    });
    this._setPct(total > 0 ? fossil / total : null);
  }
}

const DEFINITIVE_DRIVERS = new Set([1, 2, 5]);

export class DeforestGauge extends Gauge {
  constructor(id) { super(id, "deforest-grad-" + id); }
  update(counts) {
    let total = 0, definitive = 0;
    Object.entries(counts).forEach(([driver, count]) => {
      total += count;
      if (DEFINITIVE_DRIVERS.has(+driver)) definitive += count;
    });
    this._setPct(total > 0 ? definitive / total : null);
  }
}

/* ── ConclusionScatter ─────────────────────────────────────────────────────── */

export class ConclusionScatter {
  constructor(id, correlationData) {
    this._data = correlationData;

    this.svg = d3.select("#" + id);
    this._m = { top: 6, right: 6, bottom: 6, left: 6 };
    const { W, H, g } = setupFrame(this.svg, this._m);
    this.W = W; this.H = H; this.g = g;

    this.xS = d3.scaleLinear().domain([0, 100]).range([0, W]);
    this.yS = d3.scaleLinear().domain([0, 100]).range([H, 0]);
    this.rS = d3.scaleSqrt()
      .domain([0, d3.max(correlationData, (d) => d.deforest_count)])
      .range([2, 8]);

    const gridG = g.append("g");
    [0, 25, 50, 75, 100].forEach((v) => {
      gridG.append("line")
        .attr("x1", 0).attr("x2", W)
        .attr("y1", this.yS(v)).attr("y2", this.yS(v))
        .attr("stroke", GRID_COLOR).attr("stroke-width", 0.5);
      gridG.append("line")
        .attr("x1", this.xS(v)).attr("x2", this.xS(v))
        .attr("y1", 0).attr("y2", H)
        .attr("stroke", GRID_COLOR).attr("stroke-width", 0.5);
    });

    this.placeholder = makePlaceholder(g, W, H);
    this.hoverLabel = makeHoverLabel(this.svg);
  }

  update(definitiveByCountry) {
    const hasData = definitiveByCountry && definitiveByCountry.size > 0;
    this.placeholder.attr("visibility", hasData ? "hidden" : "visible");

    if (!hasData) {
      this.g.selectAll("circle.dot").transition().duration(T).ease(EASE)
        .attr("r", 0).attr("fill-opacity", 0);
      return;
    }

    const joined = this._data
      .filter((d) => definitiveByCountry.has(d.code))
      .map((d) => ({ ...d, def_pct: definitiveByCountry.get(d.code) }));

    const { xS, yS, rS, hoverLabel, W, _m } = this;
    const t = d3.transition().duration(T).ease(EASE);

    const dots = this.g.selectAll("circle.dot").data(joined, (d) => d.code);

    const entering = dots.enter().append("circle").attr("class", "dot")
      .attr("cx", (d) => xS(d.fossil_pct))
      .attr("cy", (d) => yS(d.def_pct))
      .attr("r", 0).attr("fill-opacity", 0)
      .attr("stroke", "#fff").attr("stroke-width", 0.6)
      .on("mouseover", function (d) {
        d3.select(this).transition().duration(120)
          .attr("stroke", "#1c2e1c").attr("stroke-width", 1.5).attr("fill-opacity", 1);
        const cx = _m.left + xS(d.fossil_pct);
        const cy = _m.top + yS(d.def_pct);
        const right = cx > W * 0.7;
        hoverLabel
          .attr("x", right ? cx - 4 : cx + 4).attr("y", cy - rS(d.deforest_count) - 3)
          .attr("text-anchor", right ? "end" : "start")
          .text(`${d.country} · ${d.fossil_pct.toFixed(0)}% fossil · ${d.def_pct.toFixed(0)}% def.`)
          .attr("visibility", "visible");
      })
      .on("mouseout", function () {
        d3.select(this).transition().duration(120)
          .attr("stroke", "#fff").attr("stroke-width", 0.6).attr("fill-opacity", 0.75);
        hoverLabel.attr("visibility", "hidden");
      });

    dots.exit().transition(t).attr("r", 0).attr("fill-opacity", 0).remove();

    entering.merge(dots)
      .attr("fill", (d) => FUEL_COLORS[normalizeFuel(d.dominant_fuel)])
      .transition(t)
      .attr("cx", (d) => xS(d.fossil_pct))
      .attr("cy", (d) => yS(d.def_pct))
      .attr("r", (d) => rS(d.deforest_count))
      .attr("fill-opacity", 0.75);
  }
}
