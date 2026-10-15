# Cutout — background remover

A React app that strips the background out of images **entirely in the browser**. No backend, no API key, no upload: the segmentation model is downloaded once and runs on WASM (or WebGPU) inside the tab.

- **Batch** — queue up to 24 images at a time; drag and drop, file picker, or <kbd>Ctrl</kbd>+<kbd>V</kbd> paste.
- **Original resolution preserved** — the mask is rescaled back up to the source dimensions, so a 4000 × 3000 input gives a 4000 × 3000 transparent PNG.
- **Before/after slider** with a transparency checkerboard and preview backdrops.
- **Download** each PNG on its own, or the whole batch as a zip.
- **Quality picker** — three model sizes, with the real download cost shown up front.

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/
npm run preview  # serve dist/ with the production headers
npm run lint
```

## How it works

[`@imgly/background-removal`](https://github.com/imgly/background-removal-js) runs the IS-Net salient-object model through ONNX Runtime Web. On the first run it fetches the weights and the WASM runtime from `staticimgly.com`; after that the browser cache serves them.

| Piece | What it does |
| --- | --- |
| [src/worker/removal.worker.js](src/worker/removal.worker.js) | Runs decode + inference off the main thread |
| [src/lib/removalClient.js](src/lib/removalClient.js) | Promise API over the worker, with a main-thread fallback |
| [src/lib/removalCore.js](src/lib/removalCore.js) | The actual calls into the library, shared by both paths |
| [src/hooks/useBatchRemoval.js](src/hooks/useBatchRemoval.js) | The queue: one shared model session, one image in flight |
| [src/lib/zip.js](src/lib/zip.js) | Dependency-free store-only zip writer for "download all" |
| [src/lib/models.js](src/lib/models.js) | Model sizes, mirrored from the CDN manifest |

A few decisions worth knowing about:

- **Everything heavy runs in a worker.** The library only proxies to a worker on the WebGPU path, so without [removal.worker.js](src/worker/removal.worker.js) the tab would freeze solid for every image on the WASM path — fatal for a batch.
- **The queue is serial on purpose.** Inference saturates the CPU or GPU; overlapping images would only make each one slower.
- **Non-JPEG/PNG/WebP inputs are transcoded first.** The library's decoder rejects anything else, so AVIF, GIF, BMP and HEIC are re-encoded to PNG through the browser's own decoder before they reach the model ([src/lib/image.js](src/lib/image.js)).
- **WebGPU is opportunistic.** It is tried first when enabled and falls back to WASM on adapter or driver failure, for the rest of the batch.
- **Cross-origin isolation is on.** `Cross-Origin-Opener-Policy: same-origin` plus `Cross-Origin-Embedder-Policy: require-corp` unlock `SharedArrayBuffer`, which is what lets ONNX Runtime use more than one thread. Set in [vite.config.js](vite.config.js) for dev and [netlify.toml](netlify.toml) for production — keep the two in step. The model files are fetched with CORS, so `require-corp` does not block them.

### Model sizes

| Setting | Weights | Notes |
| --- | --- | --- |
| Fast | 42 MB | Quantised (`isnet_quint8`); softest edges |
| Balanced *(default)* | 84 MB | Half precision (`isnet_fp16`) |
| Best | 168 MB | Full precision (`isnet`); cleanest hair and fine detail |

Add ~11 MB for the WASM runtime (~22 MB on the WebGPU path). "Download model now" in the options row pre-warms the cache before the first image.

## Deploying to Netlify

[netlify.toml](netlify.toml) already carries the build command, publish directory, security headers and the SPA redirect.

```bash
npm install -g netlify-cli
netlify login
netlify deploy --prod --build
```

## Notes and limits

- **First run is slow** — the weights have to arrive before anything happens. The banner shows real byte progress; it is a one-time cost per browser.
- **Very large images are slow**, and inference peaks at roughly 8 bytes of memory per pixel. Anything over 12 MP gets a warning, and over 60 MP is rejected rather than crashing the tab.
- **Stop finishes the current image.** The library exposes no abort, so stopping discards the in-flight result instead of interrupting it.
- **Bandwidth** — the weights come from img.ly's CDN, not from your Netlify site, so a busy deploy costs you no extra bandwidth for them.
- The build drops the ONNX Runtime `.wasm` that Vite would otherwise copy into `dist/`: the library always overrides `wasmPaths` with its own CDN copies, so the bundled one is 24 MB of dead weight. See the comment in [vite.config.js](vite.config.js).
