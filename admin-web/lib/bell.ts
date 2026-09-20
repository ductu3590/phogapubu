// Chuông báo đơn mới cho màn POS (Web Audio API — không cần file âm thanh ngoài).
//
// Trình duyệt tạo AudioContext ở trạng thái 'suspended' cho tới khi có tương tác người dùng,
// nên phải giữ MỘT context dùng chung rồi resume() trong một cú bấm; tạo context mới mỗi lần
// kêu là lần nào cũng bị chặn. (Cùng cách làm với màn bếp, tách riêng ở đây để POS không phải
// import từ file 1000 dòng của Kitchen Display.)

let ctx: AudioContext | null = null

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

/** Hai tiếng "ting" ngắn — đủ nghe giữa quán ồn, không chói như còi báo động. */
export function playBell(): void {
  const c = getCtx()
  if (!c || c.state !== 'running') return

  const now = c.currentTime
  for (const [i, freq] of [880, 1320].entries()) {
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    // Vào/ra êm: bật tắt gain đột ngột sẽ nghe "tạch" ở loa rẻ tiền.
    const t0 = now + i * 0.18
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16)
    osc.connect(gain)
    gain.connect(c.destination)
    osc.start(t0)
    osc.stop(t0 + 0.18)
  }
}
