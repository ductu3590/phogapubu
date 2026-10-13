import { describe, expect, it } from 'vitest'
import { percentOf, summarizeReservationHistory, toReservationHistoryRows, type ReservationHistoryRpcRow } from './reservation-history'

function rpc(overrides: Partial<ReservationHistoryRpcRow>): ReservationHistoryRpcRow {
  return {
    reservation_id: 'r', status: 'completed', customer_name: 'A', customer_phone: '0900000000',
    party_size: 4, arrival_at: '2026-10-01T12:00:00.000Z', note: null, session_closed: true, table_numbers: ['Bàn 10', 'Bàn 2'],
    ...overrides,
  }
}

describe('lịch sử đặt bàn', () => {
  it('đã đến + bill đóng tính là Hoàn tất; bàn xếp theo số', () => {
    const [row] = toReservationHistoryRows([rpc({ status: 'arrived' })])
    expect(row.outcome).toBe('done')
    expect(row.tableNumbers).toEqual(['Bàn 2', 'Bàn 10'])
  })

  it('bỏ qua trạng thái chưa kết thúc nếu lỡ lọt vào', () => {
    expect(toReservationHistoryRows([rpc({ status: 'pending' }), rpc({ status: 'confirmed' })])).toEqual([])
  })

  it('thống kê: khách chỉ đếm lượt đã đến; huỷ gộp khách huỷ, quán huỷ, từ chối', () => {
    const rows = toReservationHistoryRows([
      rpc({ reservation_id: '1', status: 'completed', party_size: 10 }),
      rpc({ reservation_id: '2', status: 'arrived', party_size: 6 }),
      rpc({ reservation_id: '3', status: 'no_show', party_size: 20 }),
      rpc({ reservation_id: '4', status: 'cancelled_by_customer' }),
      rpc({ reservation_id: '5', status: 'cancelled_by_store' }),
      rpc({ reservation_id: '6', status: 'rejected' }),
    ])
    expect(summarizeReservationHistory(rows)).toEqual({ total: 6, guests: 16, done: 2, noShow: 1, cancelled: 3 })
  })

  it('phần trăm không chia cho 0', () => {
    expect(percentOf(0, 0)).toBe(0)
    expect(percentOf(3, 29)).toBe(10)
  })
})
