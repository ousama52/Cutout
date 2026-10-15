import { useCallback, useEffect, useMemo, useState } from 'react'
import Dropzone from './components/Dropzone.jsx'
import Icon from './components/Icon.jsx'
import ItemDetail from './components/ItemDetail.jsx'
import ItemStrip from './components/ItemStrip.jsx'
import ModelBanner from './components/ModelBanner.jsx'
import Options from './components/Options.jsx'
import { useBatchRemoval } from './hooks/useBatchRemoval.js'
import { uniqueNames } from './lib/image.js'
import { isActive, isPending } from './lib/status.js'
import { DEFAULT_MODEL } from './lib/models.js'
import { createZip } from './lib/zip.js'
import './styles.css'

const SETTINGS_KEY = 'bg-remover.settings.v1'
const DEFAULT_SETTINGS = { model: DEFAULT_MODEL, useGpu: true }

function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null')
    if (stored && typeof stored === 'object') {
      return {
        model: typeof stored.model === 'string' ? stored.model : DEFAULT_SETTINGS.model,
        useGpu: stored.useGpu !== false,
      }
    }
  } catch {
    // Private browsing or a corrupted value — the defaults are fine.
  }
  return DEFAULT_SETTINGS
}

/** Follows the interesting image unless the user has pinned one by clicking it. */
function autoSelect(items) {
  const active = items.find((item) => isActive(item.status))
  if (active) return active
  const lastDone = items.findLast((item) => item.status === 'done')
  if (lastDone) return lastDone
  const failed = items.find((item) => item.status === 'error' || item.status === 'cancelled')
  return failed ?? items[0] ?? null
}

function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export default function App() {
  const [settings, setSettings] = useState(loadSettings)
  const [pinnedId, setPinnedId] = useState(null)
  const [zipState, setZipState] = useState({ busy: false, error: null })
  const batch = useBatchRemoval(settings)
  const { items, add } = batch

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch {
      // Persisting preferences is a nicety, not a requirement.
    }
  }, [settings])

  // Paste anywhere on the page.
  useEffect(() => {
    const onPaste = (event) => {
      const files = Array.from(event.clipboardData?.files ?? [])
      if (files.length > 0) add(files)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [add])

  // Stop the browser from navigating away when a file is dropped outside the zone.
  useEffect(() => {
    const swallow = (event) => event.preventDefault()
    window.addEventListener('dragover', swallow)
    window.addEventListener('drop', swallow)
    return () => {
      window.removeEventListener('dragover', swallow)
      window.removeEventListener('drop', swallow)
    }
  }, [])

  const selected = useMemo(
    () => items.find((item) => item.id === pinnedId) ?? autoSelect(items),
    [items, pinnedId],
  )

  const counts = useMemo(
    () => ({
      done: items.filter((item) => item.status === 'done').length,
      failed: items.filter((item) => item.status === 'error').length,
      waiting: items.filter((item) => isPending(item.status)).length,
    }),
    [items],
  )

  const finished = useMemo(() => items.filter((item) => item.status === 'done'), [items])

  const downloadAll = useCallback(async () => {
    setZipState({ busy: true, error: null })
    try {
      const names = uniqueNames(finished.map((item) => item.result.fileName))
      const zip = await createZip(finished.map((item, index) => ({ name: names[index], blob: item.result.blob })))
      saveBlob(zip, 'cutouts.zip')
      setZipState({ busy: false, error: null })
    } catch (error) {
      setZipState({ busy: false, error: String(error?.message ?? error) })
    }
  }, [finished])

  const clearAll = useCallback(() => {
    setPinnedId(null)
    setZipState({ busy: false, error: null })
    batch.clear()
  }, [batch])

  return (
    <div className="page">
      <header className="masthead">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Cutout</span>
        </div>
        <p className="tagline">
          Drop in a batch of images and get transparent PNGs back — same resolution, no upload, no account.
        </p>
        <p className="masthead-note">
          <Icon name="shield" size={15} />
          The model runs inside this tab. Your pictures never touch a server.
        </p>
      </header>

      <main className="stage">
        <ModelBanner model={batch.model} />

        {batch.notice ? (
          <div className="banner banner-soft" role="status">
            <Icon name="alert" size={16} />
            <p className="banner-title">{batch.notice}</p>
            <button type="button" className="icon-btn" onClick={batch.dismissNotice} aria-label="Dismiss">
              <Icon name="close" size={14} />
            </button>
          </div>
        ) : null}

        {items.length === 0 ? (
          <Dropzone onFiles={add} />
        ) : (
          <>
            <div className="toolbar">
              <p className="toolbar-count">
                <strong>{items.length}</strong> image{items.length === 1 ? '' : 's'}
                <span className="toolbar-sep">·</span>
                {counts.done} done
                {counts.waiting > 0 ? `, ${counts.waiting} to go` : ''}
                {counts.failed > 0 ? `, ${counts.failed} failed` : ''}
              </p>
              <div className="toolbar-actions">
                <Dropzone onFiles={add} compact />
                {finished.length > 1 ? (
                  <button type="button" className="btn ghost" onClick={downloadAll} disabled={zipState.busy}>
                    {zipState.busy ? <span className="spinner spinner-xs" /> : <Icon name="archive" />}
                    Download all ({finished.length})
                  </button>
                ) : null}
                {batch.running ? (
                  <button type="button" className="btn ghost" onClick={batch.stop}>
                    <Icon name="stop" />
                    Stop
                  </button>
                ) : null}
                <button type="button" className="btn ghost" onClick={clearAll}>
                  <Icon name="trash" />
                  Clear
                </button>
              </div>
            </div>

            {zipState.error ? (
              <div className="banner banner-error" role="alert">
                <Icon name="alert" size={16} />
                <p className="banner-title">{zipState.error}</p>
              </div>
            ) : null}

            <ItemStrip
              items={items}
              selectedId={selected?.id ?? null}
              onSelect={setPinnedId}
              onRemove={batch.remove}
            />

            <ItemDetail item={selected} onRetry={batch.retry} />
          </>
        )}

        <Options
          settings={settings}
          onChange={setSettings}
          onWarmUp={batch.warmUp}
          model={batch.model}
          locked={batch.running}
        />
      </main>

      <footer className="footnote">
        <span>
          Segmentation by{' '}
          <a href="https://github.com/imgly/background-removal-js" target="_blank" rel="noreferrer">
            @imgly/background-removal
          </a>{' '}
          (IS-Net via ONNX Runtime Web).
        </span>
        <span>Weights are cached by the browser after the first run.</span>
      </footer>
    </div>
  )
}
