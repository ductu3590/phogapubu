import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Server component / server action / route gọi một HÀM export từ file 'use client' là lỗi lúc chạy thật
// ("Attempted to call X() from the server but X is on the client") mà vitest không bắt được: vitest import thẳng
// module, không đi qua ranh giới React Server Components. Test này quét tĩnh: file KHÔNG 'use client' mà gọi
// `ten(` của một tên (chữ thường đầu — không phải component) import từ file 'use client' thì báo lỗi.
// Hàm thuần dùng chung hai phía phải sống ở module thường (lib/...), file client chỉ re-export.

const ROOT = path.resolve(__dirname, '..')
const DIRS = ['app', 'lib', 'components']

function listFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next') continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) listFiles(p, out)
    else if (/\.(tsx?|jsx?)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p)
  }
  return out
}

const isClientFile = (f: string): boolean => /^\s*(['"])use client\1/.test(fs.readFileSync(f, 'utf8'))

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? path.join(ROOT, spec.slice(2))
    : spec.startsWith('.') ? path.resolve(path.dirname(from), spec) : null
  if (!base) return null
  for (const ext of ['', '.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts']) {
    const p = base + ext
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p
  }
  return null
}

function boundaryViolations(): string[] {
  const out: string[] = []
  const files = DIRS.flatMap((d) => listFiles(path.join(ROOT, d)))
  for (const f of files) {
    if (isClientFile(f)) continue
    const src = fs.readFileSync(f, 'utf8')
    for (const m of src.matchAll(/import\s+([^'";]+?)\s+from\s+['"]([^'"]+)['"]/g)) {
      if (/^type\s/.test(m[1].trim())) continue
      const target = resolveImport(f, m[2])
      if (!target || !isClientFile(target)) continue
      const named = (m[1].match(/\{([^}]*)\}/)?.[1] ?? '')
        .split(',').map((s) => s.trim()).filter((s) => s && !s.startsWith('type '))
      for (const local of named.map((n) => n.split(/\s+as\s+/).pop() as string)) {
        if (!/^[a-z]/.test(local)) continue
        if (new RegExp(String.raw`\b${local}\s*\(`).test(src)) {
          out.push(`${path.relative(ROOT, f)} gọi ${local}() của ${path.relative(ROOT, target)} ('use client')`)
        }
      }
    }
  }
  return out
}

describe('ranh giới server / client', () => {
  it('không file server nào gọi hàm export từ file use client', () => {
    expect(boundaryViolations()).toEqual([])
  })
})
