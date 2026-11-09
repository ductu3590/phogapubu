import { describe, expect, it } from 'vitest'
import { buildBillQr, paymentQrAmount, pickBillQr } from './bill-qr'

const bank = { bank_bin: '970436', bank_account_number: '0011001234567', bank_account_name: 'DO DUC TU' }
const ID = '11111111-2222-3333-4444-555555a1b2c3'
const open = (over = {}) => ({ session_id: ID, table_number: 'Bàn 12', total: 155000, unpaid_total: 155000, orders: [], ...over })

describe('buildBillQr', () => {
  it('ra đúng mẫu độc lập ở Task 1', () => {
    expect(buildBillQr({ bank, amount: 155000, sessions: [{ sessionId: ID, tableLabel: 'Bàn 12' }] })).toEqual({
      payload: '00020101021238570010A00000072701270006970436011300110012345670208QRIBFTTA530370454061550005802VN62170813BAN 12 A1B2C363047A8C',
      amount: 155000, memo: 'BAN 12 A1B2C3', bankName: 'Vietcombank', accountNumber: '0011001234567', accountName: 'DO DUC TU',
    })
  })
  it('gộp bill: thứ tự đầu vào không đổi nội dung, mã lấy theo phiên nhỏ nhất như A04', () => {
    const a = { sessionId: '00000000-0000-0000-0000-000000a1b2c3', tableLabel: 'Bàn 1' }
    const b = { sessionId: 'ffffffff-0000-0000-0000-000000000002', tableLabel: 'Bàn 2' }
    expect(buildBillQr({ bank, amount: 1000, sessions: [b, a] })?.memo).toBe('BAN 1 BAN 2 A1B2C3')
    expect(buildBillQr({ bank, amount: 1000, sessions: [a, b] })?.memo).toBe('BAN 1 BAN 2 A1B2C3')
  })
  it.each([0, -1000, 1.5])('số tiền %s thì không có QR', (amount) => {
    expect(buildBillQr({ bank, amount, sessions: [{ sessionId: ID, tableLabel: 'Bàn 12' }] })).toBeNull()
  })
  it('chưa có tài khoản thì không có QR', () => {
    expect(buildBillQr({ bank: null, amount: 1000, sessions: [{ sessionId: ID, tableLabel: 'Bàn 12' }] })).toBeNull()
  })
  it('không có phiên thì không có QR', () => expect(buildBillQr({ bank, amount: 1000, sessions: [] })).toBeNull())
})

describe('paymentQrAmount', () => {
  it('tiền mặt: 0', () => expect(paymentQrAmount({ method: 'cash', total: 100000, bankPart: 0 })).toBe(0))
  it('chuyển khoản: số cần thu', () => expect(paymentQrAmount({ method: 'bank', total: 100000, bankPart: 0 })).toBe(100000))
  it('kết hợp: phần chuyển khoản', () => expect(paymentQrAmount({ method: 'mixed', total: 100000, bankPart: 40000 })).toBe(40000))
  it('ghi nợ cả bill: 0', () => expect(paymentQrAmount({ method: 'debt', total: 100000, bankPart: 0 })).toBe(0))
  // Kết hợp + ghi nợ phần còn lại (mig 123): QR chỉ cho phần chuyển khoản, không phải cả bill hay phần nợ.
  it('kết hợp + nợ phần còn lại: chỉ phần chuyển khoản', () => expect(paymentQrAmount({ method: 'mixed', total: 1_000_000, bankPart: 300_000 })).toBe(300_000))
  it('màn Thanh toán đang lỗi chia khoản: 0 (kể cả chuyển khoản cả bill)', () => {
    expect(paymentQrAmount({ method: 'mixed', total: 1_000_000, bankPart: 300_000, draftError: 'Tiền mặt và chuyển khoản vượt số cần thu 1.000.000đ' })).toBe(0)
    expect(paymentQrAmount({ method: 'bank', total: 1_000_000, bankPart: 1_000_000, draftError: 'x' })).toBe(0)
    expect(paymentQrAmount({ method: 'bank', total: 1_000_000, bankPart: 1_000_000, draftError: null })).toBe(1_000_000)
  })
  it.each([0, 100001])('kết hợp, phần CK %s: 0', (bankPart) => {
    expect(paymentQrAmount({ method: 'mixed', total: 100000, bankPart })).toBe(0)
  })
})

describe('pickBillQr', () => {
  it('bill có đơn đã thu trước: số trong QR là phần chưa thu sau giảm giá', () => {
    const s = open({ total: 200000, unpaid_total: 155000, bill_discount_type: 'percent', bill_discount_value: 10 })
    expect(pickBillQr({ sessionIds: [ID], openSessions: [s], bank })?.amount).toBe(139500)
  })
  it('bill đã thu: không còn trong danh sách mở thì không có QR', () => {
    expect(pickBillQr({ sessionIds: [ID], openSessions: [], bank })).toBeNull()
  })
  it('gộp bill có một mâm đã thu: không có QR', () => {
    expect(pickBillQr({ sessionIds: [ID, 'khac'], openSessions: [open()], bank })).toBeNull()
  })
  it('phiên hết hạn còn nợ vẫn có QR, không giảm giá', () => {
    expect(pickBillQr({ sessionIds: [ID], openSessions: [open({ bill_discount_type: null, bill_discount_value: null })], bank })?.amount).toBe(155000)
  })
  it('giảm giá lỗi: không có QR', () => {
    const s = open({ unpaid_total: 50000, total: 50000, bill_discount_type: 'amount', bill_discount_value: 80000 })
    expect(pickBillQr({ sessionIds: [ID], openSessions: [s], bank })).toBeNull()
  })
  it('còn đơn khách gọi chờ thu ngân duyệt: không có QR (đơn có thể bị từ chối sau khi khách đã chuyển khoản)', () => {
    const s = open({ orders: [{ status: 'confirmed', order_source: 'customer' }, { status: 'pending', order_source: 'customer' }] })
    expect(pickBillQr({ sessionIds: [ID], openSessions: [s], bank })).toBeNull()
  })
  it('đơn pending ghi tay / đặt trước không phải chờ duyệt: vẫn có QR', () => {
    const s = open({ orders: [{ status: 'pending', order_source: 'pos' }, { status: 'pending', order_source: 'reservation_preorder' }, { status: 'confirmed', order_source: 'customer' }] })
    expect(pickBillQr({ sessionIds: [ID], openSessions: [s], bank })?.amount).toBe(155000)
  })
  it('gộp bill: một mâm còn đơn chờ duyệt thì cả bill không có QR', () => {
    const a = open()
    const b = open({ session_id: 'b', orders: [{ status: 'pending', order_source: 'staff' }] })
    expect(pickBillQr({ sessionIds: [ID, 'b'], openSessions: [a, b], bank })).toBeNull()
  })
  it('thiếu danh sách đơn (dữ liệu không đầy đủ): không có QR (fail closed)', () => {
    const { orders: _omit, ...noOrders } = open()
    void _omit
    expect(pickBillQr({ sessionIds: [ID], openSessions: [noOrders as never], bank })).toBeNull()
  })
  it('giảm 100%: không có QR', () => {
    expect(pickBillQr({ sessionIds: [ID], openSessions: [open({ bill_discount_type: 'percent', bill_discount_value: 100 })], bank })).toBeNull()
  })
})
