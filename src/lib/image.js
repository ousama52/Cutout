// The library's decoder (src/codecs.ts -> imageDecode) only accepts these MIME
// types and throws `Invalid format` for anything else. Since the file picker
// advertises image/*, anything outside this set is re-encoded to PNG first via
// the browser's own decoder — that is how AVIF, GIF, BMP and HEIC get through.
const PASSTHROUGH_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp'])

const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|avif|gif|bmp|heic|heif|tiff?)$/i

// A 4-channel Uint8 copy of the pixels is held for both the input and the
// output tensor, so peak memory is roughly 8 bytes per pixel plus the encoded
// PNG. 60 MP is about as far as a browser tab will stretch.
export const MAX_PIXELS = 60_000_000
export const WARN_PIXELS = 12_000_000

export class AppError extends Error {
  constructor(message, hint) {
    super(message)
    this.name = 'AppError'
    this.hint = hint
  }
}

export function looksLikeImage(file) {
  return Boolean(file) && (file.type.startsWith('image/') || IMAGE_EXTENSIONS.test(file.name ?? ''))
}

async function encodeBitmapToPng(bitmap) {
  const { width, height } = bitmap
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    canvas.getContext('2d').drawImage(bitmap, 0, 0)
    return canvas.convertToBlob({ type: 'image/png' })
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').drawImage(bitmap, 0, 0)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new AppError('The browser could not re-encode this image.'))),
      'image/png',
    )
  })
}

/**
 * Decodes a picked file to read its true pixel dimensions and returns a blob
 * the removal model can consume.
 *
 * @returns {Promise<{blob: Blob, width: number, height: number, transcoded: boolean}>}
 */
export async function prepareImage(file) {
  if (!file) throw new AppError('No file was provided.')

  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new AppError(
      'This file could not be decoded as an image.',
      'The browser may not support the format. Re-save it as PNG, JPEG or WebP.',
    )
  }

  try {
    const { width, height } = bitmap
    if (!width || !height) {
      throw new AppError('This image reports a zero width or height.')
    }
    if (width * height > MAX_PIXELS) {
      throw new AppError(
        `This image is too large to process in the browser (${(width * height / 1_000_000).toFixed(0)} MP).`,
        `Resize it below ${MAX_PIXELS / 1_000_000} MP and try again.`,
      )
    }
    const passthrough = PASSTHROUGH_TYPES.has(file.type)
    const blob = passthrough ? file : await encodeBitmapToPng(bitmap)
    return { blob, width, height, transcoded: !passthrough }
  } finally {
    bitmap.close?.()
  }
}

/** Reads the real dimensions of a produced blob, so the UI can verify them. */
export async function measureBlob(blob) {
  try {
    const bitmap = await createImageBitmap(blob)
    const { width, height } = bitmap
    bitmap.close?.()
    return { width, height }
  } catch {
    return { width: 0, height: 0 }
  }
}

export function resultFileName(name) {
  const base = (name ?? 'image').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '-').trim()
  return `${base || 'image'}-no-bg.png`
}

/** Keeps names unique inside a zip archive. */
export function uniqueNames(names) {
  const seen = new Map()
  return names.map((name) => {
    const count = seen.get(name) ?? 0
    seen.set(name, count + 1)
    if (count === 0) return name
    return name.replace(/(\.[^.]+)?$/, (extension) => `-${count + 1}${extension}`)
  })
}
