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
