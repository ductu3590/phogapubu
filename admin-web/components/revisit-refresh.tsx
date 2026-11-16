'use client'

import { Suspense, useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { createCacheHitDetector, isNavigationRscRequest, navKey } from '@/lib/revisit-refresh'

// Một bộ nhớ cho cả tab trình duyệt (dùng chung giữa /admin, /staff, /mevo). Tải cứng trang thì làm lại từ đầu.
const detector = createCacheHitDetector()

// Ghi nhận request RSC điều hướng mà Next gửi (Next dùng fetch toàn cục). Chỉ ĐỌC header/URL rồi chuyển nguyên lệnh
// cho fetch gốc — không đổi request, không đọc response. Cài một lần cho cả tab.
let installed = false
function watchRscRequests() {
  if (installed || typeof window === 'undefined') return
  installed = true
  const original = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
      if (isNavigationRscRequest(headers)) {
        const url = new URL(input instanceof Request ? input.url : String(input), window.location.href)
        if (url.origin === window.location.origin) detector.fetched(navKey(url.pathname, url.search), Date.now())
      }
    } catch {
      // Không bao giờ để việc ghi nhận làm hỏng request thật.
    }
    return original(input, init)
  }
}
watchRscRequests()

function Watcher() {
  const pathname = usePathname()
  const search = useSearchParams()
  const router = useRouter()
  const key = navKey(pathname, search.toString())
  useEffect(() => {
    // Trang vừa hiện TỪ CACHE phía trình duyệt (không có request nào) → lấy dữ liệu mới phía sau, không mất ô đang nhập.
    if (detector.arrived(key, Date.now())) router.refresh()
  }, [key, router])
  return null
}

/** Đặt một lần trong layout khu quản lý: mở lại trang đã xem thì hiện ngay, rồi tự cập nhật dữ liệu mới (lib/revisit-refresh.ts). */
export default function RevisitRefresh() {
  return (
    <Suspense fallback={null}>
      <Watcher />
    </Suspense>
  )
}
