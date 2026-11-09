import { createClient } from '@/lib/supabase/client'
import { enqueuePrint } from '@/lib/actions/print-jobs'
import { printInPlace } from './print-in-place'
import { AGENT_KINDS, browserPrintUrl, PRINT_AGENT_MODE_OFF_ERROR, type PrintRequest } from './print-request'

export type { PrintRequest } from './print-request'

// Cửa duy nhất để in từ POS / staff / báo cáo: chế độ `browser` in ngầm như cũ, chế độ `agent` xếp hàng
// cho phần mềm in ở quầy.
const MODE_TTL_MS = 60_000
const DEDUPE_MS = 2_000

let modeCache: { value: 'browser' | 'agent'; at: number } | null = null
const inflight = new Map<string, Promise<{ ok: true } | { ok: false; error: string }>>()

// Đọc mode bằng client trình duyệt (RPC trực tiếp, KHÔNG qua server action: server action xếp chung hàng đợi
// với điều hướng của Next, POS bấm in liên tục sẽ chặn chuyển tab). Nhớ 60 giây.
// Đọc lỗi: dùng giá trị cũ nếu có, không thì 'browser' để không bao giờ kẹt in.
async function getMode(): Promise<'browser' | 'agent'> {
  const now = Date.now()
  if (modeCache && now - modeCache.at < MODE_TTL_MS) return modeCache.value
  try {
    const { data, error } = await createClient().rpc('get_print_mode')
    if (!error && (data === 'agent' || data === 'browser')) {
      modeCache = { value: data, at: now }
      return data
    }
  } catch {
    // mất mạng: rơi xuống nhánh dự phòng
  }
  return modeCache?.value ?? 'browser'
}

async function run(req: PrintRequest): Promise<{ ok: true } | { ok: false; error: string }> {
  const mode = await getMode()
  if (mode === 'agent' && AGENT_KINDS.has(req.kind)) {
    // Lỗi xếp hàng báo thẳng cho người bấm (còn nút in lại), KHÔNG tự rơi về trình duyệt in trùng.
    try {
      const res = await enqueuePrint(req)
      // Server nói quán không còn ở chế độ phần mềm in (đổi ở máy khác): bỏ cache để lần sau đọc lại và in bằng trình duyệt
      // và lần bấm này in luôn bằng trình duyệt (đổi chế độ ở máy khác, người bấm không phải bấm lại)
      if (!res.ok && res.error === PRINT_AGENT_MODE_OFF_ERROR) {
        modeCache = null
        printInPlace(browserPrintUrl(req))
        return { ok: true }
      }
      return res.ok ? { ok: true } : { ok: false, error: res.error }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Không xếp được phiếu in' }
    }
  }
  printInPlace(browserPrintUrl(req))
  return { ok: true }
}

export function printDocument(req: PrintRequest): Promise<{ ok: true } | { ok: false; error: string }> {
  // Bấm đúp: cùng yêu cầu trong 2 giây dùng chung một lần in, trả cùng kết quả.
  const key = JSON.stringify(req)
  const existing = inflight.get(key)
  if (existing) return existing
  const p = run(req)
  inflight.set(key, p)
  void p.finally(() => setTimeout(() => inflight.delete(key), DEDUPE_MS))
  return p
}

export function resetPrintDocumentStateForTests() {
  modeCache = null
  inflight.clear()
}
