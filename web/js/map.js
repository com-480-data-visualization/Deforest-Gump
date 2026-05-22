import { FUEL_COLORS, normalizeFuel, getRadius } from "./constants.js";
import { showDetail, clearDetail } from "./ui.js";

/* getNearest(lat, lng) is an optional callback returning the nearest
   deforestation driver object (or null) — injected from app to avoid
   a circular dependency with overlays.js. */
export function buildMarkers(map, data, renderer, getNearest = null) {
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
    m.on("click", () =>
      showDetail(d, getNearest ? getNearest(d.lat, d.lng) : null),
    );
    m.on("mouseover", () =>
      showDetail(d, getNearest ? getNearest(d.lat, d.lng) : null),
    );
    m.on("mouseout", clearDetail);
    m.plantData = d;
    m.addTo(map);
    markers.push(m);
  });
  return markers;
}

export function applyFilters(markers, activeFuels, activeCountry) {
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
