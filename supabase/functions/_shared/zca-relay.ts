export type RelayFailureCode =
  | 'INVALID_REQUEST'
  | 'GROUP_NOT_FOUND'
  | 'BOT_OFFLINE'
  | 'RATE_LIMITED'
  | 'PROVIDER_REJECTED'

export type RelayResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; code: RelayFailureCode; message: string; retryable: boolean }

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

type SenderInput = {
  notificationId: string
  storeId: string
  groupId: string
  text: string
}

type SenderDeps = {
  relayUrl: string
  hmacSecret: string
  now?: () => number
  fetchImpl?: FetchLike
}

const relayFailureCodes = new Set<RelayFailureCode>([
  'INVALID_REQUEST', 'GROUP_NOT_FOUND', 'BOT_OFFLINE', 'RATE_LIMITED', 'PROVIDER_REJECTED',
])

function errorResult(code: RelayFailureCode, message: string, retryable: boolean): RelayResult {
  return { ok: false, code, message, retryable }
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function sign(secret: string, timestamp: string, body: Uint8Array): Promise<string> {
  const encoder = new TextEncoder()
  const prefix = encoder.encode(`${timestamp}.`)
  const message = new Uint8Array(prefix.length + body.length)
  message.set(prefix)
  message.set(body, prefix.length)
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return `sha256=${toHex(await crypto.subtle.sign('HMAC', key, message))}`
}

/** Gửi đúng bytes đã ký; không log payload để tránh lộ dữ liệu booking. */
export async function sendZcaGroupMessage(input: SenderInput, deps: SenderDeps): Promise<RelayResult> {
  const now = deps.now ?? Date.now
  const timestamp = String(Math.floor(now() / 1000))
  const payload = {
    version: 1,
    notification_id: input.notificationId,
    store_id: input.storeId,
    group_id: input.groupId,
    text: input.text,
  }
  const body = new TextEncoder().encode(JSON.stringify(payload))

  try {
    const signature = await sign(deps.hmacSecret, timestamp, body)
    const response = await (deps.fetchImpl ?? fetch)(deps.relayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Mevo-Timestamp': timestamp,
        'X-Mevo-Signature': signature,
      },
      body,
      signal: AbortSignal.timeout(20_000),
    })
    let parsed: unknown
    try {
      parsed = await response.json()
    } catch {
      return errorResult(response.status === 429 ? 'RATE_LIMITED' : 'BOT_OFFLINE', 'Relay trả về dữ liệu không hợp lệ', response.status >= 500 || response.status === 429)
    }
    if (!response.ok) {
      if (response.status === 429) return errorResult('RATE_LIMITED', 'Relay đang giới hạn tần suất gửi', true)
      if (response.status >= 500) return errorResult('BOT_OFFLINE', 'Relay tạm thời không phản hồi', true)
      return errorResult('INVALID_REQUEST', 'Relay từ chối yêu cầu', false)
    }
    if (!parsed || typeof parsed !== 'object') return errorResult('INVALID_REQUEST', 'Relay trả về dữ liệu không hợp lệ', false)
    const result = parsed as Record<string, unknown>
    if (result.ok === true) return { ok: true, providerMessageId: typeof result.providerMessageId === 'string' ? result.providerMessageId : null }
    const code = typeof result.code === 'string' && relayFailureCodes.has(result.code as RelayFailureCode)
      ? result.code as RelayFailureCode
      : 'INVALID_REQUEST'
    return errorResult(code, typeof result.message === 'string' ? result.message : 'Relay từ chối gửi tin', result.retryable === true)
  } catch {
    return errorResult('BOT_OFFLINE', 'Không kết nối được relay Zalo', true)
  }
}
