export type OaSendResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; providerCode: string; message: string; retryable: boolean }

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export async function sendOaText(
  accessToken: string,
  userId: string,
  text: string,
  fetchImpl: FetchLike = fetch,
): Promise<OaSendResult> {
  try {
    const response = await fetchImpl('https://openapi.zalo.me/v3.0/oa/message/cs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', access_token: accessToken },
      body: JSON.stringify({ recipient: { user_id: userId }, message: { text } }),
    })
    let body: Record<string, unknown>
    try {
      body = await response.json() as Record<string, unknown>
    } catch {
      return { ok: false, providerCode: `HTTP_${response.status}`, message: 'Zalo trả về dữ liệu không hợp lệ', retryable: response.status >= 500 }
    }
    const providerCode = String(body.error ?? response.status)
    if (response.ok && Number(body.error) === 0) {
      const data = typeof body.data === 'object' && body.data !== null ? body.data as Record<string, unknown> : {}
      return { ok: true, providerMessageId: data.message_id ? String(data.message_id) : null }
    }
    const message = typeof body.message === 'string' ? body.message : 'Zalo từ chối gửi tin'
    return { ok: false, providerCode, message, retryable: response.status === 429 || response.status >= 500 }
  } catch {
    return { ok: false, providerCode: 'NETWORK_ERROR', message: 'Không kết nối được Zalo', retryable: true }
  }
}

