import type { CollectOutcome } from '@/lib/collect-outcome'

/**
 * Việc ngăn kéo A04 làm sau một lần bấm "Đã nhận tiền" (kết quả từ runCollect).
 * Thông báo (vd "Bàn đã được thu trước đó: Tiền mặt …đ") đưa LÊN TRANG qua `notify`: thu xong, dòng 'W:S:<phiên>'
 * đổi key thành 'P:<khoản>' nên ngăn kéo — bám theo key cũ — bị gỡ cùng mọi state bên trong sau khi tải lại.
 * Lỗi thì giữ hộp xác nhận (cùng mã chống trùng) và hiện lỗi trong hộp.
 */
export function applyCollectOutcome(
  out: CollectOutcome,
  h: { notify: (message: string) => void; refresh: () => void; close: () => void; showError: (error: string) => void },
): void {
  if (out.kind !== 'done') {
    h.showError(out.error)
    return
  }
  if (out.message) h.notify(out.message)
  h.refresh()
  h.close()
}
