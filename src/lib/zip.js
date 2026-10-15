// Minimal store-only (no deflate) zip writer.
//
// The payloads are PNGs, which are already deflate-compressed internally, so
// compressing them again buys almost nothing — storing them verbatim keeps this
// dependency-free and fast.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

function crc32(bytes) {
  let crc = 0xffffffff
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function dosStamp(date) {
  const year = Math.max(1980, date.getFullYear())
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

const UTF8_NAMES = 0x0800
const STORED = 0
const VERSION = 20

/**
 * @param {Array<{name: string, blob: Blob}>} entries
 * @returns {Promise<Blob>} a zip archive
 */
export async function createZip(entries) {
  if (entries.length > 0xffff) {
    throw new Error('Too many files for a single zip archive.')
  }

  const encoder = new TextEncoder()
  const stamp = dosStamp(new Date())
  const localParts = []
  const centralParts = []
  let offset = 0

  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const data = new Uint8Array(await entry.blob.arrayBuffer())
    const crc = crc32(data)

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true) // local file header signature
    local.setUint16(4, VERSION, true)
    local.setUint16(6, UTF8_NAMES, true)
    local.setUint16(8, STORED, true)
    local.setUint16(10, stamp.time, true)
    local.setUint16(12, stamp.date, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, data.length, true) // compressed size
    local.setUint32(22, data.length, true) // uncompressed size
    local.setUint16(26, name.length, true)
    local.setUint16(28, 0, true) // extra field length
    localParts.push(new Uint8Array(local.buffer), name, data)

    const central = new DataView(new ArrayBuffer(46))
    central.setUint32(0, 0x02014b50, true) // central directory signature
    central.setUint16(4, VERSION, true) // version made by
    central.setUint16(6, VERSION, true) // version needed
    central.setUint16(8, UTF8_NAMES, true)
    central.setUint16(10, STORED, true)
    central.setUint16(12, stamp.time, true)
    central.setUint16(14, stamp.date, true)
    central.setUint32(16, crc, true)
    central.setUint32(20, data.length, true)
    central.setUint32(24, data.length, true)
    central.setUint16(28, name.length, true)
    central.setUint16(30, 0, true) // extra field length
    central.setUint16(32, 0, true) // file comment length
    central.setUint16(34, 0, true) // disk number start
    central.setUint16(36, 0, true) // internal attributes
    central.setUint32(38, 0, true) // external attributes
    central.setUint32(42, offset, true) // offset of local header
    centralParts.push(new Uint8Array(central.buffer), name)

    offset += 30 + name.length + data.length
    if (offset > 0xffffffff) {
      throw new Error('The archive would exceed the 4 GB zip limit. Download the images individually.')
    }
  }

  const centralSize = centralParts.reduce((total, part) => total + part.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true) // end of central directory signature
  end.setUint16(4, 0, true) // this disk
  end.setUint16(6, 0, true) // disk with central directory
  end.setUint16(8, entries.length, true)
  end.setUint16(10, entries.length, true)
  end.setUint32(12, centralSize, true)
  end.setUint32(16, offset, true)
  end.setUint16(20, 0, true) // comment length

  return new Blob([...localParts, ...centralParts, new Uint8Array(end.buffer)], {
    type: 'application/zip',
  })
}
