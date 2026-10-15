// Model + runtime download sizes.
//
// @imgly/background-removal fetches its ONNX weights and the onnxruntime-web
// WASM binary from a CDN on first use:
//   https://staticimgly.com/@imgly/background-removal-data/<version>/dist/resources.json
//
// The byte counts below are copied from that manifest (v1.7.0). They are only
// used to size the progress bar before the library reports real totals, and to
// label the quality picker, so drift after a library bump is harmless — see
// the Math.max() in useRemovalJob.

export const MODELS = [
  {
    id: 'isnet_quint8',
    label: 'Fast',
    bytes: 44_348_940,
    blurb: 'Quantised weights. Smallest download, softest edges.',
  },
  {
    id: 'isnet_fp16',
    label: 'Balanced',
    bytes: 88_152_708,
    blurb: 'Half precision. The best quality-per-megabyte trade-off.',
  },
  {
    id: 'isnet',
    label: 'Best',
    bytes: 176_149_806,
    blurb: 'Full precision. Cleanest hair and fine detail, big download.',
  },
]

// ort-wasm-simd-threaded[.jsep].wasm + its .mjs loader.
const RUNTIME_BYTES = {
  cpu: 11_819_815 + 25_539,
  gpu: 23_013_109 + 49_241,
}

export const DEFAULT_MODEL = 'isnet_fp16'

export function modelInfo(id) {
  return MODELS.find((model) => model.id === id) ?? MODELS[1]
}

export function expectedDownloadBytes(modelId, device) {
  return modelInfo(modelId).bytes + (RUNTIME_BYTES[device] ?? RUNTIME_BYTES.cpu)
}
