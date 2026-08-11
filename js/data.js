// PlasticDetect AI — Plastic knowledge base
// Swap-in point for a real trained model: classifier.js:classify() currently
// uses a heuristic; replace its internals with a TF.js / ONNX Runtime Web
// inference call and keep this data.js contract (id -> info) unchanged.
//
// Waste-guidance fields (recyclabilityLevel / wasteStreamKey / bestActionKey /
// appMessage / doNot / whatHappensNext / eWasteNote) are deliberately kept
// as plain backend data here — not baked into the AI model — so disposal
// guidance can be corrected or expanded later without retraining anything.
// recyclabilityLevel: "recyclable" | "limited" | "difficult"
// wasteStreamKey / bestActionKey: i18n keys resolved by app.js via I18N.t()

const PLASTIC_DB = {
  PET: {
    name: "PET",
    fullName: "Polyethylene Terephthalate",
    symbol: "1",
    example: "PET Bottle",
    recyclable: true,
    category: "Thermoplastic",
    uses: ["Water bottles", "Soft drink bottles", "Food packaging"],
    disposal: ["Empty the container", "Rinse if necessary", "Let it dry", "Separate cap if required locally"],
    decomposition: "450 years",
    fact: "PET can be spun into polyester fibers and become clothing after recycling.",
    color: "#2DD4BF",
    recyclabilityLevel: "recyclable",
    wasteStreamKey: "waste_dry",
    bestActionKey: "best_action_recycle",
    appMessage: "You can usually put this item in your household recycling bin for collection. It will be sorted and processed at a local recycling facility.",
    doNot: "Don't mix with wet/food waste",
    whatHappensNext: "Sent for material recovery and recycling"
  },
  HDPE: {
    name: "HDPE",
    fullName: "High-Density Polyethylene",
    symbol: "2",
    example: "HDPE Bottle",
    recyclable: true,
    category: "Thermoplastic",
    uses: ["Milk jugs", "Shampoo bottles", "Detergent containers"],
    disposal: ["Empty the container", "Rinse residue out", "Let it dry", "Cap can usually stay on"],
    decomposition: "400+ years",
    fact: "HDPE is one of the most widely recycled plastics and often becomes plastic lumber or piping.",
    color: "#60A5FA",
    recyclabilityLevel: "recyclable",
    wasteStreamKey: "waste_dry",
    bestActionKey: "best_action_recycle",
    appMessage: "You can usually put this item in your household recycling bin for collection. It will be sorted and processed at a local recycling facility.",
    doNot: "Don't mix with wet/food waste",
    whatHappensNext: "Sent for material recovery and recycling"
  },
  PVC: {
    name: "PVC",
    fullName: "Polyvinyl Chloride",
    symbol: "3",
    example: "PVC Pipe",
    recyclable: false,
    category: "Thermoplastic",
    uses: ["Pipes", "Window frames", "Cable insulation"],
    disposal: ["Keep dry and separate", "Do not burn — releases toxic fumes", "Take to a specialized/authorized facility"],
    decomposition: "Hundreds of years",
    fact: "PVC releases chlorine-based compounds when incinerated, so specialized disposal matters.",
    color: "#F59E0B",
    recyclabilityLevel: "limited",
    wasteStreamKey: "waste_dry_auth",
    bestActionKey: "best_action_special",
    appMessage: "Recycling availability is limited. Keep it out of wet waste and do not burn it. Prefer an authorized plastic recycler or collection center.",
    doNot: "Don't burn it, and don't mix with wet waste",
    whatHappensNext: "Processed only by specialized recyclers that accept PVC"
  },
  LDPE: {
    name: "LDPE",
    fullName: "Low-Density Polyethylene",
    symbol: "4",
    example: "LDPE Plastic Bag",
    recyclable: true,
    category: "Thermoplastic (film)",
    uses: ["Plastic bags", "Squeeze bottles", "Shrink wrap"],
    disposal: ["Keep clean and dry", "Flatten if possible", "Collect separately from rigid plastics if your facility asks for it"],
    decomposition: "10-20 years",
    fact: "LDPE film jams sorting machinery, which is why most curbside programs reject it.",
    color: "#A3E635",
    recyclabilityLevel: "limited",
    wasteStreamKey: "waste_dry",
    bestActionKey: "best_action_recycle",
    appMessage: "Recyclable through suitable collection programs. Keep clean and dry — flexible plastic film may need a separate collection channel.",
    doNot: "Don't assume every curbside program accepts plastic film",
    whatHappensNext: "Sent for recycling where a film-collection channel exists"
  },
  PP: {
    name: "PP",
    fullName: "Polypropylene",
    symbol: "5",
    example: "PP Food Container",
    recyclable: true,
    category: "Thermoplastic",
    uses: ["Yogurt tubs", "Bottle caps", "Microwave containers"],
    disposal: ["Empty the container", "Rinse food residue", "Let it dry"],
    decomposition: "20-30 years",
    fact: "PP has a high melting point, which is why it's the go-to plastic for microwave-safe containers.",
    color: "#818CF8",
    recyclabilityLevel: "recyclable",
    wasteStreamKey: "waste_dry",
    bestActionKey: "best_action_recycle",
    appMessage: "You can usually put this item in your household recycling bin for collection. It will be sorted and processed at a local recycling facility.",
    doNot: "Don't mix with wet/food waste",
    whatHappensNext: "Sent for material recovery and recycling"
  },
  PS: {
    name: "PS",
    fullName: "Polystyrene",
    symbol: "6",
    example: "PS Foam Cup",
    recyclable: false,
    category: "Thermoplastic (foam or rigid)",
    uses: ["Foam cups", "Packing peanuts", "Disposable cutlery"],
    disposal: ["Keep clean and dry", "Keep separate from other recyclables", "Avoid burning"],
    decomposition: "500+ years",
    fact: "Foamed polystyrene is roughly 95% air, which is part of why it's so hard to recycle economically.",
    color: "#FB7185",
    recyclabilityLevel: "difficult",
    wasteStreamKey: "waste_dry_reject",
    bestActionKey: "best_action_special",
    appMessage: "Recycling is often limited. Keep it separate from wet waste. If your local recycler doesn't accept it, dispose of it as reject waste per local rules.",
    doNot: "Don't assume a resin symbol means your municipality accepts it",
    whatHappensNext: "Recycled only where a specialty collector exists — otherwise treated as reject waste"
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
    disposal: ["Keep dry and clean", "Check for a specialty e-waste or #7 program", "Reuse or repurpose where possible"],
    decomposition: "Does not readily biodegrade",
    fact: "ABS is prized for impact resistance, which is exactly why LEGO bricks survive being stepped on.",
    color: "#A78BFA",
    recyclabilityLevel: "limited",
    wasteStreamKey: "waste_dry",
    bestActionKey: "best_action_special",
    appMessage: "Specialized recycling recommended. Keep this in dry waste and look for an appropriate plastic or e-waste collection channel.",
    doNot: "Don't treat it as ordinary curbside plastic if it's part of an electronic device",
    whatHappensNext: "Processed by specialized recyclers — or as e-waste if it's an electronic component",
    eWasteNote: "If this item is part of an electronic device (keyboard, charger housing, appliance casing, etc.), treat it as e-waste instead of ordinary plastic — take it to an authorized e-waste collection point."
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
    disposal: ["Send to industrial composting, not curbside recycling", "Will not break down like compost in a landfill", "Never mix with regular plastic recycling"],
    decomposition: "3-6 months (industrial compost only)",
    fact: "PLA is made from corn starch or sugarcane, but it still needs industrial heat and moisture to compost.",
    color: "#A78BFA",
    recyclabilityLevel: "limited",
    wasteStreamKey: "waste_dry_compost",
    bestActionKey: "best_action_compost",
    appMessage: "Do not put this with conventional plastic recycling. PLA needs an industrial composting or dedicated collection system.",
    doNot: "Don't put it in wet/organic waste at home — most home compost can't break it down either",
    whatHappensNext: "Processed only by industrial composting facilities that accept PLA"
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
    disposal: ["Empty the item completely", "Clean or rinse if it contained food or liquid", "Keep it dry"],
    decomposition: "Does not readily biodegrade",
    fact: "Older polycarbonate bottles were a major source of BPA exposure, which pushed the shift to Tritan and PP bottles.",
    color: "#A78BFA",
    recyclabilityLevel: "limited",
    wasteStreamKey: "waste_dry_auth",
    bestActionKey: "best_action_special",
    appMessage: "Specialized recycling recommended. Keep clean and dry. Do not place in wet waste. Send it to a plastic recycler or collection center that accepts polycarbonate.",
    doNot: "Don't mix with wet/organic waste",
    whatHappensNext: "Processed only by specialized recyclers that accept polycarbonate — or as e-waste if it's an electronic component",
    eWasteNote: "If this item is part of an electronic appliance, treat it as e-waste instead of ordinary plastic — take it to an authorized e-waste collection or recycling facility."
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

// ---- Non-plastic materials ----
// Not part of the AI model's classes (the model only recognizes plastics) —
// this is static reference content for the "Not Plastic?" home tab, and for
// the "not sure this is plastic?" link shown at the end of every result.
const NON_PLASTIC_DB = {
  GLASS: {
    name: "Glass",
    recyclabilityLevel: "recyclable",
    wasteStreamKey: "waste_dry",
    note: "This item is not plastic. Keep it separate from plastic and wet waste and send it through a glass-recycling/collection stream where available.",
    color: "#5EEAD4"
  },
  CARDBOARD: {
    name: "Cardboard",
    recyclabilityLevel: "recyclable",
    wasteStreamKey: "waste_dry",
    note: "Flatten and keep dry. Put it with recyclable dry waste.",
    color: "#D6A25C"
  },
  METAL: {
    name: "Metal",
    recyclabilityLevel: "recyclable",
    wasteStreamKey: "waste_dry",
    note: "Empty and rinse if necessary. Keep with recyclable dry waste.",
    color: "#94A3B8"
  },
  ORGANIC: {
    name: "Organic / Food Waste",
    recyclabilityLevel: "compostable",
    wasteStreamKey: "waste_wet",
    note: "Put in wet/organic waste.",
    color: "#86EFAC"
  }
};
const NON_PLASTIC_ORDER = ["GLASS", "CARDBOARD", "METAL", "ORGANIC"];

const ECO_TIPS = [
  "Rinsing containers before recycling prevents contamination of the whole batch.",
  "A resin code number doesn't guarantee curbside acceptance — rules vary by city.",
  "Reusing a PET bottle a few times is fine, but check for scratches that harbor bacteria.",
  "Bottle caps are often a different plastic than the bottle — leave them on unless told otherwise.",
  "Black plastic is notoriously hard for sorting machines to detect optically.",
  "Compostable PLA needs an industrial facility — it won't break down in a home compost bin.",
  "Flattening bottles saves space but check local rules — some facilities prefer them uncrushed."
];
