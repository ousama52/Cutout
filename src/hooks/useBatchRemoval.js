import { useCallback, useEffect, useRef, useState } from 'react'
import { AppError, looksLikeImage, resultFileName } from '../lib/image.js'
import { preloadModel, prepareFile, removeImageBackground } from '../lib/removalClient.js'
import { expectedDownloadBytes } from '../lib/models.js'
import { isPending } from '../lib/status.js'

export const MAX_BATCH = 24

/** Thrown internally when a job is abandoned; never surfaced to the user. */
class Cancelled extends Error {}

const IDLE_MODEL = { phase: 'idle', loaded: 0, total: 0, ratio: 0, error: null }

let nextId = 0

function describeError(error) {
  if (error instanceof AppError) {
    return { message: error.message, hint: error.hint }
  }
  const raw = String(error?.message ?? error)
  if (/Resource metadata not found|publicPath|Failed to fetch|NetworkError|network error|ERR_/i.test(raw)) {
    return {
      message: 'The model files could not be downloaded.',
      hint: 'They come from a CDN the first time you use the app. Check your connection and try again.',
    }
  }
  if (/out of memory|allocation failed|Array buffer allocation|RangeError/i.test(raw)) {
    return {
      message: 'The browser ran out of memory for this image.',
      hint: 'Try a smaller image, or switch the quality setting to Fast.',
    }
  }
  if (/Invalid format/i.test(raw)) {
    return {
      message: 'This image format is not supported.',
      hint: 'PNG, JPEG and WebP are always safe.',
    }
  }
  return { message: 'Background removal failed.', hint: raw.slice(0, 240) }
}

function revokeItemUrls(item) {
  if (item.source?.url) URL.revokeObjectURL(item.source.url)
  if (item.result?.url) URL.revokeObjectURL(item.result.url)
}

/**
 * Owns the whole batch lifecycle: a queue of picked files, one shared model
 * session, one image in flight at a time.
 *
 * Inference saturates the CPU (or the GPU), so overlapping images would only
 * make every one of them slower — the queue is deliberately serial.
 */
export function useBatchRemoval(settings) {
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const [items, setItems] = useState([])
  const [model, setModel] = useState(IDLE_MODEL)
  const [running, setRunning] = useState(false)
  const [notice, setNotice] = useState(null)

  // The queue and the model session live in refs: the async runner must never
  // read them through a stale render closure.
  const pendingRef = useRef([])
  const runnerRef = useRef(null)
  const runTokenRef = useRef(0)
  const modelRef = useRef({ key: null, promise: null })
  const fetchedRef = useRef(new Map())
  const forceCpuRef = useRef(false)
  const itemsRef = useRef(items)
  const startRunnerRef = useRef(null)
  itemsRef.current = items

  useEffect(() => () => itemsRef.current.forEach(revokeItemUrls), [])

  const patch = useCallback((id, changes) => {
    setItems((previous) => previous.map((item) => (item.id === id ? { ...item, ...changes } : item)))
  }, [])

  const deviceFor = useCallback(
    (current) => (current.useGpu && !forceCpuRef.current ? 'gpu' : 'cpu'),
    [],
  )

  /**
   * Model download progress is global and worth showing even after the job that
   * triggered it was cancelled; per-image compute progress is not.
   */
  const makeProgressHandler = useCallback(
    (id, modelId, device, alive) => (key, current, total) => {
      if (key.startsWith('fetch:')) {
        fetchedRef.current.set(key, { loaded: current, total })
        let loaded = 0
        let discovered = 0
        for (const entry of fetchedRef.current.values()) {
          loaded += entry.loaded
          discovered += entry.total
        }
        // The library fetches the weights before the WASM runtime, so the real
        // total is only known part way through — hold the bar to the expected
        // size until the reported figure overtakes it.
        const expected = Math.max(discovered, expectedDownloadBytes(modelId, device))
        setModel({
          phase: 'downloading',
          loaded,
          total: expected,
          ratio: Math.min(loaded / expected, 1),
          error: null,
        })
        return
      }
      if (key.startsWith('compute:') && alive()) {
        patch(id, {
          status: 'processing',
          progress: { step: key.slice('compute:'.length), ratio: total ? current / total : 0 },
        })
      }
    },
    [patch],
  )

  /** Downloads the weights and builds the session once per model+device pair. */
  const ensureModel = useCallback(async (config, onProgress) => {
    const key = `${config.model}:${config.device}`
    if (modelRef.current.key !== key) {
      modelRef.current = { key, promise: null }
    }
    if (!modelRef.current.promise) {
      fetchedRef.current = new Map()
      setModel({
        phase: 'downloading',
        loaded: 0,
        total: expectedDownloadBytes(config.model, config.device),
        ratio: 0,
        error: null,
      })
      modelRef.current.promise = preloadModel(config, onProgress).then(
        () => {
          setModel((previous) => ({ ...previous, phase: 'ready', ratio: 1 }))
        },
        (error) => {
          modelRef.current = { key: null, promise: null }
          setModel({ ...IDLE_MODEL, phase: 'error', error: describeError(error).message })
          throw error
        },
      )
    }
    await modelRef.current.promise
  }, [])

  const attempt = useCallback(
    async (blob, id, modelId, device, alive, onModelReady) => {
      // Everything except the progress callback feeds the library's internal
      // memo key, so this object must stay identical between the preload and the
      // removal call for the session to be reused instead of rebuilt.
      const config = { model: modelId, device, output: { format: 'image/png' } }
      const onProgress = makeProgressHandler(id, modelId, device, alive)
      await ensureModel(config, onProgress)
      if (!alive()) throw new Cancelled()
      onModelReady()
      patch(id, { status: 'processing', progress: { step: 'decode', ratio: 0 } })
      return removeImageBackground(blob, config, onProgress)
    },
    [ensureModel, makeProgressHandler, patch],
  )

  const processOne = useCallback(
    async (job, alive) => {
      patch(job.id, { status: 'reading', error: null, progress: null })
      // Timed from the moment the model is ready, so the reported duration is the
      // repeatable cost of this image rather than a one-off 80 MB download. The
      // download has its own progress banner.
      let computeStartedAt = null
      const markComputeStart = () => {
        computeStartedAt = performance.now()
      }

      const prepared = await prepareFile(job.file)
      if (!alive()) throw new Cancelled()
      patch(job.id, {
        // "preparing" covers the wait for the model, which on a cold cache is far
        // longer than reading the file and deserves its own label.
        status: 'preparing',
        source: {
          url: URL.createObjectURL(prepared.blob),
          width: prepared.width,
          height: prepared.height,
          size: prepared.blob.size,
          transcoded: prepared.transcoded,
        },
      })

      const current = settingsRef.current
      const device = deviceFor(current)
      let output
      try {
        output = await attempt(prepared.blob, job.id, current.model, device, alive, markComputeStart)
      } catch (error) {
        if (error instanceof Cancelled || device !== 'gpu') throw error
        // WebGPU is opportunistic: an adapter or driver failure should degrade to
        // WASM rather than fail the batch.
        forceCpuRef.current = true
        setNotice('WebGPU could not run the model on this device, so the CPU is being used instead.')
        setModel(IDLE_MODEL)
        computeStartedAt = null
        output = await attempt(prepared.blob, job.id, current.model, 'cpu', alive, markComputeStart)
      }
      if (!alive()) throw new Cancelled()

      patch(job.id, {
        status: 'done',
        progress: null,
        result: {
          url: URL.createObjectURL(output.blob),
          blob: output.blob,
          size: output.blob.size,
          width: output.width || prepared.width,
          height: output.height || prepared.height,
          fileName: resultFileName(job.name),
          elapsedMs: performance.now() - computeStartedAt,
        },
      })
    },
    [attempt, deviceFor, patch],
  )

  const startRunner = useCallback(() => {
    if (runnerRef.current) return
    const token = runTokenRef.current
    const alive = () => runTokenRef.current === token
    setRunning(true)

    runnerRef.current = (async () => {
      while (pendingRef.current.length && alive()) {
        const job = pendingRef.current.shift()
        try {
          await processOne(job, alive)
        } catch (error) {
          if (error instanceof Cancelled || !alive()) break
          patch(job.id, { status: 'error', progress: null, error: describeError(error) })
        }
      }
    })().finally(() => {
      runnerRef.current = null
      // Files dropped in the gap between the loop's last check and this line —
      // or queued by a fresh generation after stop() — would otherwise wait
      // forever. The restart picks up the current token.
      if (pendingRef.current.length) startRunnerRef.current()
      else if (alive()) setRunning(false)
    })
  }, [patch, processOne])
  startRunnerRef.current = startRunner

  const add = useCallback(
    (fileList) => {
      const files = Array.from(fileList ?? [])
      if (files.length === 0) return

      const images = files.filter(looksLikeImage)
      const skipped = files.length - images.length
      const room = Math.max(0, MAX_BATCH - itemsRef.current.length)
      const accepted = images.slice(0, room)
      const overflow = images.length - accepted.length

      const messages = []
      if (skipped > 0) {
        messages.push(`${skipped} non-image file${skipped === 1 ? '' : 's'} skipped.`)
      }
      if (overflow > 0) {
        messages.push(
          `${overflow} image${overflow === 1 ? '' : 's'} skipped — ${MAX_BATCH} per batch is the limit.`,
        )
      }
      setNotice(messages.length > 0 ? messages.join(' ') : null)
      if (accepted.length === 0) return

      const created = accepted.map((file) => {
        nextId += 1
        return {
          id: nextId,
          file,
          name: file.name || `pasted-image-${nextId}.png`,
          status: 'queued',
          progress: null,
          source: null,
          result: null,
          error: null,
        }
      })
      setItems((previous) => [...previous, ...created])
      pendingRef.current.push(...created.map((item) => ({ id: item.id, file: item.file, name: item.name })))
      startRunner()
    },
    [startRunner],
  )

  const retry = useCallback(
    (id) => {
      const item = itemsRef.current.find((candidate) => candidate.id === id)
      if (!item || isPending(item.status)) return
      // processOne creates fresh preview URLs, so release the previous pair first.
      revokeItemUrls(item)
      patch(id, { status: 'queued', progress: null, error: null, result: null, source: null })
      pendingRef.current.push({ id: item.id, file: item.file, name: item.name })
      startRunner()
    },
    [patch, startRunner],
  )

  const remove = useCallback((id) => {
    pendingRef.current = pendingRef.current.filter((job) => job.id !== id)
    const item = itemsRef.current.find((candidate) => candidate.id === id)
    if (item) revokeItemUrls(item)
    setItems((previous) => previous.filter((candidate) => candidate.id !== id))
  }, [])

  const stop = useCallback(() => {
    runTokenRef.current += 1
    pendingRef.current = []
    setRunning(false)
    setItems((previous) =>
      previous.map((item) =>
        isPending(item.status) ? { ...item, status: 'cancelled', progress: null } : item,
      ),
    )
  }, [])

  const clear = useCallback(() => {
    runTokenRef.current += 1
    pendingRef.current = []
    itemsRef.current.forEach(revokeItemUrls)
    setItems([])
    setRunning(false)
    setNotice(null)
  }, [])

  /** Warms the cache before any image is picked, so the first run feels instant. */
  const warmUp = useCallback(async () => {
    const current = settingsRef.current
    const device = deviceFor(current)
    const config = { model: current.model, device, output: { format: 'image/png' } }
    try {
      await ensureModel(config, makeProgressHandler(null, current.model, device, () => false))
    } catch {
      // ensureModel already surfaced this through the model banner.
    }
  }, [deviceFor, ensureModel, makeProgressHandler])

  // Changing quality or device invalidates the cached session, so reflect that
  // in the banner instead of leaving a stale "ready" chip behind.
  useEffect(() => {
    const key = `${settings.model}:${settings.useGpu && !forceCpuRef.current ? 'gpu' : 'cpu'}`
    if (modelRef.current.key && modelRef.current.key !== key) {
      setModel(IDLE_MODEL)
    }
  }, [settings.model, settings.useGpu])

  return {
    items,
    model,
    running,
    notice,
    dismissNotice: useCallback(() => setNotice(null), []),
    add,
    retry,
    remove,
    stop,
    clear,
    warmUp,
  }
}
