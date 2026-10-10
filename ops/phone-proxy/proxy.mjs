// Bộ chuyển tiếp lấy SĐT Zalo — chạy trên máy có IP Việt Nam (Minipc).
// Zalo CHẶN API thông tin cá nhân khi gọi từ IP ngoài Việt Nam (lỗi -501: "IP address not inside Vietnam"),
// mà edge function Supabase chạy ở Seoul → function ký yêu cầu rồi nhờ máy này gọi hộ Zalo.
// Chữ ký: cùng kiểu relay ZCA — X-Mevo-Signature = sha256=HMAC_SHA256(MEVO_HMAC_SECRET, `${timestamp}.${rawBody}`).
// KHÔNG lưu secret/số, KHÔNG log số / token / secret — chỉ log kết quả (mã lỗi Zalo).
import { createHmac, timingSafeEqual } from 'node:crypto'

export const ZALO_PHONE_URL = 'https://graph.zalo.me/v2.0/me/info'
const PATH = '/mevo/phone'
const MAX_SKEW_SECONDS = 300

function validSignature(secret, timestamp, signature, rawBody) {
  const expected = 'sha256=' + createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(typeof signature === 'string' ? signature : '')
  return a.length === b.length && timingSafeEqual(a, b)
}

const text = (value) => (typeof value === 'string' ? value.trim() : '')

/**
 * @param {{ method: string, path: string, headers: Record<string,string|undefined>, rawBody: string }} req
 * @param {{ hmacSecret: string, now: () => number, fetch: typeof fetch, log: (m: string) => void }} deps
 */
export async function handlePhoneProxy(req, deps) {
  if (req.path === `${PATH}/health`) {
    return req.method === 'GET' ? { status: 200, body: { ok: true } } : { status: 405, body: { error: 'method_not_allowed' } }
  }
  if (req.path !== PATH) return { status: 404, body: { error: 'not_found' } }
  if (req.method !== 'POST') return { status: 405, body: { error: 'method_not_allowed' } }

  const timestamp = req.headers['x-mevo-timestamp']
  const ts = Number(timestamp)
  const fresh = Number.isInteger(ts) && Math.abs(Math.floor(deps.now() / 1000) - ts) <= MAX_SKEW_SECONDS
  if (!fresh || !validSignature(deps.hmacSecret, timestamp, req.headers['x-mevo-signature'], req.rawBody)) {
    return { status: 401, body: { error: 'unauthorized' } }
  }

  let body
  try { body = JSON.parse(req.rawBody) } catch { body = null }
  const token = text(body?.token)
  const accessToken = text(body?.access_token)
  const secretKey = text(body?.secret_key)
  if (!token || !accessToken || !secretKey) return { status: 400, body: { error: 'bad_request' } }

  let res
  try {
    res = await deps.fetch(ZALO_PHONE_URL, {
      method: 'GET',
      headers: { access_token: accessToken, code: token, secret_key: secretKey },
    })
  } catch {
    deps.log('[phone-proxy] không gọi được Zalo (lỗi mạng)')
    return { status: 502, body: { error: 'upstream_unreachable' } }
  }

  let zalo
  try { zalo = await res.json() } catch { zalo = null }
  if (!zalo || typeof zalo !== 'object') {
    deps.log(`[phone-proxy] Zalo trả dữ liệu không đọc được http=${res.status}`)
    return { status: 502, body: { error: 'upstream_invalid' } }
  }
  deps.log(`[phone-proxy] Zalo http=${res.status} error=${typeof zalo.error === 'number' ? zalo.error : 'n/a'}`)
  // Trả nguyên JSON của Zalo: bên gọi (edge function) đọc đúng định dạng {data:{number}, error, message}.
  return { status: 200, body: zalo }
}
