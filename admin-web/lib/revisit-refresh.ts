// "Hiện bản cũ ngay, tải bản mới phía sau" cho khu quản lý (anh Tú 2026-11-16).
//
// next.config.ts bật `experimental.staleTimes.dynamic = CLIENT_CACHE_SECONDS`: trình duyệt GIỮ trang vừa xem trong
// khoảng đó → mở lại trang là hiện ngay, không chờ máy chủ (mặc định Next 16 là 0 giây = lần nào cũng chờ).
// Đổi lại bản giữ có thể cũ → components/revisit-refresh.tsx gọi router.refresh() ngay sau khi trang hiện TỪ CACHE để
// lấy dữ liệu mới (giữ nguyên ô đang nhập, vị trí cuộn).
//
// Biết "hiện từ cache" bằng cách nhìn request: lần điều hướng có gửi request RSC (không phải prefetch) cho đúng URL đó
// thì máy chủ vừa trả bản mới → KHÔNG tải lại. Không có request nào → Next lấy từ cache → tải lại phía sau.
// (Đoán theo thời gian thì sai: router.refresh / revalidatePath / ghi cookie xoá cache bất cứ lúc nào — vd. trang Hoá đơn
// nghe Realtime rồi refresh — khi đó Next đã tự hỏi máy chủ, tải thêm lần nữa là thừa.)

export const CLIENT_CACHE_SECONDS = 300

/** Khoá so khớp URL: đường dẫn + query, bỏ tham số `_rsc` Next tự thêm vào request. */
export function navKey(pathname: string, search: string): string {
  const params = new URLSearchParams(search)
  params.delete('_rsc')
  params.sort()
  const q = params.toString()
  return q ? `${pathname}?${q}` : pathname
}

/** Request này có phải lần tải trang RSC thật (điều hướng / refresh), không phải prefetch? */
export function isNavigationRscRequest(headers: Headers): boolean {
  return headers.get('rsc') === '1' && !headers.has('next-router-prefetch')
}

export type CacheHitDetector = {
  /** Gọi khi trình duyệt gửi request RSC điều hướng cho `key`. */
  fetched: (key: string, now: number) => void
  /** Gọi khi URL đổi xong (trang mới đã hiện). true = trang hiện từ cache → nên tải lại phía sau. */
  arrived: (key: string, now: number) => boolean
}

export function createCacheHitDetector(): CacheHitDetector {
  const lastFetch = new Map<string, number>()
  let lastArrival = Number.NEGATIVE_INFINITY
  let first = true
  return {
    fetched(key, now) {
      lastFetch.set(key, now)
    },
    arrived(key, now) {
      const since = lastArrival
      lastArrival = now
      // Lần đầu (tải cứng trang): HTML vừa dựng ở máy chủ, không cần tải lại.
      if (first) { first = false; return false }
      return (lastFetch.get(key) ?? Number.NEGATIVE_INFINITY) < since
    },
  }
}
