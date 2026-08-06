// Payment service — Zalo Checkout SDK
// Luồng: server ký MAC (số tiền server tự lấy từ DB) → mở Payment.createOrder.
// Sự kiện PaymentDone bắn khi khách hoàn tất HOẶC thoát; nó truyền `data`, đưa thẳng `data` đó
// vào checkTransaction để lấy resultCode thật (tài liệu Zalo, SDK ≥ 2.45 — mình đang ở 2.49.4).
// Phân loại resultCode nằm ở ./checkout-result.ts (thuần, có test).
//
// ⚠️ Hàm này NÉM lỗi khi không lấy được MAC (mạng lỗi, hoặc 409 vì đơn không còn 'pending').
// Caller PHẢI bắt và đối chiếu lại với DB — tuyệt đối không coi lỗi là "đã thanh toán xong".

import { Payment, events, EventName } from 'zmp-sdk'
import { mapCheckoutResult, CheckoutOutcome, TransactionResult } from './checkout-result'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Chỉ cho phép MỘT phiên thanh toán tại một thời điểm. `events` của zmp-sdk là emitter TOÀN CỤC:
// hai lần gọi chồng nhau sẽ cùng nghe một sự kiện PaymentDone và nhận kết quả của nhau.
// Gọi mới sẽ đóng phiên cũ bằng 'pending_confirm' (an toàn — không kết luận gì) rồi tiếp quản.
// KHÔNG chặn lượt gọi mới: nếu PaymentDone không bao giờ bắn, khoá cứng sẽ giết luôn nút
// "Thanh toán lại" của khách.
let activeFinish: ((outcome: CheckoutOutcome) => void) | null = null

export type { CheckoutOutcome }

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
   * Trả về CheckoutOutcome — xem ./checkout-result.ts. 'abandoned'/'failed' là hai trạng thái
   * duy nhất đủ chắc chắn để nói với khách "chưa thanh toán".
   * NÉM lỗi nếu không lấy được MAC — caller phải đối chiếu DB, không được xoá giỏ hàng.
   *
   * Ghi chú kỹ thuật:
   * - Payment.createOrder mở sheet ZaloPay; success/fail callback KHÔNG đáng tin khi khách bấm back.
   * - Sự kiện PaymentDone ("action.payment.done") luôn bắn khi khách hoàn tất HOẶC huỷ.
   * - Sau PaymentDone ta gọi checkTransaction để lấy resultCode thật (1 = thành công).
   */
  payWithCheckoutSDK: async (appOrderId: string): Promise<CheckoutOutcome> => {
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

    return await new Promise<CheckoutOutcome>((resolve) => {
      let settled = false

      // Dọn listener và resolve đúng một lần
      const finish = (outcome: CheckoutOutcome) => {
        if (settled) return
        settled = true
        if (activeFinish === finish) activeFinish = null
        events.off(EventName.PaymentDone, onPaymentDone)
        console.info('[checkout] outcome:', outcome)
        resolve(outcome)
      }

      // PaymentDone truyền `data` — đưa THẲNG vào checkTransaction theo đúng tài liệu Zalo.
      const onPaymentDone = async (data?: unknown) => {
        try {
          if (!data) {
            // Không có payload → không đủ căn cứ. Chờ webhook cho an toàn.
            console.warn('[checkout] PaymentDone không kèm data → pending_confirm')
            finish('pending_confirm')
            return
          }
          const r = await Payment.checkTransaction({ data } as Parameters<
            typeof Payment.checkTransaction
          >[0])
          console.info('[checkout] checkTransaction result:', r)
          finish(mapCheckoutResult(r))
        } catch (e) {
          console.error('[checkout] checkTransaction lỗi:', e)
          finish('pending_confirm')
        }
      }

      // Đóng phiên trước đó (nếu còn treo) trước khi tiếp quản listener
      activeFinish?.('pending_confirm')
      activeFinish = finish

      // Đăng ký lắng nghe TRƯỚC khi mở sheet
      events.on(EventName.PaymentDone, onPaymentDone)

      // KHÔNG truyền `method` → Zalo tự mở màn chọn phương thức thanh toán
      Payment.createOrder({
        desc: body.desc,
        item: body.item,
        amount: body.amount,
        extradata: body.extradata,
        mac: body.mac,
        fail: () => {
          // Lỗi tạo giao dịch — sheet chưa mở nên chắc chắn chưa mất tiền
          console.warn('[checkout] createOrder fail callback')
          finish('failed')
        },
      } as Parameters<typeof Payment.createOrder>[0]).catch((e: unknown) => {
        console.error('[checkout] createOrder promise rejected:', e)
        finish('failed')
      })
    })
  },
}
