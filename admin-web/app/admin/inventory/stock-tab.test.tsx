import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { StockRow } from '@/lib/inventory'

// StockTab là client component gọi server action — chỉ cần giả lập để import được, test không bấm nút.
vi.mock('@/lib/actions/inventory', () => ({
  saveInventoryItem: vi.fn(),
  setInventoryItemActive: vi.fn(),
  loadInventoryStock: vi.fn(),
}))

const { ToastProvider } = await import('@/components/ui/toast')
const { default: StockTab, deactivateDescription } = await import('./stock-tab')

const row = (over: Partial<StockRow>): StockRow => ({
  id: 'a', name: 'Bia Hà Nội lon', unit: 'lon', kind: 'goods', sku: null, minStock: null, isActive: true, qty: 10,
  lastUnitCost: null, stockValue: 0, ...over,
})

const render = (rows: StockRow[], canEdit = true) =>
  renderToStaticMarkup(<ToastProvider><StockTab rows={rows} canEdit={canEdit} /></ToastProvider>)

/** Đoạn markup quanh chữ (để kiểm màu badge đi cùng chữ). */
const around = (html: string, text: string) => {
  const i = html.indexOf(text)
  expect(i, `không thấy "${text}"`).toBeGreaterThan(-1)
  return html.slice(Math.max(0, i - 400), i + text.length)
}

describe('StockTab', () => {
  it('tồn âm: chữ "Âm kho" nền đỏ, số "-3"', () => {
    const html = render([row({ qty: -3 })])
    expect(around(html, 'Âm kho')).toContain('bg-critical-bg')
    expect(html).toContain('>-3<')
    expect(html).not.toContain('Sắp hết')
  })

  it('dưới mức tối thiểu: chữ "Sắp hết" nền vàng', () => {
    const html = render([row({ qty: 5, minStock: 24 })])
    expect(around(html, 'Sắp hết')).toContain('bg-warning-bg')
    expect(html).not.toContain('Âm kho')
    // Bằng mức tối thiểu là đủ: không cảnh báo.
    expect(render([row({ qty: 24, minStock: 24 })])).not.toContain('Sắp hết')
  })

  it('canEdit false (thu ngân): không có nút Thêm hàng hoá, Sửa, Ngừng dùng', () => {
    const html = render([row({}), row({ id: 'b', name: 'Thịt ba chỉ', kind: 'ingredient', unit: 'kg' })], false)
    expect(html).toContain('Bia Hà Nội lon')
    expect(html).not.toContain('Thêm hàng hoá')
    expect(html).not.toContain('>Sửa<')
    expect(html).not.toMatch(/aria-label="Sửa/)
    expect(html).not.toContain('Ngừng dùng')
    // Chủ quán / quản lý thấy đủ.
    const edit = render([row({})], true)
    expect(edit).toContain('Thêm hàng hoá')
    // Nút chính cao ≥ 44px trên điện thoại (min-h-11), chỉ thấp xuống 40px từ md.
    const addButton = edit.slice(edit.lastIndexOf('<button', edit.indexOf('Thêm hàng hoá')), edit.indexOf('Thêm hàng hoá'))
    expect(addButton).toMatch(/\bmin-h-11\b/)
    expect(addButton).not.toMatch(/(?<!md:)min-h-(?:[0-9]|10)\b/)
    expect(edit).toContain('Ngừng dùng')
    expect(edit).toMatch(/Sửa/)
  })

  it('giá trị tồn hiện "1.776.000đ" khi qty 161 × 11.000 (làm tròn theo server, chỉ hiển thị stockValue)', () => {
    const html = render([row({ qty: 161, lastUnitCost: 11000, stockValue: 1776000 })])
    expect(html).toContain('1.776.000đ')
    expect(html).toContain('11.000đ')
    expect(html).toContain('>161<')
  })

  it('chân danh sách: tổng giá trị tồn các dòng đang hiện (hàng ngừng dùng ẩn mặc định)', () => {
    const html = render([
      row({ id: 'a', stockValue: 1000 }),
      row({ id: 'b', name: 'Coca', stockValue: 2500 }),
      row({ id: 'c', name: 'Bia cũ', isActive: false, stockValue: 9000 }),
    ])
    expect(html).toContain('3.500đ')
    expect(html).not.toContain('Bia cũ')
  })

  it('số lẻ kg theo kiểu Việt: 1,5', () => {
    expect(render([row({ name: 'Thịt', unit: 'kg', kind: 'ingredient', qty: 1.5 })])).toContain('>1,5<')
  })

  it('không có hàng: EmptyState "Chưa có hàng hoá nào"', () => {
    expect(render([])).toContain('Chưa có hàng hoá nào')
    expect(render([], false)).toContain('Chưa có hàng hoá nào')
  })
})

describe('StockTab — đợt sửa cuối', () => {
  it('thu ngân không thấy giá vốn, giá trị tồn, tổng giá trị (chỉ hậu cần thấy)', () => {
    const rows = [row({ qty: 161, lastUnitCost: 11000, stockValue: 1776000 })]
    const cashier = render(rows, false)
    expect(cashier).toContain('>161<')
    for (const s of ['Giá vốn', 'Giá trị', 'Tổng giá trị tồn', '1.776.000đ', '11.000đ']) expect(cashier, s).not.toContain(s)
    const owner = render(rows, true)
    for (const s of ['Giá vốn gần nhất', 'Giá trị tồn', 'Tổng giá trị tồn', '1.776.000đ', '11.000đ']) expect(owner, s).toContain(s)
  })

  it('ngừng dùng hàng còn tồn: nhắc kiểm về 0 trước (vẫn cho ngừng)', () => {
    expect(deactivateDescription({ qty: 3.5, unit: 'kg' }))
      .toBe('Còn tồn 3,5 kg — nên kiểm kho về 0 trước khi ngừng dùng. Hàng sẽ ẩn khỏi phiếu mới; món đang trừ kho hàng này sẽ thôi trừ.')
    expect(deactivateDescription({ qty: -2, unit: 'lon' })).toContain('Còn tồn -2 lon')
    expect(deactivateDescription({ qty: 0, unit: 'lon' })).toBe('Hàng sẽ ẩn khỏi phiếu mới; món đang trừ kho hàng này sẽ thôi trừ.')
  })
})
