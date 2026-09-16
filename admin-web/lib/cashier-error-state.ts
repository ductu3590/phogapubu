export type CashierError = {
  source: 'action' | 'reload'
  message: string
}

export const actionError = (message: string): CashierError => ({ source: 'action', message })

// Tải nền chỉ được xoá thông báo do lần tải trước tạo ra. Nếu nó xoá cả lỗi thao tác thì
// thu ngân sẽ tưởng nút không hoạt động, trong khi RPC vừa trả một lỗi nghiệp vụ quan trọng.
export function applyReloadError(
  current: CashierError | null,
  reloadMessage: string | null,
): CashierError | null {
  if (current?.source === 'action') return current
  return reloadMessage ? { source: 'reload', message: reloadMessage } : null
}
