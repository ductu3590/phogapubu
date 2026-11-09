import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { MenuStockData } from '@/lib/inventory'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/actions/inventory', () => ({ setMenuStockLink: vi.fn() }))
vi.mock('@/lib/actions/menu', () => ({ setMenuItemAvailable: vi.fn() }))

const { default: StockLinkEditor, linkSummary } = await import('./stock-link-editor')
const { default: MenuAvailabilityClient } = await import('./menu-availability-client')

const goods = [
  { id: 'tiger', name: 'Tiger lon', unit: 'lon' },
  { id: 'bia', name: 'Bia Hà Nội lon', unit: 'lon' },
]
const stock = (links: MenuStockData['links'] = []): MenuStockData => ({ goods, links })

const plain = { id: 'm-bia', name: 'Bia Hà Nội' }
const thap = {
  id: 'm-thap', name: 'Bia tháp',
  menu_item_variants: [{ id: 'v-nho', name: 'Tháp nhỏ', sort_order: 2 }, { id: 'v-to', name: 'Tháp to', sort_order: 1 }],
}

describe('StockLinkEditor', () => {
  it('món không biến thể: một dòng "Trừ kho: [chọn hàng] × [SL]"; chưa gắn → "Không trừ kho"', () => {
    const html = renderToStaticMarkup(<StockLinkEditor item={plain} stock={stock()} />)
    expect(html).toContain('Trừ kho khi bán')
    expect(html).toContain('Chỉ hàng bán nguyên (bia, nước). Đổi số lượng không ảnh hưởng đơn đã bán.')
    expect(html).toContain('Không trừ kho')
    expect(html.match(/<select/g)?.length).toBe(1)
    expect(html).toContain('<option value="tiger">Tiger lon (lon)</option>')
    expect(html).toMatch(/inputMode="decimal"[^>]*value="1"|value="1"[^>]*inputMode="decimal"/)
    expect(html).not.toContain('>Gỡ<')
    expect(html).not.toContain('Cả món')
  })

  it('món có biến thể: dòng "Cả món" + mỗi biến thể; biến thể chưa gắn riêng hiện "Theo cả món (Tiger lon × 3)"', () => {
    const html = renderToStaticMarkup(<StockLinkEditor item={thap} stock={stock([
      { menuItemId: 'm-thap', variantId: null, inventoryItemId: 'tiger', qtyPerSale: 3 },
      { menuItemId: 'm-thap', variantId: 'v-to', inventoryItemId: 'tiger', qtyPerSale: 5 },
    ])} />)
    expect(html.match(/<select/g)?.length).toBe(3)
    // Thứ tự: Cả món, rồi biến thể theo sort_order.
    expect(html.indexOf('Cả món')).toBeLessThan(html.indexOf('Tháp to'))
    expect(html.indexOf('Tháp to')).toBeLessThan(html.indexOf('Tháp nhỏ'))
    const nho = html.slice(html.indexOf('Tháp nhỏ'))
    expect(nho).toContain('Theo cả món (Tiger lon × 3)')
    const to = html.slice(html.indexOf('Tháp to'), html.indexOf('Tháp nhỏ'))
    expect(to).toContain('Tiger lon × 5')
  })

  it('đã gắn: hiện "Tiger lon × 5" và nút Gỡ; ô sẵn hàng + SL đang gắn', () => {
    const html = renderToStaticMarkup(<StockLinkEditor item={plain} stock={stock([
      { menuItemId: 'm-bia', variantId: null, inventoryItemId: 'tiger', qtyPerSale: 5 },
    ])} />)
    expect(html).toContain('Tiger lon × 5')
    expect(html).toContain('>Gỡ<')
    expect(html).toContain('<option value="tiger" selected="">')
    expect(html).toMatch(/value="5"/)
    // SL lẻ: 0,5 hiện "0,5", 24 hiện "24" (không dấu ngăn nghìn để parseQty đọc lại đúng).
    expect(linkSummary(goods, { menuItemId: 'm', variantId: null, inventoryItemId: 'bia', qtyPerSale: 0.5 })).toBe('Bia Hà Nội lon × 0,5')
  })

  it('stock.goods rỗng: chữ "Chưa có hàng bán nguyên — thêm ở trang Kho" và link /admin/inventory', () => {
    const html = renderToStaticMarkup(<StockLinkEditor item={plain} stock={{ goods: [], links: [] }} />)
    expect(html).toContain('Chưa có hàng bán nguyên — thêm ở trang Kho')
    expect(html).toContain('href="/admin/inventory"')
    expect(html).not.toContain('<select')
  })
})

describe('MenuAvailabilityClient', () => {
  const categories = [{ id: 'c', name: 'Bia', menu_items: [
    { id: 'm-bia', name: 'Bia Hà Nội', price: 20000, is_available: true },
    { id: 'm-thap', name: 'Bia tháp', price: 150000, is_available: true, menu_item_variants: thap.menu_item_variants },
  ] }]

  it('MenuAvailabilityClient có stock (quản lý): mỗi món có nút "Trừ kho" cạnh công tắc Tạm hết; không có stock (thu ngân): không có nút', () => {
    const manager = renderToStaticMarkup(<MenuAvailabilityClient categories={categories} stock={stock([
      { menuItemId: 'm-thap', variantId: null, inventoryItemId: 'tiger', qtyPerSale: 3 },
    ])} />)
    expect(manager.match(/>Trừ kho</g)?.length).toBe(2)
    expect(manager).toContain('aria-label="Trừ kho: Bia Hà Nội"')
    expect(manager).toContain('Tiger lon × 3') // dòng phụ của món đang trừ
    expect(manager).toContain('Đang bán')

    const cashier = renderToStaticMarkup(<MenuAvailabilityClient categories={categories} />)
    expect(cashier).not.toContain('Trừ kho')
    expect(cashier).toContain('Đang bán')
    expect(renderToStaticMarkup(<MenuAvailabilityClient categories={categories} stock={null} />)).not.toContain('Trừ kho')
  })
})
