import Icon from './Icon.jsx'
import { MODELS, expectedDownloadBytes, modelInfo } from '../lib/models.js'
import { formatBytes } from '../lib/format.js'

export default function Options({ settings, onChange, onWarmUp, model, locked }) {
  const device = settings.useGpu ? 'gpu' : 'cpu'
  const download = expectedDownloadBytes(settings.model, device)
  const ready = model.phase === 'ready'
  const busy = model.phase === 'downloading'

  return (
    <section className="options" aria-label="Quality settings">
      <div className="options-row">
        <div className="options-group">
          <span className="options-label" id="quality-label">
            Quality
          </span>
          <div className="segmented" role="group" aria-labelledby="quality-label">
            {MODELS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`segment ${settings.model === option.id ? 'is-active' : ''}`}
                aria-pressed={settings.model === option.id}
                disabled={locked}
                title={option.blurb}
                onClick={() => onChange({ ...settings, model: option.id })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <label className={`toggle ${locked ? 'is-locked' : ''}`}>
          <input
            type="checkbox"
            checked={settings.useGpu}
            disabled={locked}
            onChange={(event) => onChange({ ...settings, useGpu: event.target.checked })}
          />
          <span className="toggle-track" aria-hidden="true">
            <span className="toggle-knob" />
          </span>
          <span className="toggle-text">
            <Icon name="bolt" size={15} />
            Use the GPU when available
          </span>
        </label>

        {ready ? (
          <span className="chip chip-ok">
            <Icon name="check" size={14} />
            Model cached
          </span>
        ) : (
          <button type="button" className="btn ghost sm" onClick={onWarmUp} disabled={locked || busy}>
            <Icon name="download" size={15} />
            Download model now
          </button>
        )}
      </div>

      <p className="options-note">
        {modelInfo(settings.model).blurb} First use downloads {formatBytes(download)} of weights and WASM from the
        CDN; after that the browser cache serves them. Everything runs locally — no image is ever uploaded.
      </p>
    </section>
  )
}
