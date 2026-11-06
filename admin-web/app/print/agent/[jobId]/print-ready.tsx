'use client'

import { useEffect } from 'react'
import { printSignal } from '@/lib/print/print-signal'
import { waitForImages } from '@/lib/print/wait-for-images'

// Báo cho phần mềm in (Electron) biết trang đã dựng xong hay lỗi, qua thuộc tính trên <html>.
// Phần mềm đợi data-print-ready="1" rồi mới in; thấy data-print-error thì báo lỗi, KHÔNG in; kèm
// data-print-retryable="1" nghĩa là lỗi đọc tạm thời (phần mềm có thể thử lại).
export default function PrintReady({ jobId, error, retryable = false }: { jobId: string; error?: string; retryable?: boolean }) {
  useEffect(() => {
    const html = document.documentElement
    let huy = false
    let t: ReturnType<typeof setTimeout> | undefined

    const apply = () => {
      // Đặt title NGAY TRƯỚC khi báo tín hiệu để metadata stream của Next không ghi đè sau đó;
      // phần mềm khớp việc trong hàng đợi Windows theo title này.
      document.title = `MEVO-${jobId}`
      const alertEl = document.querySelector('[role="alert"]')
      const sig = printSignal({ error, retryable, alertText: alertEl ? alertEl.textContent ?? '' : null })
      if ('error' in sig) {
        html.setAttribute('data-print-error', sig.error)
        if (sig.retryable) html.setAttribute('data-print-retryable', '1')
      } else {
        html.setAttribute('data-print-ready', '1')
      }
    }

    if (error) {
      apply()
      return
    }
    // Chờ ảnh (logo, QR) rồi thêm một nhịp cho font/layout ổn định, như useAutoPrint
    void waitForImages().then(() => {
      if (!huy) t = setTimeout(apply, 200)
    })
    return () => {
      huy = true
      if (t) clearTimeout(t)
    }
  }, [jobId, error, retryable])

  return null
}
