import { useCallback, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { MAX_BATCH } from '../hooks/useBatchRemoval.js'

export default function Dropzone({ onFiles, compact = false, disabled = false }) {
  const inputRef = useRef(null)
  const depthRef = useRef(0)
  const [dragging, setDragging] = useState(false)

  const endDrag = useCallback(() => {
    depthRef.current = 0
    setDragging(false)
  }, [])

  const onDrop = useCallback(
    (event) => {
      event.preventDefault()
      endDrag()
      if (!disabled) onFiles(event.dataTransfer?.files)
    },
    [disabled, endDrag, onFiles],
  )

  const dragProps = {
    onDragEnter: (event) => {
      event.preventDefault()
      depthRef.current += 1
      if (!disabled) setDragging(true)
    },
    onDragOver: (event) => {
      event.preventDefault()
    },
    // dragleave fires for every child element, so track depth rather than
    // clearing on the first one.
    onDragLeave: () => {
      depthRef.current -= 1
      if (depthRef.current <= 0) endDrag()
    },
    onDrop,
  }

  const open = () => inputRef.current?.click()

  return (
    <div className={`dropzone ${compact ? 'dropzone-compact' : ''} ${dragging ? 'is-dragging' : ''}`} {...dragProps}>
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept="image/*"
        multiple
        disabled={disabled}
        onChange={(event) => {
          onFiles(event.target.files)
          // Allow re-picking the same file straight after removing it.
          event.target.value = ''
        }}
      />
      {compact ? (
        <button type="button" className="btn ghost" onClick={open} disabled={disabled}>
          <Icon name="plus" />
          Add images
        </button>
      ) : (
        <>
          <span className="dropzone-glyph" aria-hidden="true">
            <Icon name="image" size={30} />
          </span>
          <button type="button" className="btn primary dropzone-cta" onClick={open} disabled={disabled}>
            <Icon name="upload" />
            Choose images
          </button>
          <p className="dropzone-hint">
            …or drop them here, or paste with <kbd>Ctrl</kbd>+<kbd>V</kbd>
          </p>
          <p className="dropzone-meta">
            PNG, JPEG, WebP, AVIF, GIF · up to {MAX_BATCH} at a time · originals never leave your device
          </p>
        </>
      )}
    </div>
  )
}
