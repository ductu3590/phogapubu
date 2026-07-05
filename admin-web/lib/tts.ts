// ─── Loa đọc đơn cho Kitchen Display (Sprint v2.2) ──────────────────────────
// Dùng Web Speech API (window.speechSynthesis) — chạy hoàn toàn phía client:
// 0đ, không API key, không gọi server. Giọng lấy từ hệ điều hành thiết bị.
//
// Nguyên tắc:
// - Hàng đợi tuần tự: nhiều đơn đến cùng lúc đọc lần lượt, KHÔNG chồng tiếng.
// - Fallback: thiết bị KHÔNG có giọng vi-VN → bỏ qua đọc (chuông beep vẫn kêu
//   riêng, không lỗi). Tránh đọc tiếng Việt bằng giọng tiếng Anh nghe bậy.

export function isTtsSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'
  )
}

// Chọn giọng tiếng Việt trong danh sách voice của thiết bị (nếu có)
function pickViVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices()
  return (
    voices.find((v) => v.lang === 'vi-VN') ||
    voices.find((v) => v.lang?.toLowerCase().startsWith('vi')) ||
    null
  )
}

// Chrome load voices bất đồng bộ → lắng nghe 'voiceschanged' để warm-up sớm.
// Gọi 1 lần khi component mount; an toàn khi gọi lại nhiều lần.
export function initTts(): void {
  if (!isTtsSupported()) return
  // Gọi getVoices() để kích hoạt load; kết quả dùng ở speak() lúc cần.
  window.speechSynthesis.getVoices()
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices()
  }
}

const queue: string[] = []
let speaking = false
// Giữ tham chiếu utterance hiện tại để tránh bị GC giữa chừng (bug Chrome cũ)
let currentUtter: SpeechSynthesisUtterance | null = null

function processQueue(): void {
  if (speaking) return
  const text = queue.shift()
  if (text === undefined) return

  const synth = window.speechSynthesis
  const utter = new SpeechSynthesisUtterance(text)
  const voice = pickViVoice()
  if (voice) utter.voice = voice
  utter.lang = 'vi-VN'
  utter.rate = 1
  const next = () => {
    speaking = false
    currentUtter = null
    processQueue()
  }
  utter.onend = next
  utter.onerror = next
  speaking = true
  currentUtter = utter
  synth.speak(utter)
}

// Đọc 1 câu tiếng Việt — enqueue tuần tự.
// Trả về false nếu không đọc được (không hỗ trợ / không có giọng vi) để caller biết.
export function speak(text: string): boolean {
  if (!isTtsSupported() || !text.trim()) return false
  const voices = window.speechSynthesis.getVoices()
  // Đã load được danh sách voice mà KHÔNG có giọng vi → không đọc (chỉ chuông).
  // Nếu voices rỗng (chưa load xong) thì vẫn thử — engine tự chọn theo lang.
  if (voices.length > 0 && !pickViVoice()) return false
  queue.push(text)
  processQueue()
  return true
}

// Mở khoá TTS trong 1 cú chạm của người dùng (trình duyệt chặn autoplay tới khi
// có gesture). Đọc 1 utterance câm (volume 0) để "kích hoạt" engine cho các lần
// speak() sau — nhất là trên mobile/iPad. Gọi trong event handler của gesture.
export function unlockTts(): void {
  if (!isTtsSupported()) return
  try {
    window.speechSynthesis.resume()
    const u = new SpeechSynthesisUtterance(' ')
    u.volume = 0
    window.speechSynthesis.speak(u)
  } catch {
    // bỏ qua — không phá luồng nếu trình duyệt chặn
  }
}

// Dừng đọc + xoá hàng đợi (dùng khi cần, vd unmount)
export function stopTts(): void {
  if (!isTtsSupported()) return
  queue.length = 0
  speaking = false
  currentUtter = null
  window.speechSynthesis.cancel()
}
