export const FUEL_COLORS = {
  Coal: "#2c2c2c",
  Gas: "#e67e22",
  Oil: "#7a3810",
  Hydro: "#1565a0",
  Solar: "#f1c40f",
  Wind: "#27ae60",
  Nuclear: "#8e44ad",
  Other: "#95a5a6",
};

// What falls under "Other" after named fuels are extracted
export const OTHER_FUEL_EXAMPLES = "Biomass, Waste, Geothermal, Storage, Cogeneration, Wave & Tidal";

export const FUELS = Object.keys(FUEL_COLORS);

export const DEFOREST_COLORS = {
  1: "#b5179e",
  2: "#f77f00",
  3: "#4cc9f0",
  4: "#ffba08",
  5: "#3a86ff",
};

export const DEFOREST_CAUSES = {
  1: "Commodity-driven deforestation",
  2: "Shifting agriculture",
  3: "Forestry",
  4: "Wildfire",
  5: "Urbanization",
};

// Raw fuel strings considered fossil (Petcoke is normalized to "Other" but still fossil).
export const FOSSIL_FUELS = new Set(["Coal", "Gas", "Oil", "Petcoke"]);

export const normalizeFuel = (raw) => (FUELS.includes(raw) ? raw : "Other");

export const isFossil = (raw) => FOSSIL_FUELS.has(raw);

export const getRadius = (cap) =>
  !cap || cap <= 0 ? 3 : Math.max(Math.log(cap + 1), 2);

export const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
