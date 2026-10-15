import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Cross-origin isolation unlocks SharedArrayBuffer, which is what lets
// onnxruntime-web run the model on more than one thread — a large speed-up on
// the WASM path. The model files are fetched from staticimgly.com with CORS, so
// require-corp does not block them. Mirrored for production in netlify.toml;
// remove both together if you ever need to embed a cross-origin resource that
// sends neither CORS nor CORP headers.
const crossOriginIsolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

/**
 * onnxruntime-web references its own `ort-wasm-simd-threaded[.jsep].wasm` through
 * `new URL(..., import.meta.url)`, so Vite copies all 24 MB of it into dist even
 * though it is never requested: @imgly/background-removal unconditionally
 * overwrites `ort.env.wasm.wasmPaths` with blob URLs for the copies it downloads
 * from its own CDN (see createOnnxSession in the package's dist/index.mjs).
 *
 * Dropping the emitted asset keeps the deploy small. If a future version of the
 * library ever stops overriding wasmPaths, ORT would request this file and get a
 * 404 — delete this plugin at that point.
 */
function dropUnusedOrtWasm() {
  return {
    name: 'drop-unused-ort-wasm',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const fileName of Object.keys(bundle)) {
        if (/ort-wasm.*\.wasm$/.test(fileName)) delete bundle[fileName]
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), dropUnusedOrtWasm()],
  server: { headers: crossOriginIsolation },
  preview: { headers: crossOriginIsolation },
  build: {
    // The worker chunk carries onnxruntime-web, which is multi-megabyte by
    // nature. It is code-split away from the shell, so it never blocks paint.
    chunkSizeWarningLimit: 1200,
  },
})
