// Thiết lập chuông báo (PA-1, 2026-10-07) — phần THUẦN, không đụng Web Audio để test được ở node.
// - Kiểu chuông: theo QUÁN (stores.bell_style), chủ quán chọn ở Cài đặt.
// - Âm lượng: theo MÁY (localStorage) — loa máy quầy và điện thoại nhân viên to nhỏ khác nhau.

export type BellStyle = 'double' | 'soft' | 'repeat'

export const BELL_STYLES: ReadonlyArray<{ value: BellStyle; label: string; hint: string }> = [
  { value: 'double', label: 'Ding-dong kép (chuẩn)', hint: 'Hai tiếng ngắn, đủ nghe giữa quán ồn' },
  { value: 'soft', label: 'Gõ nhẹ (không gây ồn)', hint: 'Một tiếng nhỏ, hợp quán yên tĩnh' },
  { value: 'repeat', label: 'Báo liên tục tới khi nhận', hint: 'Lặp mỗi 3 giây cho tới khi có người chạm màn hình' },
]

export function parseBellStyle(v: unknown): BellStyle {
  return v === 'soft' || v === 'repeat' || v === 'double' ? v : 'double'
}

export const VOLUME_KEY = 'mevo_bell_volume'
export const DEFAULT_VOLUME = 80

export type KeyValueStorage = { getItem(k: string): string | null; setItem(k: string, v: string): void }

function clamp(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)))
}

export function readVolume(storage: KeyValueStorage | null): number {
  if (!storage) return DEFAULT_VOLUME
  try {
    const raw = storage.getItem(VOLUME_KEY)
    if (raw === null) return DEFAULT_VOLUME
    const n = Number(raw)
    return Number.isFinite(n) ? clamp(n) : DEFAULT_VOLUME
  } catch {
    return DEFAULT_VOLUME
  }
}

export function writeVolume(storage: KeyValueStorage | null, v: number): number {
  const value = clamp(v)
  try { storage?.setItem(VOLUME_KEY, String(value)) } catch { /* bỏ qua: chế độ ẩn danh / chặn storage */ }
  return value
}

// 80% kiểu chuẩn = 0.25 — đúng độ to của chuông cũ để quán không thấy tiếng đổi khi chưa chỉnh gì.
const BASE_PEAK: Record<BellStyle, number> = { double: 0.3125, soft: 0.16, repeat: 0.3125 }

export function peakGain(style: BellStyle, volume: number): number {
  return BASE_PEAK[style] * (clamp(volume) / 100)
}

/**
 * Bộ lặp cho kiểu "Báo liên tục": kêu ngay, rồi mỗi intervalMs một lần, tự dừng sau maxMs
 * (trần an toàn — không bao giờ kêu cả buổi nếu không ai ở quầy).
 */
export function createRepeater(opts: {
  play: () => void
  intervalMs: number
  maxMs: number
  now: () => number
  setTimer: (fn: () => void, ms: number) => unknown
  clearTimer: (h: unknown) => void
}) {
  let handle: unknown = null
  let startedAt = 0
  const tick = () => {
    if (opts.now() - startedAt >= opts.maxMs) { handle = null; return }
    opts.play()
    handle = opts.setTimer(tick, opts.intervalMs)
  }
  return {
    start() {
      if (handle !== null) return
      startedAt = opts.now()
      tick()
    },
    stop() {
      if (handle !== null) opts.clearTimer(handle)
      handle = null
    },
    running() {
      return handle !== null
    },
  }
}
