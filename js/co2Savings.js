// PlasticDetect AI — CO2 savings reference data
//
// kg CO2e saved per kg of plastic recycled instead of made from virgin
// material. PET/HDPE/PP figures are measured (Franklin Associates / APR
// life-cycle-assessment studies). The remaining resin types don't have a
// directly published figure from that same study, so they're extrapolated
// at a 68% reduction ratio relative to comparable measured plastics and
// flagged "estimated" — the UI must never present them with the same
// confidence as the measured PET/HDPE/PP figures.
//
// Loaded as a plain global (matching data.js / i18n.js's script-tag
// convention) — no bundler/module system in this project.
const CO2_SAVED_PER_KG = {
  PET:  { saved: 1.32, quality: "measured" },
  HDPE: { saved: 1.33, quality: "measured" },
  PP:   { saved: 1.31, quality: "measured" },
  PVC:  { saved: 1.94, quality: "estimated" },
  LDPE: { saved: 1.46, quality: "estimated" },
  PS:   { saved: 2.28, quality: "estimated" },
  PC:   { saved: 5.28, quality: "estimated" },
  ABS:  { saved: 2.80, quality: "estimated" },
  PLA:  { saved: 2.04, quality: "estimated" }
};

// weightKg defaults to 0.02 (20g) — a typical small single-use plastic
// item — since the app doesn't currently capture actual item weight from
// a photo. Returns null for anything not in the table (e.g. "MIXED",
// "UNKNOWN") so callers can hide the UI gracefully instead of showing a
// zero or placeholder value.
function getCO2Saved(plasticType, weightKg = 0.02) {
  const entry = CO2_SAVED_PER_KG[plasticType];
  if (!entry) return null;
  return {
    saved: Math.round(entry.saved * weightKg * 1000) / 1000,
    quality: entry.quality
  };
}

// Estimated scrap value (informal-sector buyback rate), in ₹ per kg of
// clean, sorted material. These are broad market ranges, not a quote or
// offer from this app — actual rates vary by city, dealer, and material
// condition, and change day to day. "typical" means the range reflects
// commonly-reported household-scrap-dealer rates; "estimated" means the
// range is a rougher approximation for less commonly traded resins.
// null means this resin isn't typically bought by household-level scrap
// dealers at all (PC/ABS = e-waste/industrial channel only, PLA = not
// mechanically recycled) — callers should show an explanatory message
// instead of hiding the row.
const SCRAP_VALUE_PER_KG = {
  PET:  { min: 15, max: 25, quality: "typical" },
  HDPE: { min: 20, max: 35, quality: "typical" },
  PP:   { min: 15, max: 25, quality: "typical" },
  LDPE: { min: 10, max: 20, quality: "typical" },
  PVC:  { min: 8,  max: 15, quality: "estimated" },
  PS:   { min: 2,  max: 8,  quality: "estimated" },
  PC:   null,   // rarely accepted by household-level scrap dealers
  ABS:  null,   // industrial/e-waste channel only, not household
  PLA:  null    // not mechanically recycled, no scrap value
};

// Returns { min, max, quality } or null (not in the table, or explicitly
// unavailable at household-scrap-dealer level).
function getScrapValue(plasticType) {
  if (!(plasticType in SCRAP_VALUE_PER_KG)) return null;
  return SCRAP_VALUE_PER_KG[plasticType];
}
