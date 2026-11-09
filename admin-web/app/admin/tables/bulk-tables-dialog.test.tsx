import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/actions/tables', () => ({ addTablesBulk: vi.fn() }))

import BulkTablesDialog from './bulk-tables-dialog'

const areas = [{ id: 'a1', name: 'Sân vườn' }, { id: 'a2', name: 'Tầng 2' }]
const render = (p: { existingNames?: string[]; initial?: { areaId: string | null; prefix: string; from: number; to: number } }) =>
  renderToStaticMarkup(createElement(BulkTablesDialog, { open: true, areas, existingNames: p.existingNames ?? [], initial: p.initial, onClose: vi.fn() }))

describe('BulkTablesDialog', () => {
  it('xem trước A 1→5, đã có A3: liệt kê A1, A2, A4, A5, có "A3 · đã có, bỏ qua", nút "Tạo 4 bàn"', () => {
    const html = render({ existingNames: ['A3'], initial: { areaId: null, prefix: 'A', from: 1, to: 5 } })
    for (const n of ['A1', 'A2', 'A4', 'A5']) expect(html).toContain(`>${n}<`)
    expect(html).toContain('A3 · đã có, bỏ qua')
    expect(html).toContain('Sẽ tạo 4 bàn')
    expect(html).toContain('Tạo 4 bàn')
  })

  it('1→101: hiện "Tối đa 100 bàn một lần", nút Tạo bị khoá', () => {
    const html = render({ initial: { areaId: null, prefix: 'A', from: 1, to: 101 } })
    expect(html).toContain('Tối đa 100 bàn một lần')
    expect(html).toMatch(/<button(?=[^>]*disabled="")[^>]*>(<span[^>]*>)?Tạo 0 bàn/)
  })

  it('cả loạt trùng: nút "Tạo 0 bàn" bị khoá', () => {
    const html = render({ existingNames: ['A1', 'A2'], initial: { areaId: null, prefix: 'A', from: 1, to: 2 } })
    expect(html).toMatch(/<button(?=[^>]*disabled="")[^>]*>(<span[^>]*>)?Tạo 0 bàn/)
  })

  it('có ô chọn khu với "Chưa phân khu" và tên các khu', () => {
    const html = render({})
    expect(html).toContain('Chưa phân khu')
    expect(html).toContain('Sân vườn')
    expect(html).toContain('Tầng 2')
  })

  it('mặc định chọn khu đầu tiên', () => {
    expect(render({})).toMatch(/<option value="a1" selected/)
  })
})
