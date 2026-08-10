# PlasticDetect AI (V1)

A mobile-first PWA that identifies plastic waste from a photo using a real
trained MobileNetV2 model running entirely on-device via TensorFlow.js —
no photo ever leaves the phone.

## Run it
```bash
cd plasticdetect-ai
python3 -m http.server 8000
```
Open `http://localhost:8000` (camera needs a secure context — localhost is
fine; for phone testing, deploy over HTTPS, e.g. GitHub Pages or Netlify).

## What's real
- **Classifier**: MobileNetV2 transfer learning, trained via Google Teachable
  Machine (9 classes: PET/HDPE/PC/PP/LDPE/ABS/PLA/PS/PVC). Converted to
  TensorFlow.js, runs client-side.
- Loads once, cached in memory for the session; service worker caches the
  model + tfjs runtime for offline use after first visit.
- Confidence breakdown shown for every class, not just the top prediction.
- Heuristic fallback (color/brightness/texture) only kicks in if the model
  or TF.js fails to load — you'll see a banner if that happens.
- Everything else (camera, gallery, history, dark mode, PWA) — fully working.

## Not yet covered
Mixed / multi-layer plastic — no public labeled dataset exists for this
class; the app's guide/info screens still describe it, but the live
classifier can't predict it (falls into "Unknown" at low confidence instead).

## Folder structure
```
plasticdetect-ai/
├── index.html
├── manifest.json / service-worker.js
├── css/styles.css
├── js/
│   ├── data.js          # plastic knowledge base
│   ├── classifier.js    # real model + heuristic fallback
│   ├── model/           # tfjs model.json + weights.bin + class_map.json
│   └── app.js
```
