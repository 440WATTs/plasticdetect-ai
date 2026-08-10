// PlasticDetect AI — Plastic knowledge base
// Swap-in point for a real trained model: classifier.js:classify() currently
// uses a heuristic; replace its internals with a TF.js / ONNX Runtime Web
// inference call and keep this data.js contract (id -> info) unchanged.

const PLASTIC_DB = {
  PET: {
    name: "PET",
    fullName: "Polyethylene Terephthalate",
    symbol: "1",
    example: "PET Bottle",
    recyclable: true,
    category: "Thermoplastic",
    uses: ["Water bottles", "Soft drink bottles", "Food packaging"],
    disposal: ["Place in recycling bin", "Rinse before recycling", "Remove cap and label if required locally"],
    decomposition: "450 years",
    fact: "PET can be spun into polyester fibers and become clothing after recycling.",
    color: "#2DD4BF"
  },
  HDPE: {
    name: "HDPE",
    fullName: "High-Density Polyethylene",
    symbol: "2",
    example: "HDPE Bottle",
    recyclable: true,
    category: "Thermoplastic",
    uses: ["Milk jugs", "Shampoo bottles", "Detergent containers"],
    disposal: ["Place in recycling bin", "Rinse residue out", "Cap can usually stay on"],
    decomposition: "400+ years",
    fact: "HDPE is one of the most widely recycled plastics and often becomes plastic lumber or piping.",
    color: "#60A5FA"
  },
  PVC: {
    name: "PVC",
    fullName: "Polyvinyl Chloride",
    symbol: "3",
    example: "PVC Pipe",
    recyclable: false,
    category: "Thermoplastic",
    uses: ["Pipes", "Window frames", "Cable insulation"],
    disposal: ["Not curbside recyclable in most areas", "Take to a specialized facility", "Never burn — releases toxic fumes"],
    decomposition: "Hundreds of years",
    fact: "PVC releases chlorine-based compounds when incinerated, so specialized disposal matters.",
    color: "#F59E0B"
  },
  LDPE: {
    name: "LDPE",
    fullName: "Low-Density Polyethylene",
    symbol: "4",
    example: "LDPE Plastic Bag",
    recyclable: true,
    category: "Thermoplastic (film)",
    uses: ["Plastic bags", "Squeeze bottles", "Shrink wrap"],
    disposal: ["Drop off at a store film-recycling bin", "Do not place in curbside bins", "Keep clean and dry"],
    decomposition: "10-20 years",
    fact: "LDPE film jams sorting machinery, which is why most curbside programs reject it.",
    color: "#A3E635"
  },
  PP: {
    name: "PP",
    fullName: "Polypropylene",
    symbol: "5",
    example: "PP Food Container",
    recyclable: true,
    category: "Thermoplastic",
    uses: ["Yogurt tubs", "Bottle caps", "Microwave containers"],
    disposal: ["Place in recycling bin where accepted", "Rinse food residue", "Check local guidelines — acceptance varies"],
    decomposition: "20-30 years",
    fact: "PP has a high melting point, which is why it's the go-to plastic for microwave-safe containers.",
    color: "#818CF8"
  },
  PS: {
    name: "PS",
    fullName: "Polystyrene",
    symbol: "6",
    example: "PS Foam Cup",
    recyclable: false,
    category: "Thermoplastic (foam or rigid)",
    uses: ["Foam cups", "Packing peanuts", "Disposable cutlery"],
    disposal: ["Rarely curbside recyclable", "Look for a #6 drop-off program", "Reduce single-use foam where possible"],
    decomposition: "500+ years",
    fact: "Foamed polystyrene is roughly 95% air, which is part of why it's so hard to recycle economically.",
    color: "#FB7185"
  },
  ABS: {
    name: "ABS",
    fullName: "Acrylonitrile Butadiene Styrene",
    symbol: "7",
    example: "ABS Plastic Toy",
    recyclable: false,
    category: "Engineering thermoplastic",
    resinFamily: "7",
    uses: ["Toys (e.g. LEGO)", "Electronics housings", "Automotive trim"],
    disposal: ["Check for specialty e-waste or #7 programs", "Not standard curbside recyclable", "Reuse or repurpose where possible"],
    decomposition: "Does not readily biodegrade",
    fact: "ABS is prized for impact resistance, which is exactly why LEGO bricks survive being stepped on.",
    color: "#A78BFA"
  },
  PLA: {
    name: "PLA",
    fullName: "Polylactic Acid",
    symbol: "7",
    example: "PLA Bioplastic",
    recyclable: false,
    category: "Bioplastic (compostable)",
    resinFamily: "7",
    uses: ["Compostable cutlery", "3D printing filament", "Cold cups"],
    disposal: ["Send to industrial composting, not curbside recycling", "Will not break down in a landfill like compost", "Never mix with regular plastic recycling"],
    decomposition: "3-6 months (industrial compost only)",
    fact: "PLA is made from corn starch or sugarcane, but it still needs industrial heat and moisture to compost.",
    color: "#A78BFA"
  },
  PC: {
    name: "PC",
    fullName: "Polycarbonate",
    symbol: "7",
    example: "PC Water Bottle",
    recyclable: false,
    category: "Engineering thermoplastic",
    resinFamily: "7",
    uses: ["Reusable water bottles", "Eyeglass lenses", "CDs/DVDs"],
    disposal: ["Check for #7 specialty recycling", "Not standard curbside recyclable", "Prefer BPA-free reusable alternatives"],
    decomposition: "Does not readily biodegrade",
    fact: "Older polycarbonate bottles were a major source of BPA exposure, which pushed the shift to Tritan and PP bottles.",
    color: "#A78BFA"
  },
  MIXED: {
    name: "Mixed Plastic",
    fullName: "Mixed / Multi-layer Plastic",
    symbol: "7",
    example: "Mixed Plastic",
    recyclable: false,
    category: "Composite",
    uses: ["Chip bags", "Laminated pouches", "Multi-material packaging"],
    disposal: ["Generally not recyclable curbside", "Check for store take-back programs", "Reduce reliance where possible"],
    decomposition: "Varies, often centuries",
    fact: "Multi-layer packaging is hard to recycle because separating the bonded material layers isn't economical.",
    color: "#94A3B8"
  },
  UNKNOWN: {
    name: "Unknown Plastic",
    fullName: "Unidentified",
    symbol: "?",
    example: "Unknown Plastic",
    recyclable: null,
    category: "Unclassified",
    uses: [],
    disposal: ["Check for a resin code stamped on the item", "When unsure, treat as general waste", "Try rescanning in better lighting"],
    decomposition: "Unknown",
    fact: "Resin identification codes (the numbers 1-7 in the recycling triangle) were introduced in 1988 to help sorters.",
    color: "#9CA3AF"
  }
};

// Used to render the "What do plastic numbers mean?" guide — the official
// 1-7 resin code family. MIXED isn't part of the numbered resin code system
// so it's intentionally excluded from this list (it still exists in
// PLASTIC_DB for the classifier / result screen).
const PLASTIC_ORDER = ["PET", "HDPE", "PVC", "LDPE", "PP", "PS", "ABS", "PLA", "PC", "UNKNOWN"];

const ECO_TIPS = [
  "Rinsing containers before recycling prevents contamination of the whole batch.",
  "A resin code number doesn't guarantee curbside acceptance — rules vary by city.",
  "Reusing a PET bottle a few times is fine, but check for scratches that harbor bacteria.",
  "Bottle caps are often a different plastic than the bottle — leave them on unless told otherwise.",
  "Black plastic is notoriously hard for sorting machines to detect optically.",
  "Compostable PLA needs an industrial facility — it won't break down in a home compost bin.",
  "Flattening bottles saves space but check local rules — some facilities prefer them uncrushed."
];
