import { useState } from 'react'
import Icon from './Icon.jsx'

const BACKDROPS = [
  { id: 'checker', label: 'Transparent' },
  { id: 'light', label: 'White' },
  { id: 'dark', label: 'Black' },
  { id: 'accent', label: 'Colour' },
]

export default function CompareView({ source, result }) {
  const [split, setSplit] = useState(50)
  const [backdrop, setBackdrop] = useState('checker')

  return (
    <div className="compare-wrap">
      <div
        className="compare"
        style={{ '--split': `${split}%`, '--ratio': result.width / result.height }}
      >
        <img className="compare-img" src={source.url} alt="Original image" draggable={false} />
        <div className={`compare-after backdrop-${backdrop}`}>
          <img className="compare-img" src={result.url} alt="Background removed" draggable={false} />
        </div>
        <div className="compare-divider" aria-hidden="true">
          <span className="compare-grip">
            <Icon name="grip" size={16} />
          </span>
        </div>
        {/* A full-bleed range input gives pointer dragging, touch and arrow-key
            control for free — the visible divider tracks its value. */}
        <input
          className="compare-range"
          type="range"
          min="0"
          max="100"
          step="0.1"
          value={split}
          aria-label="Reveal the result"
          onChange={(event) => setSplit(Number(event.target.value))}
        />
        <span className="compare-tag compare-tag-left">Original</span>
        <span className="compare-tag compare-tag-right">Removed</span>
      </div>

      <div className="backdrop-row" role="group" aria-label="Preview backdrop">
        <span className="backdrop-label">Preview on</span>
        {BACKDROPS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`swatch swatch-${option.id} ${backdrop === option.id ? 'is-active' : ''}`}
            aria-pressed={backdrop === option.id}
            title={option.label}
            onClick={() => setBackdrop(option.id)}
          >
            <span className="visually-hidden">{option.label}</span>
          </button>
        ))}
        <span className="backdrop-note">The downloaded PNG always keeps its transparency.</span>
      </div>
    </div>
  )
}
