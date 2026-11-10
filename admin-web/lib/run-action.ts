// Gọi server action từ form mà KHÔNG BAO GIỜ ném và không bao giờ treo.
//
// Mất mạng thì fetch của server action bị reject → `await action()` NÉM (Next chuyển lỗi fetch thành reject của
// promise action). Form viết `setBusy(true); const res = await action(); setBusy(false)` sẽ kẹt nút Lưu xoay mãi,
// bật mạng lại vẫn xoay (KHO bài 8.2). Mạng chập chờn (có wifi, không ra internet) thì fetch có thể treo rất lâu →
// thêm hạn chờ. Sau khi hết hạn, lời gọi cũ vẫn có thể tới server: chỉ dùng cho action chống trùng được (mã
// client_request_id) hoặc ghi lại cũng vô hại.

export const NETWORK_ERROR = 'Lỗi kết nối. Kiểm tra mạng rồi thử lại.'

export async function runAction<T>(
  call: () => Promise<T>,
  opts?: { timeoutMs?: number; isOnline?: () => boolean },
): Promise<T | { ok: false; error: string }> {
  const isOnline = opts?.isOnline ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false))
  if (!isOnline()) return { ok: false, error: NETWORK_ERROR }
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<{ ok: false; error: string }>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, error: NETWORK_ERROR }), opts?.timeoutMs ?? 30_000)
  })
  try {
    return await Promise.race([call(), timeout])
  } catch {
    return { ok: false, error: NETWORK_ERROR }
  } finally {
    clearTimeout(timer)
  }
}
