import { useEffect, useRef, useState } from 'react'
import CompareView from './CompareView.jsx'
import Icon from './Icon.jsx'
import { WARN_PIXELS } from '../lib/image.js'
import { isActive } from '../lib/status.js'
import { formatBytes, formatDimensions, formatDuration, formatMegapixels } from '../lib/format.js'

const STEP_LABELS = {
  decode: 'Decoding the image',
  inference: 'Running the model',
  mask: 'Applying the mask',
  encode: 'Encoding a transparent PNG',
}

const STATUS_TEXT = {
  queued: 'Queued',
  reading: 'Reading',
  preparing: 'Waiting',
  processing: 'Working',
  done: 'Done',
  error: 'Failed',
  cancelled: 'Stopped',
}

const WAITING_TEXT = {
  reading: 'Reading the image',
  preparing: 'Waiting for the model',
}

/** Wall-clock timer for the active job; the worker keeps this ticking smoothly. */
function useElapsed(active) {
  const [ms, setMs] = useState(0)
  const startedAt = useRef(0)

  useEffect(() => {
    if (!active) {
      setMs(0)
      return undefined
    }
    startedAt.current = performance.now()
    setMs(0)
    const timer = setInterval(() => setMs(performance.now() - startedAt.current), 100)
    return () => clearInterval(timer)
  }, [active])

  return ms
}

function Stat({ label, value, extra }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd>
        {value}
        {extra ? <span className="stat-extra">{extra}</span> : null}
      </dd>
    </div>
  )
}

export default function ItemDetail({ item, onRetry }) {
  const busy = item ? isActive(item.status) : false
  const elapsed = useElapsed(busy ? item.id : false)

  if (!item) return null

  const { source, result, progress } = item
  const isLarge = source ? source.width * source.height > WARN_PIXELS : false
  const sizeMatches = source && result && source.width === result.width && source.height === result.height

  return (
    <section className="detail" aria-live="polite">
      <header className="detail-head">
        <h2 className="detail-name" title={item.name}>
          {item.name}
        </h2>
        <span className={`pill pill-${item.status}`}>{STATUS_TEXT[item.status]}</span>
        {source?.transcoded ? <span className="chip">Converted to PNG</span> : null}
        {isLarge ? (
          <span className="chip chip-warn">
            {formatMegapixels(source.width, source.height)} — this one takes a while
          </span>
        ) : null}
      </header>

      {item.status === 'done' && source && result ? (
        <>
          <CompareView source={source} result={result} />

          <dl className="stats">
            <Stat
              label="Original"
              value={formatDimensions(source.width, source.height)}
              extra={formatBytes(source.size)}
            />
            <Stat
              label="Result"
              value={formatDimensions(result.width, result.height)}
              extra={formatBytes(result.size)}
            />
            <Stat label="Took" value={formatDuration(result.elapsedMs)} />
            {sizeMatches ? (
              <div className="stat stat-ok">
                <dt>Resolution</dt>
                <dd>
                  <Icon name="check" size={15} />
                  Unchanged
                </dd>
              </div>
            ) : null}
          </dl>

          <div className="detail-actions">
            <a className="btn primary" href={result.url} download={result.fileName}>
              <Icon name="download" />
              Download PNG
            </a>
            <button type="button" className="btn ghost" onClick={() => onRetry(item.id)}>
              <Icon name="refresh" />
              Run again
            </button>
            <span className="detail-filename">{result.fileName}</span>
          </div>
        </>
      ) : null}

      {busy ? (
        <div className="working">
          <div className="working-preview">
            {source ? (
              <img src={source.url} alt="" className="working-img" />
            ) : (
              <span className="working-placeholder">
                <Icon name="image" size={26} />
              </span>
            )}
            <span className="working-sheen" aria-hidden="true" />
          </div>
          <div className="working-body">
            <p className="working-step">
              <span className="spinner" aria-hidden="true" />
              {WAITING_TEXT[item.status] ?? STEP_LABELS[progress?.step] ?? 'Working'}
            </p>
            <div className="bar" aria-hidden="true">
              <span
                className="bar-fill"
                style={{ width: `${Math.max((progress?.ratio ?? 0) * 100, 4)}%` }}
              />
            </div>
            <p className="working-meta">
              <Icon name="clock" size={14} />
              {formatDuration(elapsed)}
              {source ? ` · ${formatDimensions(source.width, source.height)}` : ''}
            </p>
          </div>
        </div>
      ) : null}

      {item.status === 'queued' ? (
        <p className="detail-idle">
          <Icon name="clock" />
          Waiting for the images ahead of it to finish.
        </p>
      ) : null}

      {item.status === 'error' || item.status === 'cancelled' ? (
        <div className={`callout ${item.status === 'error' ? 'callout-error' : ''}`}>
          <Icon name={item.status === 'error' ? 'alert' : 'stop'} />
          <div>
            <p className="callout-title">
              {item.status === 'error' ? item.error?.message : 'Stopped before this image finished.'}
            </p>
            {item.error?.hint ? <p className="callout-hint">{item.error.hint}</p> : null}
          </div>
          <button type="button" className="btn ghost sm" onClick={() => onRetry(item.id)}>
            <Icon name="refresh" size={15} />
            Try again
          </button>
        </div>
      ) : null}
    </section>
  )
}
