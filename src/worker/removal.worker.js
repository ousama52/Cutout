// Keeps image decoding and ONNX inference off the main thread. The library only
// proxies to a worker on the WebGPU path, so without this the tab would freeze
// solid for every image on the WASM path.
import { prepare, preloadModel, remove } from '../lib/removalCore.js'

const HANDLERS = {
  prepare: (message) => prepare(message.file),
  preload: (message, onProgress) => preloadModel(message.config, onProgress),
  remove: (message, onProgress) => remove(message.blob, message.config, onProgress),
}

self.addEventListener('message', async (event) => {
  const message = event.data
  const { id, type } = message
  const handler = HANDLERS[type]

  if (!handler) {
    self.postMessage({ id, type: 'error', kind: 'raw', message: `Unknown request: ${type}` })
    return
  }

  const onProgress = (key, current, total) => {
    self.postMessage({ id, type: 'progress', key, current, total })
  }

  try {
    const payload = await handler(message, onProgress)
    self.postMessage({ id, type: 'done', payload })
  } catch (error) {
    const isAppError = error?.name === 'AppError'
    self.postMessage({
      id,
      type: 'error',
      kind: isAppError ? 'app' : 'raw',
      message: String(error?.message ?? error),
      hint: isAppError ? error.hint : undefined,
    })
  }
})
