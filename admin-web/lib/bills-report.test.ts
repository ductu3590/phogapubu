import { describe, expect, it } from 'vitest'
import {
  billCode,
  buildBillRows,
  chipCounts,
  filterBillRows,
  normalizeSearch,
  paginate,
  startedLabel,
  parseBillsReport,
  type BillsReport,
} from './bills-report'

const S1 = '00000000-0000-0000-0000-00000000a3ef'
const S2 = '00000000-0000-0000-0000-0000000000b2'
const O1 = '71ecd8a3-d8a4-4ae1-8ba3-6064a9cd3f4b'

const raw = {
  date: '2026-10-12',
  totals: { revenue: 300000, cash: 200000, bank: 100000, other: 0, bills_count: 2 },
  open: { tables_count: 1, provisional_total: 150000 },
  bills: [
    {
      key: 'C:x@1', paid_at: '2026-10-12T14:30:00Z', opened_at: '2026-10-12T13:00:00Z', session_ids: [S1, S2], order_ids: [O1],
      merged: true, tables_count: 2, total: 200000, discount_total: 0, instrument: 'cash', order_type: 'dine_in',
      items_count: 8, table_label: 'Bàn 9, Bàn 10', customer_name: 'Đoàn Anh Tú', party_size: 12, adjustments_count: 1,
      received_by_name: 'Thu ngân Lan',
    },
    {
      key: 'O:y', paid_at: '2026-10-12T12:10:00Z', opened_at: '2026-10-12T12:00:00Z', session_ids: [], order_ids: ['aaaaaaaa-0000-0000-0000-0000001234ab'],
      merged: false, tables_count: 0, total: 100000, discount_total: 10000, instrument: 'bank', order_type: 'pickup',
      items_count: 2, table_label: 'Mang về', customer_name: 'Chị Hoa', party_size: null, adjustments_count: 0, received_by_name: null,
    },
  ],
  waiting: [
    {
      key: 'S:z', session_ids: ['00000000-0000-0000-0000-0000000c0ffe'], order_ids: [], opened_at: '2026-10-12T07:30:00Z',
      is_tray: false, expired: true, tables_count: 1, table_label: 'Bàn 2', order_type: 'dine_in', customer_name: null,
      party_size: null, items_count: 6, provisional_total: 833000,
    },
  ],
  cancelled: [
    {
      order_id: 'f54f2562-f5bf-4752-a937-c8c9f1da5382', session_id: null, at: '2026-10-12T14:31:00Z', created_at: '2026-10-12T14:30:00Z',
      kind: 'rejected', reason_code: 'out_of_stock', reason_note: null, total: 20000, order_type: 'dine_in', order_source: 'customer',
      customer_name: null, table_label: 'Bàn 3',
    },
  ],
  adjustments: [
    {
      at: '2026-10-12T14:00:00Z', type: 'quantity', item_name: 'Bia hơi', quantity: 4, old_quantity: 6, new_quantity: 4,
      amount: -24000, reason: 'Bấm nhầm', table_label: 'Bàn 9', by_name: 'Thu ngân Lan',
    },
  ],
}

const report: BillsReport = parseBillsReport(raw)
const rows = buildBillRows(report)

describe('parseBillsReport (A04-1)', () => {
  it('đổi tên trường + giữ số liệu server, không tự cộng trừ', () => {
    expect(report.totals).toEqual({ revenue: 300000, cash: 200000, bank: 100000, other: 0, billsCount: 2 })
    expect(report.open).toEqual({ tablesCount: 1, provisionalTotal: 150000 })
    expect(report.bills[0].sessionIds).toEqual([S1, S2])
    expect(report.waiting[0].expired).toBe(true)
    expect(report.cancelled[0].kind).toBe('rejected')
    expect(report.adjustments[0]).toMatchObject({ type: 'quantity', oldQuantity: 6, newQuantity: 4, amount: -24000 })
  })

  it('dữ liệu hỏng / thiếu → giá trị an toàn, không ném lỗi', () => {
    const empty = parseBillsReport(null)
    expect(empty.bills).toEqual([])
    expect(empty.waiting).toEqual([])
    expect(empty.totals.revenue).toBe(0)
    const bad = parseBillsReport({ bills: [{ total: 'abc', instrument: 'zzz' }], adjustments: [{ type: 'lạ' }] })
    expect(bad.bills[0].total).toBe(0)
    expect(bad.bills[0].instrument).toBe('other')
    expect(bad.bills[0].tableLabel).toBe('—')
    expect(bad.adjustments[0].type).toBe('cancelled')
  })
})

describe('billCode (A04-1 — mã rút gọn, chưa có số hoá đơn thật)', () => {
  it('bill theo phiên: 6 ký tự cuối của ID phiên nhỏ nhất, viết hoa', () => {
    expect(billCode([S1, S2], [O1])).toBe('#0000B2')
  })
  it('đơn không phiên: 6 ký tự cuối ID đơn — trùng mã trang Đơn hàng cũ', () => {
    expect(billCode([], [O1])).toBe('#CD3F4B')
  })
  it('không có ID nào → "—"', () => {
    expect(billCode([], [])).toBe('—')
  })
})

describe('buildBillRows (A04-1)', () => {
  it('dòng chờ thu lên đầu, sau đó bill/đơn huỷ theo giờ mới nhất', () => {
    expect(rows.map((r) => r.kind)).toEqual(['waiting', 'cancelled', 'paid', 'paid'])
  })
  it('bill gộp: nhãn Ghép, có khách đặt bàn + số khách, đánh dấu có điều chỉnh', () => {
    const merged = rows.find((r) => r.key === 'C:x@1')!
    expect(merged).toMatchObject({ grouped: true, customerName: 'Đoàn Anh Tú', partySize: 12, adjusted: true, amount: 200000, itemsCount: 8 })
  })
  it('đơn có giảm giá voucher cũng tính là "giảm trừ"', () => {
    expect(rows.find((r) => r.key === 'O:y')!.adjusted).toBe(true)
  })
  it('chờ thu hết hạn: số tiền = tạm tính, cờ expired', () => {
    expect(rows.find((r) => r.kind === 'waiting')).toMatchObject({ amount: 833000, expired: true, tableLabel: 'Bàn 2' })
  })
  it('đơn bị từ chối: lý do đọc thành chữ', () => {
    expect(rows.find((r) => r.kind === 'cancelled')).toMatchObject({ reasonText: 'Hết đồ', amount: 20000, code: '#DA5382' })
  })
})

describe('chip + tìm kiếm + phân trang (A04-1)', () => {
  it('đếm chip: Đã huỷ/giảm trừ = đơn huỷ + bill có điều chỉnh/giảm giá', () => {
    expect(chipCounts(rows)).toEqual({ all: 4, paid: 2, adjusted: 3, waiting: 1 })
  })
  it('lọc theo chip', () => {
    expect(filterBillRows(rows, 'waiting', '').map((r) => r.kind)).toEqual(['waiting'])
    expect(filterBillRows(rows, 'paid', '').every((r) => r.kind === 'paid')).toBe(true)
  })
  it('tìm không dấu theo bàn, mã, tên khách', () => {
    expect(filterBillRows(rows, 'all', 'ban 10').map((r) => r.key)).toEqual(['C:x@1'])
    expect(filterBillRows(rows, 'all', '1234ab').map((r) => r.key)).toEqual(['O:y'])
    expect(filterBillRows(rows, 'all', '#da5382').map((r) => r.kind)).toEqual(['cancelled'])
    expect(filterBillRows(rows, 'all', 'chi hoa').map((r) => r.key)).toEqual(['O:y'])
    expect(filterBillRows(rows, 'all', 'ĐOÀN').map((r) => r.key)).toEqual(['C:x@1'])
    expect(filterBillRows(rows, 'all', '   ')).toHaveLength(4)
  })
  it('normalizeSearch bỏ dấu tiếng Việt kể cả chữ đ', () => {
    expect(normalizeSearch('  Đoàn Nghệ An ')).toBe('doan nghe an')
  })
  it('phân trang 20 dòng, trang vượt quá thì kéo về trang cuối', () => {
    const many = Array.from({ length: 45 }, (_, i) => i)
    expect(paginate(many, 1)).toMatchObject({ page: 1, pageCount: 3, total: 45, from: 1, to: 20 })
    expect(paginate(many, 3).items).toEqual(many.slice(40))
    expect(paginate(many, 9)).toMatchObject({ page: 3, from: 41, to: 45 })
    expect(paginate([], 1)).toMatchObject({ page: 1, pageCount: 1, total: 0, from: 0, to: 0, items: [] })
  })
})

describe('startedLabel — giờ vào kèm ngày khi khác ngày đang xem (A04-2)', () => {
  it('cùng ngày (giờ VN) → chỉ giờ', () => {
    expect(startedLabel('2026-10-12T07:30:00Z', '2026-10-12')).toBe('14:30')
  })
  it('vào hôm trước, thu hôm nay → kèm ngày/tháng', () => {
    expect(startedLabel('2026-10-12T07:30:00Z', '2026-10-13')).toBe('12/10 14:30')
  })
  it('qua nửa đêm giờ VN (17:30Z = 00:30 hôm sau) tính theo giờ VN, không theo UTC', () => {
    expect(startedLabel('2026-10-12T17:30:00Z', '2026-10-13')).toBe('00:30')
  })
  it('rỗng → "—"', () => {
    expect(startedLabel('', '2026-10-13')).toBe('—')
  })
})
