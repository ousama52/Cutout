import Icon from './Icon.jsx'
import { isActive } from '../lib/status.js'

const BADGES = {
  queued: { icon: 'clock', label: 'Queued' },
  reading: { icon: null, label: 'Reading' },
  preparing: { icon: null, label: 'Waiting for the model' },
  processing: { icon: null, label: 'Working' },
  done: { icon: 'check', label: 'Done' },
  error: { icon: 'alert', label: 'Failed' },
  cancelled: { icon: 'stop', label: 'Stopped' },
}

export default function ItemStrip({ items, selectedId, onSelect, onRemove }) {
  if (items.length < 2) return null

  return (
    <ul className="strip" aria-label="Images in this batch">
      {items.map((item) => {
        const badge = BADGES[item.status]
        const preview = item.status === 'done' ? item.result?.url : item.source?.url
        const locked = isActive(item.status)
        return (
          <li key={item.id} className={`strip-item ${item.id === selectedId ? 'is-selected' : ''}`}>
            <button
              type="button"
              className="thumb"
              onClick={() => onSelect(item.id)}
              aria-current={item.id === selectedId}
            >
              <span className={`thumb-frame ${item.status === 'done' ? 'is-transparent' : ''}`}>
                {preview ? (
                  <img src={preview} alt="" className="thumb-img" />
                ) : (
                  <Icon name="image" size={20} />
                )}
                {/* Inside the frame so it anchors to the image, not the whole cell. */}
                <span className={`thumb-badge badge-${item.status}`} title={badge.label}>
                  {badge.icon ? <Icon name={badge.icon} size={12} /> : <span className="spinner spinner-xs" />}
                  <span className="visually-hidden">{badge.label}</span>
                </span>
              </span>
              <span className="thumb-name">{item.name}</span>
            </button>
            {locked ? null : (
              <button
                type="button"
                className="thumb-remove"
                onClick={() => onRemove(item.id)}
                aria-label={`Remove ${item.name}`}
                title="Remove"
              >
                <Icon name="close" size={12} />
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
