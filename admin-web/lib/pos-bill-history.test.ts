import { describe, expect, it } from 'vitest'
import { billHistory, rejectReasonLabel } from './pos-bill-history'

const s = (id: string, orders: { id: string; created_at: string; status?: string }[], rejected: { id: string; created_at: string; rejection_reason_code?: string | null; rejection_reason_note?: string | null }[] = []) => ({
  session_id: id,
  orders: orders.map((o) => ({ status: 'confirmed', ...o })),
  rejected_orders: rejected.map((o) => ({ status: 'cancelled', ...o })),
})

describe('billHistory — tab Lịch sử ghi ĐẦY ĐỦ, kể cả lượt bị từ chối', () => {
  it('gộp lượt thường + lượt bị từ chối, mới nhất trên cùng', () => {
    const rows = billHistory([s('s1', [{ id: 'a', created_at: '2026-10-05T10:00:00Z' }], [{ id: 'r', created_at: '2026-10-05T10:30:00Z', rejection_reason_code: 'out_of_stock' }])])
    expect(rows.map((r) => r.o.id)).toEqual(['r', 'a'])
    expect(rows[0].rejected).toBe(true)
    expect(rows[1].rejected).toBe(false)
  })
  it('phiên cũ chưa có trường rejected_orders (server trước mig 089) vẫn chạy', () => {
    const rows = billHistory([{ session_id: 's1', orders: [{ id: 'a', status: 'confirmed', created_at: '2026-10-05T10:00:00Z' }] }])
    expect(rows).toHaveLength(1)
  })
})

describe('rejectReasonLabel — cùng chữ với hộp chọn lý do từ chối', () => {
  it('mã chuẩn', () => {
    expect(rejectReasonLabel('out_of_stock', null)).toBe('Hết đồ')
    expect(rejectReasonLabel('customer_requested', null)).toBe('Khách yêu cầu huỷ')
  })
  it('lý do khác lấy nội dung tự nhập', () => {
    expect(rejectReasonLabel('other', ' Bàn đổi ý ')).toBe('Bàn đổi ý')
    expect(rejectReasonLabel('other', null)).toBe('Lý do khác')
    expect(rejectReasonLabel(null, null)).toBeNull()
  })
})
