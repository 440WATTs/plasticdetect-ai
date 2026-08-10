// PlasticDetect AI — Classifier (V3: Teachable Machine model)
//
// Loads a MobileNetV2 transfer-learning model trained via Google Teachable
// Machine — 9 classes (PET/HDPE/PC/PP/LDPE/ABS/PLA/PS/PVC) — converted to
// TensorFlow.js and run entirely on-device in the browser. No image ever
// leaves the device.
//
// Falls back to the old color/texture heuristic ONLY if the TensorFlow.js
// runtime or the model weights fail to load (e.g. first visit with no
// network, before the service worker has anything cached) — so the app
// still works end-to-end in that edge case, just less accurately.
//
// Public contract: classify(imageElement) resolves to
//   { classId, confidence, allScores, source }
// - classId / confidence: the top prediction, as before.
// - allScores: [{ classId, confidence }, ...] sorted descending — every
//   class the active classifier scored, for the confidence-breakdown UI.
// - source: "model" | "heuristic" — which path produced this result.
// Everything downstream depends only on this shape.

const Classifier = (() => {
  const MODEL_URL = "js/model/model.json";
  const CLASS_MAP_URL = "js/model/class_map.json";
  const INPUT_SIZE = 224;
  const LOW_CONFIDENCE_THRESHOLD = 0.6;

  let modelPromise = null;
  let classNames = null;

  function emitStatus(status, detail) {
    window.dispatchEvent(new CustomEvent("plasticdetect:model-status", { detail: { status, ...detail } }));
  }

  // Loads the model exactly once; every caller after the first awaits the
  // same in-flight (or already-resolved) promise instead of re-fetching.
  function loadModel() {
    if (!modelPromise) {
      emitStatus("loading");
      modelPromise = (async () => {
        const [model, names] = await Promise.all([
          tf.loadLayersModel(MODEL_URL),
          fetch(CLASS_MAP_URL).then((r) => r.json())
        ]);
        classNames = names; // ["PET","HDPE","PVC","LDPE","PP","PS"] — index-aligned with model output
        // Warm up with a dummy forward pass so the first real scan isn't
        // slower than the rest (first inference compiles WebGL shaders).
        tf.tidy(() => model.predict(tf.zeros([1, INPUT_SIZE, INPUT_SIZE, 3])));
        emitStatus("ready");
        return model;
      })().catch((err) => {
        emitStatus("error");
        modelPromise = null; // allow a retry later (e.g. network back online)
        throw err;
      });
    }
    return modelPromise;
  }

  // Start loading immediately in the background so the model is usually
  // already warm by the time the user taps the shutter.
  if (typeof tf !== "undefined") {
    loadModel().catch((err) => {
      console.warn("PlasticDetect: model preload failed, will fall back to heuristic if needed.", err);
    });
  } else {
    emitStatus("error");
  }

  // ---- Preprocessing: must exactly match Teachable Machine's pipeline ----
  // Teachable Machine's image models resize to 224x224 and normalize with
  // the same MobileNetV2 convention: x/127.5 - 1.0 -> [-1, 1]. JS side below
  // mirrors both steps:
  //   - tf.browser.fromPixels reads canvas/image data in R,G,B order (alpha
  //     dropped).
  //   - resizeBilinear to 224x224, then the /127.5 - 1.0 scaling.
  function preprocess(imageElement) {
    return tf.tidy(() => {
      let img = tf.browser.fromPixels(imageElement).toFloat(); // H x W x 3, RGB, 0-255
      img = tf.image.resizeBilinear(img, [INPUT_SIZE, INPUT_SIZE]);
      img = img.div(127.5).sub(1.0); // -> [-1, 1], matches mobilenet_v2.preprocess_input
      return img.expandDims(0); // -> [1, 224, 224, 3]
    });
  }

  function toAllScores(probs, names) {
    return Array.from(probs)
      .map((confidence, i) => ({ classId: names[i], confidence }))
      .sort((a, b) => b.confidence - a.confidence);
  }

  async function classifyWithModel(imageElement) {
    const model = await loadModel();
    const input = preprocess(imageElement);
    const predTensor = model.predict(input);
    const probs = await predTensor.data();
    input.dispose();
    predTensor.dispose();

    const allScores = toAllScores(probs, classNames);
    const top = allScores[0];

    return {
      classId: top.confidence < LOW_CONFIDENCE_THRESHOLD ? "UNKNOWN" : top.classId,
      confidence: top.confidence,
      allScores,
      source: "model"
    };
  }

  async function classify(imageElement) {
    if (typeof tf === "undefined") {
      return heuristicClassify(imageElement);
    }
    try {
      return await classifyWithModel(imageElement);
    } catch (err) {
      console.warn("PlasticDetect: real model unavailable, using fallback heuristic.", err);
      return heuristicClassify(imageElement);
    }
  }

  // ---- Fallback heuristic (only used if the real model can't load) ----
  function sampleImage(imageElement) {
    const canvas = document.createElement("canvas");
    const size = 64;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(imageElement, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    let r = 0, g = 0, b = 0, count = 0;
    const brightnessValues = [];
    for (let i = 0; i < data.length; i += 4) {
      r += data[i]; g += data[i + 1]; b += data[i + 2];
      brightnessValues.push((data[i] + data[i + 1] + data[i + 2]) / 3);
      count++;
    }
    r /= count; g /= count; b /= count;
    const mean = brightnessValues.reduce((a, v) => a + v, 0) / brightnessValues.length;
    const variance = brightnessValues.reduce((a, v) => a + (v - mean) ** 2, 0) / brightnessValues.length;
    const stdDev = Math.sqrt(variance);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;
    const brightness = mean / 255;
    return { saturation, brightness, texture: stdDev };
  }

  function scoreClasses({ saturation, brightness, texture }) {
    return {
      PET: (1 - saturation) * 0.6 + brightness * 0.3 + (texture < 25 ? 0.3 : 0),
      HDPE: (1 - saturation) * 0.5 + (brightness > 0.55 ? 0.4 : 0.1) + (texture < 35 ? 0.2 : 0),
      PVC: (1 - saturation) * 0.4 + (brightness > 0.4 && brightness < 0.75 ? 0.3 : 0.1),
      LDPE: texture > 30 ? 0.5 : 0.1 + saturation * 0.2,
      PP: saturation * 0.6 + (texture > 15 && texture < 45 ? 0.3 : 0.1),
      PS: (brightness > 0.7 ? 0.5 : 0.1) + (texture > 20 ? 0.3 : 0),
      ABS: saturation * 0.5 + (texture > 25 ? 0.3 : 0.1),
      PLA: (1 - saturation) * 0.4 + (texture < 20 ? 0.3 : 0.1),
      PC: (1 - saturation) * 0.5 + brightness * 0.35,
      MIXED: 0.25,
      UNKNOWN: 0.15
    };
  }

  function softmaxNormalize(scoreMap) {
    const entries = Object.entries(scoreMap);
    const maxRaw = Math.max(...entries.map(([, v]) => v));
    const exps = entries.map(([k, v]) => [k, Math.exp(v - maxRaw)]);
    const sum = exps.reduce((a, [, v]) => a + v, 0);
    return exps.map(([classId, v]) => ({ classId, confidence: v / sum }))
      .sort((a, b) => b.confidence - a.confidence);
  }

  function heuristicClassify(imageElement) {
    const features = sampleImage(imageElement);
    const scores = scoreClasses(features);
    const allScores = softmaxNormalize(scores);
    const top = allScores[0];
    // Keep some run-to-run variation like the original heuristic had, without
    // breaking the "sorted descending" invariant the UI relies on.
    const jitter = Math.random() * 0.08 - 0.04;
    const confidence = Math.min(0.99, Math.max(0.05, top.confidence + jitter));

    return {
      classId: confidence < LOW_CONFIDENCE_THRESHOLD ? "UNKNOWN" : top.classId,
      confidence,
      allScores,
      source: "heuristic"
    };
  }

  return { classify, loadModel };
})();
