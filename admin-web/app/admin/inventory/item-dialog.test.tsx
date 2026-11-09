import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { parseQty, type StockRow } from '@/lib/inventory'

vi.mock('@/lib/actions/inventory', () => ({ saveInventoryItem: vi.fn() }))

const { ToastProvider } = await import('@/components/ui/toast')
const { default: ItemDialog } = await import('./item-dialog')

const row = (over: Partial<StockRow>): StockRow => ({
  id: 'a', name: 'Thịt ba chỉ', unit: 'kg', kind: 'ingredient', sku: null, minStock: null, isActive: true, qty: 0,
  lastUnitCost: null, stockValue: 0, ...over,
})

/** Giá trị ban đầu của ô Mức tối thiểu khi mở hộp sửa. */
function minStockValue(item: StockRow): string {
  const html = renderToStaticMarkup(
    <ToastProvider><ItemDialog item={item} onClose={vi.fn()} onSaved={vi.fn()} /></ToastProvider>,
  )
  const m = html.match(/id="inv-item-min"[^>]*value="([^"]*)"/) ?? html.match(/value="([^"]*)"[^>]*id="inv-item-min"/)
  expect(m, 'không thấy ô Mức tối thiểu').not.toBeNull()
  return m![1]
}

describe('ItemDialog — mức tối thiểu lẻ đi một vòng không đổi', () => {
  it('1,5 kg hiện "1,5" và parseQty đọc lại đúng 1,5 (bấm Lưu không sửa gì thì không đổi số)', () => {
    const v = minStockValue(row({ minStock: 1.5 }))
    expect(v).toBe('1,5')
    expect(parseQty(v)).toBe(1.5)
  })

  it('1.200 lon hiện "1200" (không dấu ngăn nghìn — "1.200" sẽ bị đọc thành 1,2)', () => {
    const v = minStockValue(row({ unit: 'lon', kind: 'goods', minStock: 1200 }))
    expect(v).toBe('1200')
    expect(parseQty(v)).toBe(1200)
  })

  it('0,125 và không đặt mức', () => {
    expect(parseQty(minStockValue(row({ minStock: 0.125 })))).toBe(0.125)
    expect(minStockValue(row({ minStock: null }))).toBe('')
  })
})
