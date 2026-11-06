'use client'

import { useEffect } from 'react'
import { printSignal } from '@/lib/print/print-signal'
import { waitForImages } from '@/lib/print/wait-for-images'

// Báo cho phần mềm in (Electron) biết trang đã dựng xong hay lỗi, qua thuộc tính trên <html>.
// Phần mềm đợi data-print-ready="1" rồi mới in; thấy data-print-error thì báo lỗi, KHÔNG in.
export default function PrintReady({ jobId, error }: { jobId: string; error?: string }) {
  useEffect(() => {
    const html = document.documentElement
    // Tên việc trong hàng đợi Windows để dò khi cần
    document.title = `MEVO-${jobId}`
    let huy = false
    let t: ReturnType<typeof setTimeout> | undefined

    const apply = () => {
      const alertEl = document.querySelector('[role="alert"]')
      const sig = printSignal({ error, alertText: alertEl ? alertEl.textContent ?? '' : null })
      if ('error' in sig) html.setAttribute('data-print-error', sig.error)
      else html.setAttribute('data-print-ready', '1')
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
  }, [jobId, error])

  return null
}
