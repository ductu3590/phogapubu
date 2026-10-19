// App "Sổ Tay Buôn Đá" (không thuộc MEVO) chung tổ chức Zalo MEVO SOLUTION. Zalo chỉ cho MỘT
// Webhook URL + MỘT API Key cho cả tổ chức, nên event của Sổ Tay cũng đổ về webhook của MEVO.
// Event của app đó được chuyển nguyên body + chữ ký sang Supabase của Sổ Tay, MEVO không xử lý.
// Sổ Tay tự verify chữ ký bằng API Key tổ chức (secret ZALO_MINIAPP_API_KEY bên Supabase Sổ Tay).
export const SO_TAY_APP_ID = '805750043345863894'
const SO_TAY_WEBHOOK = 'https://pasefbdemcxxwdquofzt.supabase.co/functions/v1/zalo-webhook'

// Đọc appId từ body THÔ, không qua JSON.parse: App ID Zalo 18 chữ số vượt Number.MAX_SAFE_INTEGER,
// gửi dạng số thì JSON.parse làm tròn (805750043345863894 → 805750043345864000) và so sánh trượt.
// Chỉ khớp khoá `appId` (Mini App); event OA dùng `app_id` nên không bị bắt nhầm.
export function rawAppId(raw: string): string | null {
  return raw.match(/"appId"\s*:\s*"?(\d+)"?/)?.[1] ?? null
}

export function isSoTayEvent(raw: string): boolean {
  return rawAppId(raw) === SO_TAY_APP_ID
}

export async function forwardToSoTay(raw: string, signature: string): Promise<Response> {
  try {
    const res = await fetch(SO_TAY_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-ZEvent-Signature': signature },
      body: raw, // giữ nguyên body gốc để Sổ Tay tự verify chữ ký
      signal: AbortSignal.timeout(10_000),
    })
    // Trả đúng status + body của Supabase: lỗi 5xx thì Zalo gửi lại sau.
    return new Response(await res.text(), { status: res.status })
  } catch (e) {
    console.error('[zalo-webhook] chuyển tiếp Sổ Tay lỗi:', e)
    return new Response('forward failed', { status: 502 })
  }
}
