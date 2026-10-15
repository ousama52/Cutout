// Promise-based front end for removal.worker.js, with a main-thread fallback if
// module workers are unavailable. The worker is created lazily and then reused,
// so the ONNX session it holds survives across the whole batch.
import { AppError } from './image.js'

class WorkerUnavailable extends Error {}

let worker = null
let workerBroken = false
let directModule = null
let sequence = 0
const pending = new Map()

function settleAllPending(error) {
  for (const entry of pending.values()) entry.reject(error)
  pending.clear()
}

function handleMessage({ data }) {
  const entry = pending.get(data.id)
  if (!entry) return

  if (data.type === 'progress') {
    entry.onProgress?.(data.key, data.current, data.total)
    return
  }

  pending.delete(data.id)
  if (data.type === 'done') {
    entry.resolve(data.payload)
    return
  }
  // Raw errors keep their original text so the UI can classify them (network,
  // out of memory, unsupported format); AppErrors already carry a hint.
  entry.reject(data.kind === 'app' ? new AppError(data.message, data.hint) : new Error(data.message))
}

function ensureWorker() {
  if (workerBroken) throw new WorkerUnavailable()
  if (worker) return worker

  try {
    worker = new Worker(new URL('../worker/removal.worker.js', import.meta.url), {
      type: 'module',
      name: 'background-removal',
    })
  } catch {
    workerBroken = true
    throw new WorkerUnavailable()
  }

  worker.addEventListener('message', handleMessage)
  worker.addEventListener('error', () => {
    workerBroken = true
    worker?.terminate()
    worker = null
    settleAllPending(new WorkerUnavailable())
  })
  return worker
}

function requestFromWorker(type, message, onProgress) {
  const active = ensureWorker()
  const id = (sequence += 1)
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress })
    try {
      active.postMessage({ id, type, ...message })
    } catch (error) {
      pending.delete(id)
      reject(error)
    }
  })
}

async function runDirect(type, message, onProgress) {
  if (!directModule) directModule = await import('./removalCore.js')
  if (type === 'prepare') return directModule.prepare(message.file)
  if (type === 'preload') return directModule.preloadModel(message.config, onProgress)
  return directModule.remove(message.blob, message.config, onProgress)
}

async function run(type, message, onProgress) {
  try {
    return await requestFromWorker(type, message, onProgress)
  } catch (error) {
    if (!(error instanceof WorkerUnavailable)) throw error
    return runDirect(type, message, onProgress)
  }
}

/** @returns {Promise<{blob: Blob, width: number, height: number, transcoded: boolean}>} */
export function prepareFile(file) {
  return run('prepare', { file }, null)
}

/** Downloads the weights and builds the inference session. */
export function preloadModel(config, onProgress) {
  return run('preload', { config }, onProgress)
}

/** @returns {Promise<{blob: Blob, width: number, height: number}>} */
export function removeImageBackground(blob, config, onProgress) {
  return run('remove', { blob, config }, onProgress)
}
