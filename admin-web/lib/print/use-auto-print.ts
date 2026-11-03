'use client'

import { useEffect } from 'react'

// Mở trang là in luôn. Chờ ảnh (logo) dựng xong + một nhịp cho font/layout ổn định rồi mới gọi
// window.print(), nếu không Chrome đôi khi in ra trang trắng hoặc thiếu logo.
// enabled = false: trang đang báo lỗi thay vì phiếu (vd giảm giá lớn hơn tiền hàng) → KHÔNG tự in.
export function useAutoPrint(enabled = true) {
  useEffect(() => {
    if (!enabled) return
    let huy = false
    let t: ReturnType<typeof setTimeout> | undefined
    const anh = Array.from(document.images).map((img) => img.decode().catch(() => undefined))
    void Promise.all(anh).then(() => {
      if (!huy) t = setTimeout(() => window.print(), 350)
    })
    return () => {
      huy = true
      if (t) clearTimeout(t)
    }
  }, [enabled])
}
