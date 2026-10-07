// Chuông báo việc mới cho POS, đặt bàn, màn nhân viên và màn bếp (Web Audio API — không cần file âm thanh ngoài).
//
// Trình duyệt tạo AudioContext ở trạng thái 'suspended' cho tới khi có tương tác người dùng,
// nên phải giữ MỘT context dùng chung rồi resume() trong một cú bấm; tạo context mới mỗi lần
// kêu là lần nào cũng bị chặn.
// Kiểu chuông theo QUÁN (setBellStyle, do BellStyleSync bơm vào), âm lượng theo MÁY (bell-settings.ts).

import { createRepeater, parseBellStyle, peakGain, readVolume, type BellStyle } from './bell-settings'

let ctx: AudioContext | null = null
let style: BellStyle = 'double'

function isRunning(context: AudioContext): boolean {
  return context.state === 'running'
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  if (!ctx) ctx = new AC()
  return ctx
}

function localStore() {
  try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null }
}

/** Gọi trong một sự kiện bấm/chạm để mở khoá tiếng. Gọi nhiều lần vô hại. */
export async function unlockBell(): Promise<boolean> {
  const c = getCtx()
  if (!c) return false
  if (isRunning(c)) return true
  if (c && c.state === 'suspended') {
    try {
      await c.resume()
    } catch {
      // Banner vẫn hiện nếu trình duyệt từ chối audio; lần tương tác sau sẽ thử lại.
    }
  }
  return isRunning(c)
}

/** Gọi khi biết kiểu chuông của quán (BellStyleSync). Đổi kiểu thì dừng chuông lặp đang chạy. */
export function setBellStyle(s: BellStyle): void {
  const next = parseBellStyle(s)
  if (next !== style) stopBell()
  style = next
}

export function getBellStyle(): BellStyle {
  return style
}

function tone(c: AudioContext, freq: number, at: number, peak: number, length: number) {
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  // Vào/ra êm: bật tắt gain đột ngột sẽ nghe "tạch" ở loa rẻ tiền.
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), at + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length - 0.02)
  osc.connect(gain)
  gain.connect(c.destination)
  osc.start(at)
  osc.stop(at + length)
}

function sound(c: AudioContext, s: BellStyle): void {
  const peak = peakGain(s, readVolume(localStore()))
  if (peak <= 0) return
  const now = c.currentTime
  if (s === 'soft') {
    tone(c, 1046, now, peak, 0.22)
    return
  }
  // double + repeat: hai tiếng "ting" ngắn — đủ nghe giữa quán ồn, không chói như còi báo động.
  tone(c, 880, now, peak, 0.18)
  tone(c, 1320, now + 0.18, peak, 0.18)
}

/** Phát MỘT lần theo kiểu cho trước (không lặp). */
function ring(s: BellStyle): void {
  const c = getCtx()
  if (!c) return
  if (c.state === 'running') {
    sound(c, s)
    return
  }
  // Tablet vừa ngủ dậy / tab vừa quay lại: trình duyệt treo context (suspended, iOS 'interrupted').
  // Trang đã từng được chạm nên resume() thường được phép → thử đánh thức rồi mới kêu, không câm luôn.
  if (c.state === 'closed') return
  c.resume().then(() => { if (c.state === 'running') sound(c, s) }, () => { /* chưa có cú chạm: lần sau thử lại */ })
}

// Kiểu "Báo liên tục": lặp 3 giây/lần, tự dừng khi có người chạm/gõ trên trang hoặc sau 5 phút.
const repeater = createRepeater({
  play: () => ring('double'),
  intervalMs: 3000,
  maxMs: 5 * 60_000,
  now: () => Date.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
})

function onPresence() {
  stopBell()
}

/** Dừng chuông lặp (gọi khi hàng việc rỗng). Không làm gì nếu không có chuông nào đang lặp. */
export function stopBell(): void {
  repeater.stop()
  if (typeof window !== 'undefined') {
    window.removeEventListener('pointerdown', onPresence, true)
    window.removeEventListener('keydown', onPresence, true)
  }
}

/** Có việc mới → kêu theo kiểu của quán. Chữ ký giữ nguyên để mọi chỗ gọi cũ chạy như trước. */
export function playBell(): void {
  if (style !== 'repeat') {
    ring(style)
    return
  }
  if (repeater.running()) return
  repeater.start()
  if (typeof window !== 'undefined') {
    window.addEventListener('pointerdown', onPresence, true)
    window.addEventListener('keydown', onPresence, true)
  }
}

/** Kêu MỘT lần theo kiểu của quán, kể cả khi quán chọn "Báo liên tục" — cho nhắc đặt bàn: không có
 *  hàng việc nào để "xử lý xong" nên không được lặp (lặp thì chỉ dừng khi có người chạm màn hình). */
export function ringBellOnce(): void {
  ring(style === 'repeat' ? 'double' : style)
}

/** Nút "Nghe thử": luôn phát MỘT lần, kể cả kiểu repeat. */
export function previewBell(s: BellStyle = style): void {
  void unlockBell().then(() => ring(s === 'repeat' ? 'double' : s))
}
