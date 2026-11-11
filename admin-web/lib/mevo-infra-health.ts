// Tình trạng hai dịch vụ phụ trợ chạy trên máy đặt tại Việt Nam (sau Cloudflare tunnel), hiện ở /mevo:
//  - proxy số điện thoại (ops/phone-proxy): edge function zalo-phone nhờ nó gọi Zalo từ IP Việt Nam;
//  - relay nhóm Zalo (ZCA): edge function reservation-zca-notify gửi thông báo đặt bàn qua nó.
// Máy tắt thì cả hai hỏng âm thầm (khách phải gõ tay số điện thoại, nhóm Zalo không nhận thông báo),
// nên /mevo phải nói ra. Chỉ ĐỌC: một lần GET /health và vài dòng thông báo gần nhất.
import { deliveryIsStale, type DeliveryStatus } from './reservation-delivery-status'

export type InfraState = 'ok' | 'down' | 'unknown'
export type InfraCheck = { key: 'phone_proxy' | 'zca_relay'; label: string; state: InfraState; detail: string }

export type FetchLike = (url: string, init?: { signal?: AbortSignal; cache?: RequestCache }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

const PHONE_LABEL = 'Proxy số điện thoại Zalo'
const ZCA_LABEL = 'Relay thông báo nhóm Zalo'

/** `base` là giá trị MEVO_PHONE_PROXY_URL (cùng tên với secret bên Supabase), ví dụ https://…/mevo/phone. */
export async function checkPhoneProxy(base: string | undefined, fetchImpl: FetchLike, timeoutMs = 3_000): Promise<InfraCheck> {
  const url = base?.trim().replace(/\/+$/, '')
  if (!url) {
    return { key: 'phone_proxy', label: PHONE_LABEL, state: 'unknown', detail: 'Chưa đặt MEVO_PHONE_PROXY_URL trên Vercel nên chưa kiểm được' }
  }
  try {
    const res = await fetchImpl(`${url}/health`, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' })
    const body = res.ok ? ((await res.json().catch(() => null)) as { ok?: unknown } | null) : null
    if (res.ok && body?.ok === true) {
      return { key: 'phone_proxy', label: PHONE_LABEL, state: 'ok', detail: 'Đang trả lời bình thường' }
    }
    return { key: 'phone_proxy', label: PHONE_LABEL, state: 'down', detail: `Trả lời sai (HTTP ${res.status}) — khách phải gõ tay số điện thoại` }
  } catch {
    return { key: 'phone_proxy', label: PHONE_LABEL, state: 'down', detail: 'Không trả lời — khách phải gõ tay số điện thoại. Kiểm tra máy và Cloudflare tunnel' }
  }
}

export type ZcaDeliveryRow = {
  status: DeliveryStatus
  created_at: string
  queued_at: string | null
  processing_started_at: string | null
}

/** `rows`: các thông báo zca_group mới nhất, mới trước. Chỉ nhìn dòng mới nhất — nó nói relay đang sống hay không. */
export function summarizeZcaRelay(rows: ZcaDeliveryRow[], now = Date.now()): InfraCheck {
  const latest = rows[0]
  if (!latest) {
    return { key: 'zca_relay', label: ZCA_LABEL, state: 'unknown', detail: 'Chưa có thông báo đặt bàn nào để suy ra tình trạng' }
  }
  const when = new Date(latest.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  if (latest.status === 'sent') {
    return { key: 'zca_relay', label: ZCA_LABEL, state: 'ok', detail: `Thông báo gần nhất (${when}) đã tới nhóm` }
  }
  const anchor = latest.status === 'processing' ? latest.processing_started_at : latest.queued_at ?? latest.created_at
  const waiting = (latest.status === 'queued' || latest.status === 'processing') && !deliveryIsStale(latest.status, anchor, now)
  if (waiting) {
    return { key: 'zca_relay', label: ZCA_LABEL, state: 'unknown', detail: `Thông báo gần nhất (${when}) đang gửi` }
  }
  return { key: 'zca_relay', label: ZCA_LABEL, state: 'down', detail: `Thông báo gần nhất (${when}) CHƯA tới nhóm Zalo — kiểm tra máy relay` }
}
