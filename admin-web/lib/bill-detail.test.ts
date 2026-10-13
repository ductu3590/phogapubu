import { describe, expect, it } from 'vitest'
import { orderActions, parseBillDetail } from './bill-detail'

const base = {
  id: '71ecd8a3-d8a4-4ae1-8ba3-6064a9cd3f4b', status: 'confirmed', total_amount: 140000, discount_amount: 0,
  payment_method: 'cash', payment_instrument: null, payment_received_at: null, zalopay_trans_id: null,
  bank_handoff_at: null, session_id: null, order_source: 'staff', order_type: 'dine_in',
  created_at: '2026-10-12T08:01:24Z', note: null, customer_name: null, customer_phone: null, delivery_address: null,
  rejected_at: null, rejection_reason_code: null, rejection_reason_note: null,
  tables: { table_number: 'Bàn 2' }, vouchers: null,
  order_items: [
    { id: 'i1', item_name: 'Trâu xào tỏi', item_price: 150000, quantity: 1, selected_toppings: null, void_type: null, void_reason: null, note: 'ít cay' },
    { id: 'i2', item_name: 'Bia hơi (Cốc)', item_price: 10000, quantity: 3, selected_toppings: [{ id: 't', name: 'Đá', price: 2000 }], void_type: null, void_reason: null, note: null },
    { id: 'i3', item_name: 'Rau rừng', item_price: 50000, quantity: 1, selected_toppings: null, void_type: 'gift', void_reason: 'Khách quen', note: null },
  ],
}

describe('parseBillDetail (A04-2)', () => {
  const [o] = parseBillDetail([base], [])

  it('mã + bàn + nhãn trạng thái tiếng Việt', () => {
    expect(o).toMatchObject({ code: '#CD3F4B', tableLabel: 'Bàn 2', statusLabel: 'Đã xác nhận', total: 140000 })
    expect(o.tags.map((t) => t.label)).toEqual(['Nhân viên đặt', 'Tại bàn'])
  })

  it('dòng món: (giá + topping) × số lượng; dòng Bỏ/Tặng = 0đ kèm lý do', () => {
    expect(o.items[0]).toMatchObject({ name: 'Trâu xào tỏi', unitPrice: 150000, lineTotal: 150000, note: 'ít cay' })
    expect(o.items[1]).toMatchObject({ unitPrice: 12000, lineTotal: 36000, toppings: ['Đá'] })
    expect(o.items[2]).toMatchObject({ voidType: 'gift', voidReason: 'Khách quen', lineTotal: 0 })
  })

  it('nhãn thanh toán dùng chung paymentBadge: đơn phiên trả sau ghi "Trả sau · chưa thu"', () => {
    expect(o.payment.label).toBe('Tiền mặt · chưa thu')
    const [s] = parseBillDetail([{ ...base, session_id: 'sess' }], [])
    expect(s.payment.label).toBe('Trả sau · chưa thu')
    expect(s.inSession).toBe(true)
  })

  it('đơn bị từ chối: lý do đọc thành chữ; giảm giá + mã voucher', () => {
    const [r] = parseBillDetail([{ ...base, status: 'cancelled', rejected_at: '2026-10-12T09:00:00Z', rejection_reason_code: 'out_of_stock' }], [])
    expect(r).toMatchObject({ rejected: true, rejectReason: 'Hết đồ', statusLabel: 'Đã huỷ' })
    const [v] = parseBillDetail([{ ...base, discount_amount: 10000, vouchers: { code: 'SHIP-ABC123' } }], [])
    expect(v).toMatchObject({ discount: 10000, voucherCode: 'SHIP-ABC123' })
  })

  it('gắn kết quả vòng quay theo order_id', () => {
    const [w] = parseBillDetail([base], [{ id: 'sp1', order_id: base.id, reward_label: 'Tặng 1 đĩa lạc', reward_type: 'gift', status: 'won' }])
    expect(w.spin).toEqual({ id: 'sp1', label: 'Tặng 1 đĩa lạc', type: 'gift', status: 'won' })
  })

  it('dữ liệu hỏng → không ném lỗi', () => {
    expect(parseBillDetail([null, { id: 'x' }], null)).toHaveLength(2)
    expect(parseBillDetail(null, null)).toEqual([])
  })
})

describe('orderActions — giữ đúng luật trang Đơn hàng cũ (A04-2)', () => {
  const money = (o: Record<string, unknown>) => ({ ...base, ...o }) as unknown as Parameters<typeof orderActions>[0]

  it('tiền mặt chưa thu, đang xử lý → Đã nhận tiền + Hoàn tất + Huỷ đơn', () => {
    expect(orderActions(money({}), null)).toEqual({ confirm: true, complete: true, cancel: true, redeem: false })
  })

  it('đã nhận tiền → không còn Đã nhận tiền, KHÔNG được huỷ (huỷ đơn đã thu là lỗ đối soát)', () => {
    expect(orderActions(money({ payment_received_at: '2026-10-12T09:00:00Z' }), null)).toEqual({ confirm: false, complete: true, cancel: false, redeem: false })
  })

  it('ví đã tự xác nhận (wallet) chưa có tiền → không có Đã nhận tiền', () => {
    expect(orderActions(money({ payment_method: 'zalo_checkout', payment_instrument: 'wallet' }), null).confirm).toBe(false)
  })

  it('đơn đã hoàn tất / đã huỷ → không có nút nào (trừ đổi thưởng)', () => {
    expect(orderActions(money({ status: 'paid' }), null)).toEqual({ confirm: false, complete: false, cancel: false, redeem: false })
    expect(orderActions(money({ status: 'cancelled' }), null)).toEqual({ confirm: false, complete: false, cancel: false, redeem: false })
    expect(orderActions(money({ status: 'paid' }), { id: 's', label: 'Quà', type: 'gift', status: 'won' }).redeem).toBe(true)
  })

  it('lượt thuộc PHIÊN BÀN trả sau: KHÔNG thu/hoàn tất từng lượt (thu cả bàn một lần), vẫn huỷ được lượt chưa có tiền', () => {
    expect(orderActions(money({ session_id: 'sess' }), null)).toEqual({ confirm: false, complete: false, cancel: true, redeem: false })
  })

  it('đổi thưởng chỉ khi là quà hiện vật và còn "won"', () => {
    expect(orderActions(money({}), { id: 's', label: 'Giảm 10%', type: 'voucher', status: 'won' }).redeem).toBe(false)
    expect(orderActions(money({}), { id: 's', label: 'Quà', type: 'gift', status: 'redeemed' }).redeem).toBe(false)
  })
})
