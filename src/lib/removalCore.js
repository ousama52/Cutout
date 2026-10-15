// The actual work, free of any worker/main-thread assumptions. Runs inside
// removal.worker.js normally, and directly on the main thread if a module worker
// cannot be created.
import { preload, removeBackground } from '@imgly/background-removal'
import { measureBlob, prepareImage } from './image.js'

export async function prepare(file) {
  return prepareImage(file)
}

export async function preloadModel(config, onProgress) {
  await preload({ ...config, progress: onProgress })
}

export async function remove(blob, config, onProgress) {
  const output = await removeBackground(blob, { ...config, progress: onProgress })
  // Measured rather than assumed: proving the output matches the input pixel for
  // pixel is the whole point of the size guarantee shown in the UI.
  const { width, height } = await measureBlob(output)
  return { blob: output, width, height }
}
