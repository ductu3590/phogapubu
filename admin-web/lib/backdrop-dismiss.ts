// Đóng popup khi bấm ra NỀN — nhưng chỉ khi cú bấm BẮT ĐẦU và KẾT THÚC đều trên nền (anh Tú 2026-11-16).
//
// Lỗi cũ: popup chỉ xét `click.target === nền`. Trình duyệt bắn `click` lên phần tử cha CHUNG của chỗ nhấn chuột và
// chỗ thả chuột. Nhấn trong ô nhập để quét chọn chữ, kéo lố ra ngoài khung rồi thả trên nền → cha chung chính là
// <dialog> (nền) → popup tưởng bấm ra ngoài và đóng mất, mất luôn chữ đang gõ.
// Cách sửa: nhớ chỗ NHẤN (pointerdown). Chỉ đóng khi nhấn trên nền VÀ click cũng trên nền.

export type BackdropGuard = {
  /** Gọi ở pointerdown/mousedown: `onBackdrop` = target của lần nhấn có phải chính nền không. */
  down: (onBackdrop: boolean) => void
  /** Gọi ở click: trả true nếu được đóng (nhấn và thả đều trên nền). Mỗi lần nhấn chỉ dùng một lần. */
  click: (onBackdrop: boolean) => boolean
}

export function createBackdropGuard(): BackdropGuard {
  let pressedOnBackdrop = false
  return {
    down(onBackdrop) {
      pressedOnBackdrop = onBackdrop
    },
    click(onBackdrop) {
      const ok = pressedOnBackdrop && onBackdrop
      pressedOnBackdrop = false
      return ok
    },
  }
}
