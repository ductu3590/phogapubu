import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// Mọi lần in từ giao diện phải đi qua printDocument (chọn chế độ trình duyệt / phần mềm in). Gọi thẳng
// printInPlace ở chỗ khác sẽ bỏ qua hàng đợi phần mềm in và in trùng / sai máy.
const ROOT = join(__dirname, '..', '..')
const ALLOWED = new Set(['lib/print/print-document.ts', 'lib/print/print-in-place.ts'])

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

describe('nơi gọi in', () => {
  it('chỉ print-document.ts được import printInPlace', () => {
    const offenders = ['app', 'components', 'lib']
      .flatMap((d) => walk(join(ROOT, d)))
      .map((f) => relative(ROOT, f).replace(/\\/g, '/'))
      .filter((f) => !ALLOWED.has(f))
      .filter((f) => /from ['"][^'"]*print-in-place['"]/.test(readFileSync(join(ROOT, f), 'utf8')))
    expect(offenders).toEqual([])
  })
})
