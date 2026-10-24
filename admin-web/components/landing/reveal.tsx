'use client'

import { useEffect, type CSSProperties, type ReactNode } from 'react'

// Hiệu ứng trượt lên khi cuộn tới (FadeInUp): translate-y-10 + opacity-0 → hiện rõ trong 1000ms.
// CSS nằm ở globals.css (khối "Landing mevo.vn"). Chưa chạy JavaScript thì nội dung vẫn hiện bình thường:
// chỉ khi RevealRoot gắn lớp `reveal-ready` mới bắt đầu ẩn các phần tử CHƯA vào màn hình.
export function FadeInUp({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const style = delay ? ({ transitionDelay: `${delay}ms` } as CSSProperties) : undefined
  return (
    <div data-reveal className={className} style={style}>
      {children}
    </div>
  )
}

export function RevealRoot() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-landing]')
    if (!root) return
    const items = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'))
    // Phần tử đang nằm trong màn hình lúc tải: hiện luôn, tránh chớp tắt rồi mới hiện.
    for (const el of items) {
      if (el.getBoundingClientRect().top < window.innerHeight) el.dataset.shown = ''
    }
    root.classList.add('reveal-ready')
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          ;(e.target as HTMLElement).dataset.shown = ''
          io.unobserve(e.target)
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    )
    for (const el of items) if (!('shown' in el.dataset)) io.observe(el)
    return () => io.disconnect()
  }, [])
  return null
}
