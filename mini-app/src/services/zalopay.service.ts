// ZaloPay payment service — Sprint 2
// Tích hợp thanh toán ZaloPay trong Zalo Mini App

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const zalopayService = {
  /**
   * Gọi Supabase Edge Function để tạo ZaloPay order → nhận zp_trans_token
   * ZaloPay API trả về: { return_code: 1, zp_trans_token: "...", ... }
   */
  createPaymentToken: async (orderId: string, amount: number): Promise<string> => {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/zalopay-create-order`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ orderId, amount }),
      },
    )

    if (!response.ok) {
      throw new Error(`Edge function lỗi: ${response.status}`)
    }

    const data = await response.json()

    // ZaloPay trả về return_code = 1 khi thành công
    if (data.return_code !== 1) {
      throw new Error(data.return_message || 'ZaloPay từ chối tạo giao dịch')
    }

    return data.zp_trans_token as string
  },

  /**
   * Mở ZaloPay payment sheet trong Zalo Mini App.
   * Kết quả thanh toán thực được xác nhận qua backend callback (zalopay-callback).
   * Promise resolve khi user đóng payment sheet (dù thành công hay huỷ).
   * Promise reject nếu có lỗi SDK.
   */
  openPayment: async (zpTransToken: string): Promise<void> => {
    // Dev mode trong trình duyệt thường: mock payment cho dễ test
    if (!window.APP_ID) {
      console.info('[DEV] ZaloPay mock: giả lập thanh toán thành công sau 1.5s')
      await new Promise<void>((resolve) => setTimeout(resolve, 1500))
      return
    }

    // Production: dùng ZMP SDK openPayment
    // ZMP SDK được inject vào môi trường Zalo Mini App
    const { openPayment } = await import('zmp-sdk')
    await openPayment({ zpTransToken })
  },
}
