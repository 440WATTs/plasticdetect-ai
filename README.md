# PlasticDetect AI

### On-Device AI-Powered Plastic Waste Classification

PlasticDetect AI is a mobile-first Progressive Web App (PWA) that uses computer vision and on-device machine learning to classify plastic waste from camera or gallery images and provide material-specific recycling information.

The application uses a MobileNetV2-based image classification model with TensorFlow.js, allowing inference to run directly in the browser without sending images to a remote server.

## Key Highlights

- 9-class plastic material classification
- MobileNetV2 transfer learning
- TensorFlow.js browser-based inference
- On-device image processing
- Camera and gallery input
- Confidence-score visualization
- Classification history
- Offline model/runtime caching
- Progressive Web App (PWA) support
- Material-specific recycling guidance

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
