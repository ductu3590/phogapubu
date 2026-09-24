const KEY = 'mevo_table_order_request'

type SavedRequest = { tableId: string; sessionId: string | null; payload: string; requestId: string }

function makeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = new Uint8Array(16)
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(bytes)
    } else {
      for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
    }
  } catch {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

// Giữ request ID khi timeout để lần gửi lại trả cùng batch; đổi giỏ/bàn/phiên thì tạo request mới.
export function tableOrderRequestId(tableId: string, sessionId: string | null, payload: unknown): string {
  const fingerprint = JSON.stringify(payload)
  try {
    const previous = JSON.parse(localStorage.getItem(KEY) ?? 'null') as SavedRequest | null
    if (previous && previous.tableId === tableId && previous.sessionId === sessionId && previous.payload === fingerprint) {
      return previous.requestId
    }
    const requestId = makeId()
    localStorage.setItem(KEY, JSON.stringify({ tableId, sessionId, payload: fingerprint, requestId }))
    return requestId
  } catch {
    return makeId()
  }
}

export function clearTableOrderRequest(requestId: string) {
  try {
    const previous = JSON.parse(localStorage.getItem(KEY) ?? 'null') as SavedRequest | null
    if (previous?.requestId === requestId) localStorage.removeItem(KEY)
  } catch { /* storage không khả dụng */ }
}
