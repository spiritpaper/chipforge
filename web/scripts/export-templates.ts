// Writes every starter song as a .chipsong file, for engine demos and tests.
//   pnpm export-templates <dir>

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { encodeSong } from '../src/song/encode'
import { TEMPLATES } from '../src/song/templates'

const dir = process.argv[2]
if (!dir) {
  console.error('usage: pnpm export-templates <dir>')
  process.exit(1)
}
mkdirSync(dir, { recursive: true })
for (const t of TEMPLATES.filter((t) => t.id !== 'empty')) {
  const file = join(dir, `${t.id.replace(/-/g, '_')}.chipsong`)
  writeFileSync(file, encodeSong(t.create()))
  console.log(file)
}
