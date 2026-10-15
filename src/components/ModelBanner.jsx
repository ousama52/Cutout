import Icon from './Icon.jsx'
import { formatBytes } from '../lib/format.js'

export default function ModelBanner({ model }) {
  if (model.phase === 'downloading') {
    const percent = Math.round(model.ratio * 100)
    return (
      <div className="banner" role="status">
        <span className="spinner" aria-hidden="true" />
        <div className="banner-body">
          <p className="banner-title">Downloading the model — this happens once</p>
          <div className="bar" aria-hidden="true">
            <span className="bar-fill" style={{ width: `${Math.max(percent, 2)}%` }} />
          </div>
          <p className="banner-meta">
            {formatBytes(model.loaded)} of {formatBytes(model.total)} · {percent}%
          </p>
        </div>
      </div>
    )
  }

  if (model.phase === 'error') {
    return (
      <div className="banner banner-error" role="alert">
        <Icon name="alert" />
        <div className="banner-body">
          <p className="banner-title">{model.error ?? 'The model could not be loaded.'}</p>
          <p className="banner-meta">Check your connection, then retry an image.</p>
        </div>
      </div>
    )
  }

  return null
}
