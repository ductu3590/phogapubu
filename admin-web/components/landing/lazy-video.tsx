'use client'

import { useEffect, useRef } from 'react'

// Video nền: chỉ tải khi sắp cuộn tới, KHÔNG tải khi máy bật tiết kiệm dữ liệu hoặc giảm chuyển động.
// Nhờ vậy video không chặn lần vẽ đầu (Lighthouse) và không đốt 4G của khách xem trên điện thoại.
export function LazyVideo({ src, className = '' }: { src: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    if (conn?.saveData || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const start = () => {
      el.src = src
      el.play().catch(() => {})
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        io.disconnect()
        // Đợi trang tải xong mới kéo video, ưu tiên chữ và ảnh hiện trước.
        if (document.readyState === 'complete') start()
        else window.addEventListener('load', start, { once: true })
      },
      { rootMargin: '200px' },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      window.removeEventListener('load', start)
    }
  }, [src])

  return <video ref={ref} aria-hidden muted loop playsInline preload="none" className={className} />
}
