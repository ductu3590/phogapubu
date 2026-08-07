import { describe, it, expect, vi, beforeEach } from 'vitest'

// Bộ nhớ giả cho listener PaymentDone để test tự bắn sự kiện.
// Dùng vi.hoisted() vì vi.mock() bị hoist lên đầu file — nếu khai báo const thường thì factory
// bên dưới sẽ đọc biến trước khi nó được gán (tsconfig repo này target es6, không cho phép
// top-level await để dùng dynamic import() thay thế).
// ⚠️ `events` thật của zmp-sdk là eventemitter3 — NHIỀU listener trên cùng một tên sự kiện.
// Mock phải giữ đúng tính chất đó: bản đầu dùng Map<string, cb> (một slot mỗi tên) nên `on()`
// thứ hai chỉ ghi đè im lặng, và bug cross-talk mà activeFinish sinh ra để chặn KHÔNG BAO GIỜ
// tái hiện được. Dùng mảng + off theo THAM CHIẾU mới kiểm được thật.
const { listeners, checkTransaction, createOrder } = vi.hoisted(() => ({
  listeners: new Map<string, ((data?: unknown) => void)[]>(),
  checkTransaction: vi.fn(),
  createOrder: vi.fn(),
}))

vi.mock('zmp-sdk', () => ({
  Payment: {
    checkTransaction: (...a: unknown[]) => checkTransaction(...a),
    createOrder: (...a: unknown[]) => createOrder(...a),
  },
  events: {
    on: (name: string, cb: (data?: unknown) => void) => {
      listeners.set(name, [...(listeners.get(name) ?? []), cb])
    },
    off: (name: string, cb: (data?: unknown) => void) => {
      listeners.set(name, (listeners.get(name) ?? []).filter((x) => x !== cb))
    },
  },
  EventName: { PaymentDone: 'action.payment.done' },
}))

import { paymentService } from './payment.service'

// Giả lập môi trường Zalo (payment.service bỏ qua SDK khi thiếu window.APP_ID)
;(globalThis as { window?: unknown }).window = { APP_ID: 'test-app' }

function mockMacOk() {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ desc: 'd', item: '[]', amount: 1000, extradata: '{}', mac: 'm' }),
  }) as unknown as typeof fetch
}

function listenerCount() {
  return (listeners.get('action.payment.done') ?? []).length
}

// Bắn cho MỌI listener đang đăng ký — đúng như emitter thật. Copy mảng trước khi lặp vì handler
// sẽ gọi off() ngay trong lúc chạy.
function firePaymentDone(data?: unknown) {
  const cbs = [...(listeners.get('action.payment.done') ?? [])]
  if (cbs.length === 0) throw new Error('listener chưa được đăng ký')
  cbs.forEach((cb) => cb(data))
}

// payWithCheckoutSDK đăng ký listener SAU 2 lượt await (fetch + res.json()) — chờ bằng cách
// polling thay vì đếm tick cứng, để không phụ thuộc số microtask nội bộ của engine.
async function waitForListener() {
  for (let i = 0; i < 50; i++) {
    if (listenerCount() > 0) return
    await new Promise((r) => setTimeout(r, 0))
  }
  throw new Error('listener không được đăng ký kịp')
}

// ⚠️ BẤT BIẾN: mọi test PHẢI để promise của mình settle trước khi kết thúc.
// `activeFinish` là state cấp module trong payment.service.ts và beforeEach KHÔNG reset được nó.
// Một test bỏ promise treo sẽ để lại closure cũ trong activeFinish, và lượt gọi của test KẾ TIẾP
// sẽ âm thầm đóng promise bỏ rơi đó — sinh ràng buộc chéo rất khó lần ra.
beforeEach(() => {
  listeners.clear()
  checkTransaction.mockReset()
  createOrder.mockReset()
  createOrder.mockReturnValue(new Promise(() => {})) // treo, để PaymentDone quyết định
  mockMacOk()
})

describe('payWithCheckoutSDK', () => {
  it('truyền NGUYÊN payload của PaymentDone vào checkTransaction', async () => {
    checkTransaction.mockResolvedValue({ resultCode: 1, isCustom: false })
    const p = paymentService.payWithCheckoutSDK('order-1')
    await waitForListener()
    const payload = { orderId: 'zp-9', extra: 'giữ nguyên' }
    firePaymentDone(payload)
    await expect(p).resolves.toBe('success')
    expect(checkTransaction).toHaveBeenCalledWith({ data: payload })
  })

  it('gỡ listener sau khi xong', async () => {
    checkTransaction.mockResolvedValue({ resultCode: -2 })
    const p = paymentService.payWithCheckoutSDK('order-1')
    await waitForListener()
    firePaymentDone({ orderId: 'zp-9' })
    await expect(p).resolves.toBe('abandoned')
    expect(listenerCount()).toBe(0)
  })

  // Bug này chỉ tái hiện được với mock đa listener: `events` là emitter TOÀN CỤC, hai lượt gọi
  // chồng nhau sẽ cùng nghe một PaymentDone và nhận kết quả của nhau.
  it('lượt gọi mới tiếp quản: lượt cũ đóng an toàn, chỉ còn MỘT listener sống', async () => {
    checkTransaction.mockResolvedValue({ resultCode: 1, isCustom: false })

    const pA = paymentService.payWithCheckoutSDK('order-A')
    await waitForListener()
    expect(listenerCount()).toBe(1)

    // B tiếp quản. A phải tự đóng bằng 'pending_confirm' — KHÔNG cần bắn sự kiện nào,
    // và không được kết luận A "chưa trả tiền".
    const pB = paymentService.payWithCheckoutSDK('order-B')
    await expect(pA).resolves.toBe('pending_confirm')

    // Listener của A đã bị gỡ đúng theo tham chiếu, chỉ còn của B
    expect(listenerCount()).toBe(1)

    firePaymentDone({ orderId: 'zp-B' })
    await expect(pB).resolves.toBe('success')

    // Chốt hạ: nếu listener của A còn sống thì checkTransaction bị gọi 2 lần và A nhận
    // nhầm kết quả của B. Đây là assertion thật sự bắt được cross-talk.
    expect(checkTransaction).toHaveBeenCalledTimes(1)
  })

  it('checkTransaction ném lỗi → pending_confirm, KHÔNG kết luận chưa trả tiền', async () => {
    checkTransaction.mockRejectedValue(new Error('mạng lỗi'))
    const p = paymentService.payWithCheckoutSDK('order-1')
    await waitForListener()
    firePaymentDone({ orderId: 'zp-9' })
    await expect(p).resolves.toBe('pending_confirm')
  })

  it('PaymentDone không kèm data → pending_confirm', async () => {
    const p = paymentService.payWithCheckoutSDK('order-1')
    await waitForListener()
    firePaymentDone(undefined)
    await expect(p).resolves.toBe('pending_confirm')
    expect(checkTransaction).not.toHaveBeenCalled()
  })

  it('createOrder gọi callback fail → failed', async () => {
    createOrder.mockImplementation((args: { fail: () => void }) => {
      args.fail()
      return new Promise(() => {})
    })
    await expect(paymentService.payWithCheckoutSDK('order-1')).resolves.toBe('failed')
  })

  it('createOrder promise reject → failed', async () => {
    createOrder.mockReturnValue(Promise.reject(new Error('hỏng')))
    await expect(paymentService.payWithCheckoutSDK('order-1')).resolves.toBe('failed')
  })

  it('lấy MAC lỗi 409 → NÉM lỗi để caller đối chiếu DB, không tự kết luận', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'Đơn không ở trạng thái chờ thanh toán' }),
    }) as unknown as typeof fetch
    await expect(paymentService.payWithCheckoutSDK('order-1')).rejects.toThrow(
      'Đơn không ở trạng thái chờ thanh toán',
    )
  })
})
