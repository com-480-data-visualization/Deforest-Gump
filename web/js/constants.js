export const FUEL_COLORS = {
  Coal: "#2c2c2c",
  Gas: "#e67e22",
  Hydro: "#2980b9",
  Solar: "#f1c40f",
  Wind: "#27ae60",
  Nuclear: "#8e44ad",
  Other: "#95a5a6",
};

export const FUELS = Object.keys(FUEL_COLORS);

export const DEFOREST_COLORS = {
  1: "#b5179e", // commodity-driven
  2: "#f77f00", // shifting agriculture
  3: "#4cc9f0", // forestry
  4: "#ffba08", // wildfire
  5: "#3a86ff", // urbanization
};

export const normalizeFuel = (raw) => (FUELS.includes(raw) ? raw : "Other");

export const getRadius = (cap) =>
  !cap || cap <= 0 ? 3 : Math.max(Math.log(cap + 1), 2);

export const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
