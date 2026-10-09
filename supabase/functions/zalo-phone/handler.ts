// Đổi token SĐT của Zalo Mini App ra số điện thoại thật (spec 2026-10-09 §4.2).
// Token do getPhoneNumber() cấp: dùng 1 lần, hết hạn sau 2 phút.
// KHÔNG ghi DB. KHÔNG log số, token, access token, secret — chỉ log mã lỗi Zalo / HTTP status.
// Không import gì để chạy được cả trên Deno (index.ts) lẫn vitest.

export const ZALO_PHONE_URL = 'https://graph.zalo.me/v2.0/me/info'

export type ZaloPhoneBody = { storeId?: unknown; token?: unknown; accessToken?: unknown } | null
export type ZaloPhoneConfig = { secret: string | null; enabled: boolean } | null
export type ZaloPhoneResult =
  | { status: 200; body: { phone: string } }
  | { status: 400 | 409 | 502; body: { error: 'bad_request' | 'not_configured' | 'zalo_error' } }

export type ZaloPhoneDeps = {
  loadConfig: (storeId: string) => Promise<ZaloPhoneConfig>
  fetch: (url: string, init: { method: 'GET'; headers: Record<string, string> }) => Promise<Response>
  log: (message: string) => void
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export async function handleZaloPhone(body: ZaloPhoneBody, deps: ZaloPhoneDeps): Promise<ZaloPhoneResult> {
  const storeId = str(body?.storeId)
  const token = str(body?.token)
  const accessToken = str(body?.accessToken)
  if (!UUID.test(storeId) || !token || !accessToken) {
    return { status: 400, body: { error: 'bad_request' } }
  }

  // Secret theo ĐÚNG quán (store_zalo_configs, mig 021) — mỗi quán là một Zalo App riêng.
  const config = await deps.loadConfig(storeId)
  const secret = config?.secret?.trim() ?? ''
  if (!config || !config.enabled || !secret) {
    return { status: 409, body: { error: 'not_configured' } }
  }

  let res: Response
  try {
    res = await deps.fetch(ZALO_PHONE_URL, {
      method: 'GET',
      headers: { access_token: accessToken, code: token, secret_key: secret },
    })
  } catch {
    deps.log('[zalo-phone] không gọi được Zalo (lỗi mạng)')
    return { status: 502, body: { error: 'zalo_error' } }
  }

  let payload: { error?: unknown; data?: { number?: unknown } } | null = null
  try {
    payload = await res.json()
  } catch {
    payload = null
  }
  const number = payload?.data?.number
  if (!res.ok || payload?.error !== 0 || typeof number !== 'string' || !number) {
    const code = typeof payload?.error === 'number' ? payload.error : 'n/a'
    deps.log(`[zalo-phone] Zalo trả lỗi http=${res.status} error=${code}`)
    return { status: 502, body: { error: 'zalo_error' } }
  }
  return { status: 200, body: { phone: number } }
}
