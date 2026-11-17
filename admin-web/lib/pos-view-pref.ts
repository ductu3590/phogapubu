// Màn mặc định của POS theo từng máy (localStorage). Không đụng DB / Cài đặt chung.
export type PosView = 'timeline' | 'floor' | 'list'
export type PinnableView = 'timeline' | 'floor'

export const POS_VIEW_KEY = 'mevo:pos-view'

// Nhãn hàng tab dùng chung.
export const POS_VIEW_LABEL: Record<PosView, string> = { timeline: 'Timeline', floor: 'Sơ đồ', list: 'Danh sách' }

// Thiếu / lỗi (chế độ riêng tư) / giá trị lạ (kể cả 'list') → 'timeline'.
export function readDefaultView(storage: Pick<Storage, 'getItem'> | undefined): PinnableView {
  try {
    return storage?.getItem(POS_VIEW_KEY) === 'floor' ? 'floor' : 'timeline'
  } catch {
    return 'timeline'
  }
}

// true = ghi được; lỗi bị nuốt → false.
export function writeDefaultView(storage: Pick<Storage, 'setItem'> | undefined, view: PinnableView): boolean {
  try {
    if (!storage) return false
    storage.setItem(POS_VIEW_KEY, view)
    return true
  } catch {
    return false
  }
}

/**
 * Nhớ tab đang đứng ngay trước khi hệ thống ép đổi tab (chọn bàn cho đặt bàn) để trả về sau.
 * Chỉ nhớ lần ép đầu tiên; bấm tab hoặc rời POS thì xoá (clear) để lần ép sau không trả về tab cũ.
 */
export function createForcedViewMemory() {
  let before: PosView | null = null
  return {
    remember(current: PosView) {
      if (before === null) before = current
    },
    take(): PosView | null {
      const b = before
      before = null
      return b
    },
    clear() {
      before = null
    },
  }
}
