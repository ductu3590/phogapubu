import { describe, expect, it } from 'vitest'
import { buildTestBill } from './test-bill'

const now = new Date('2026-10-09T12:00:00.000Z')

describe('buildTestBill', () => {
  it('dùng tên/địa chỉ/SĐT thật của quán, 2 món mẫu, tổng khớp', () => {
    const b = buildTestBill({ name: 'Bia lẩu Bảo Lương', address: ' 236 Bảo Lương ', phone: '0826325523' }, now)
    expect(b.store).toEqual({ name: 'Bia lẩu Bảo Lương', address: '236 Bảo Lương', phone: '0826325523' })
    expect(b.printed_at).toBe('2026-10-09T12:00:00.000Z')
    expect(b.sessions).toHaveLength(1)
    const items = b.sessions[0].items
    expect(items).toHaveLength(2)
    for (const it of items) expect(it.line_total).toBe(it.quantity * it.price)
    const sum = items.reduce((n, it) => n + it.line_total, 0)
    expect(b.sessions[0].subtotal).toBe(sum)
    expect(b.grand_total).toBe(sum)
  })

  it('quán chưa nhập địa chỉ/SĐT/tên → null / "Quán", không phải chuỗi rỗng', () => {
    const b = buildTestBill({ name: null, address: '  ', phone: '' }, now)
    expect(b.store).toEqual({ name: 'Quán', address: null, phone: null })
  })
})
