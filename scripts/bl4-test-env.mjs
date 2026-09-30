import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const allowedKeys = new Set([
  'BL4_TEST_DATABASE_URL',
  'BL4_TEST_ALLOWED_HOST',
  'BL4_TEST_OWNER_ID',
])

// Chỉ nạp config test local; biến đã có trong terminal luôn được ưu tiên.
export function loadBl4TestEnvironment({ filePath = resolve(root, '.env.bl4-test.local'), env = process.env } = {}) {
  let source
  try {
    source = readFileSync(filePath, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!match || !allowedKeys.has(match[1])) continue
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!env[match[1]]) env[match[1]] = value
  }
  return true
}
