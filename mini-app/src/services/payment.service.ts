// Payment service — Zalo Checkout SDK
// Thay cho zalopay.service.ts cũ (mô hình openapi đã hỏng — zmp-sdk không có openPayment).
// Luồng: server ký MAC (số tiền server tự lấy từ DB) → mở Payment.createOrder.
// Khi khách bỏ dở hoặc huỷ → sự kiện PaymentDone vẫn bắn → dùng checkTransaction để biết kết quả thật.

import { Payment, events, EventName } from 'zmp-sdk'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// success = đã trả xong; unpaid = ĐÃ khởi tạo giao dịch nhưng SDK chưa thấy trả (có thể là
// chuyển khoản, notify về trễ → phải chờ webhook); cancelled = khách bỏ ngang khi CHƯA khởi tạo
// giao dịch (bấm back ở màn chọn PT) → không có webhook nào sẽ về, kết luận ngay, khỏi chờ.
export type ZaloPayOutcome = 'success' | 'unpaid' | 'cancelled'

export const paymentService = {
  /**
   * Làm nóng edge function ký MAC (fire-and-forget).
   * Thanh toán thưa nên isolate thường nguội → lần bấm đầu phải chờ ~1-2s cold-start.
   * Gọi trước (khi vào trang checkout) để lúc bấm thanh toán isolate đã sẵn sàng.
   */
  warmupCheckout: async (): Promise<void> => {
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/checkout-create-mac`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ warmup: true }),
      })
    } catch {
      /* chỉ là làm nóng — lỗi mạng bỏ qua, không ảnh hưởng luồng đặt món */
    }
  },

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
            // Không có zpOrderId = khách bấm back trước khi chọn/khởi tạo giao dịch → huỷ ngay
            console.warn('[checkout] PaymentDone bắn nhưng chưa có zpOrderId → cancelled')
            finish('cancelled')
            return
          }
          const r = await Payment.checkTransaction({ data: { orderId: zpOrderId } })
          console.info('[checkout] checkTransaction result:', r)
          // resultCode === 1: thanh toán thành công
          if (Number(r.resultCode) === 1) {
            finish('success')
            return
          }
          // isCustom = phương thức custom (chuyển khoản ngân hàng) — Zalo KHÔNG tự thấy được
          // giao dịch bank→bank, phải chờ webhook server xác nhận → 'unpaid' (chờ).
          // Ngược lại (ví thường / chưa chọn PT rồi bấm back): resultCode≠1 là huỷ THẬT,
          // không webhook nào về → 'cancelled' (kết luận ngay, khỏi chờ 12s).
          finish(r.isCustom ? 'unpaid' : 'cancelled')
        } catch (e) {
          console.error('[checkout] checkTransaction lỗi:', e)
          // Không rõ trạng thái → chờ webhook cho an toàn (tránh huỷ nhầm đơn đã chuyển khoản)
          finish('unpaid')
        }
      }

      // Đăng ký lắng nghe PaymentDone TRƯỚC khi mở sheet
      events.on(EventName.PaymentDone, onPaymentDone)

      // Mở sheet ZaloPay — zpOrderId được lưu từ success callback VÀ từ promise resolve
      // (tuỳ SDK version, một trong hai sẽ cung cấp trước)
      // KHÔNG truyền `method` → Zalo tự mở màn chọn phương thức (ví ZaloPay, chuyển khoản...)
      Payment.createOrder({
        desc: body.desc,
        item: body.item,
        amount: body.amount,
        extradata: body.extradata,
        mac: body.mac,
        success: (r: { orderId?: string }) => {
          if (r?.orderId) {
            zpOrderId = r.orderId
            console.info('[checkout] createOrder success callback, zpOrderId:', zpOrderId)
          }
        },
        fail: () => {
          // fail callback bắn khi có lỗi tạo order (không phải khi khách bấm back)
          // Chưa khởi tạo được giao dịch → không webhook nào về → huỷ ngay, khỏi chờ
          console.warn('[checkout] createOrder fail callback')
          finish('cancelled')
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
          finish('cancelled')
        })
    })
  },
}
