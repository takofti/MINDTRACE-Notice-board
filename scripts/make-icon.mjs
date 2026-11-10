import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Wrap the 256x256 PNG in an ICO container. Windows Vista+ and electron-builder
// both accept PNG-compressed ICO entries.
const png = readFileSync(join('build', 'icon-256.png'))
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(1, 4)
const entry = Buffer.alloc(16)
entry[0] = 0 // 256 px
entry[1] = 0 // 256 px
entry[2] = 0
entry[3] = 0
entry.writeUInt16LE(1, 4)
entry.writeUInt16LE(32, 6)
entry.writeUInt32LE(png.length, 8)
entry.writeUInt32LE(22, 12)
writeFileSync(join('build', 'icon.ico'), Buffer.concat([header, entry, png]))
console.log('Wrote build/icon.ico')
