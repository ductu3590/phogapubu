// Payment service — Zalo Checkout SDK
// Thay cho zalopay.service.ts cũ (mô hình openapi đã hỏng — zmp-sdk không có openPayment).
// Luồng: server ký MAC (số tiền server tự lấy từ DB) → mở Payment.createOrder.
// Khi khách bỏ dở hoặc huỷ → sự kiện PaymentDone vẫn bắn → dùng checkTransaction để biết kết quả thật.

import { Payment, events, EventName } from 'zmp-sdk'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export type ZaloPayOutcome = 'success' | 'unpaid' // unpaid = huỷ hoặc thất bại

export const paymentService = {
  /**
   * Mở thanh toán Checkout SDK cho 1 đơn đã tạo (pending).
   * Server tự đọc total_amount từ DB và ký MAC — client không truyền số tiền.
   * Trả về 'success' nếu thanh toán xong, 'unpaid' nếu khách huỷ/thất bại.
   *
   * Ghi chú kỹ thuật:
   * - Payment.createOrder mở sheet ZaloPay; success/fail callback KHÔNG đáng tin khi khách bấm back.
   * - Sự kiện PaymentDone ("action.payment.done") luôn bắn khi khách hoàn tất HOẶC huỷ.
   * - Sau PaymentDone ta gọi checkTransaction để lấy resultCode thật (1 = thành công).
   */
  payWithCheckoutSDK: async (appOrderId: string): Promise<ZaloPayOutcome> => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/checkout-create-mac`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ orderId: appOrderId }),
    })

    const body = await res.json()
    if (!res.ok || body.error) {
      throw new Error(body.error || `Lỗi tạo yêu cầu thanh toán (${res.status})`)
    }

    // Trình duyệt thường (dev): Checkout SDK không chạy trong môi trường Zalo
    if (!(window as Window & { APP_ID?: string }).APP_ID) {
      console.info('[DEV] Checkout SDK chỉ chạy trên Zalo thật. Body đã ký:', body)
      return 'success'
    }

    return await new Promise<ZaloPayOutcome>((resolve) => {
      let settled = false
      let zpOrderId = ''

      // Dọn sự kiện và resolve một lần duy nhất
      const finish = (outcome: ZaloPayOutcome) => {
        if (settled) return
        settled = true
        events.off(EventName.PaymentDone, onPaymentDone)
        console.info('[checkout] outcome:', outcome)
        resolve(outcome)
      }

      // Gọi checkTransaction sau khi PaymentDone bắn để biết kết quả thật
      const onPaymentDone = async () => {
        try {
          if (!zpOrderId) {
            console.warn('[checkout] PaymentDone bắn nhưng chưa có zpOrderId → unpaid')
            finish('unpaid')
            return
          }
          const r = await Payment.checkTransaction({ data: { orderId: zpOrderId } })
          console.info('[checkout] checkTransaction result:', r)
          // resultCode === 1: thanh toán thành công
          finish(Number(r.resultCode) === 1 ? 'success' : 'unpaid')
        } catch (e) {
          console.error('[checkout] checkTransaction lỗi:', e)
          finish('unpaid')
        }
      }

      // Đăng ký lắng nghe PaymentDone TRƯỚC khi mở sheet
      events.on(EventName.PaymentDone, onPaymentDone)

      // Mở sheet ZaloPay — zpOrderId được lưu từ success callback VÀ từ promise resolve
      // (tuỳ SDK version, một trong hai sẽ cung cấp trước)
      Payment.createOrder({
        desc: body.desc,
        item: body.item,
        amount: body.amount,
        extradata: body.extradata,
        method: body.method,
        mac: body.mac,
        success: (r: { orderId?: string }) => {
          if (r?.orderId) {
            zpOrderId = r.orderId
            console.info('[checkout] createOrder success callback, zpOrderId:', zpOrderId)
          }
        },
        fail: () => {
          // fail callback bắn khi có lỗi tạo order (không phải khi khách bấm back)
          // PaymentDone vẫn sẽ bắn sau, nhưng nếu không → fallback về unpaid
          console.warn('[checkout] createOrder fail callback')
          finish('unpaid')
        },
      } as Parameters<typeof Payment.createOrder>[0])
        .then((created: { orderId?: string }) => {
          if (created?.orderId) {
            zpOrderId = created.orderId
            console.info('[checkout] createOrder promise resolved, zpOrderId:', zpOrderId)
          }
        })
        .catch((e: unknown) => {
          console.error('[checkout] createOrder promise rejected:', e)
          finish('unpaid')
        })
    })
  },
}
