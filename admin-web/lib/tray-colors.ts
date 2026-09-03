// Màu nhận diện mâm — dùng CHUNG cho màn "Chọn bàn" (/staff/order) và màn "Bàn"
// (/staff/tables). Hai màn phải import cùng một hàm, nếu mỗi màn tự tính thì cùng một
// mâm sẽ ra hai màu khác nhau và nhân viên hết đường đối chiếu.

// ⚠️ Tailwind v4 quét class thẳng từ source, KHÔNG có file config để safelist.
// Mọi class ở đây phải là chuỗi NGUYÊN VẸN. Ghép động kiểu `bg-${key}-50` là Tailwind
// không nhìn thấy → build production ra màn hình trắng trơn không màu.
export type TrayColor = {
  key: string
  /** Khối bao ngoài của mâm ở màn Chọn bàn */
  box: string
  /** Nút bàn bên trong khối mâm */
  chip: string
  /** Dải màu dày bên trái thẻ phiên ở màn Bàn */
  bar: string
  /** Chữ tiêu đề "🍲 Mâm 1 · 3 bàn" */
  label: string
}

// Cố tình KHÔNG có cam (màu nút hành động chính) và hổ phách (màu cảnh báo needs_review) —
// tô mâm bằng hai màu đó là nhân viên đọc nhầm tín hiệu.
export const TRAY_COLORS: TrayColor[] = [
  {
    key: 'blue',
    box: 'border-blue-200 bg-blue-50',
    chip: 'border-blue-300 bg-blue-100 text-blue-900 active:bg-blue-200',
    bar: 'border-l-4 border-l-blue-400',
    label: 'text-blue-700',
  },
  {
    key: 'violet',
    box: 'border-violet-200 bg-violet-50',
    chip: 'border-violet-300 bg-violet-100 text-violet-900 active:bg-violet-200',
    bar: 'border-l-4 border-l-violet-400',
    label: 'text-violet-700',
  },
  {
    key: 'emerald',
    box: 'border-emerald-200 bg-emerald-50',
    chip: 'border-emerald-300 bg-emerald-100 text-emerald-900 active:bg-emerald-200',
    bar: 'border-l-4 border-l-emerald-400',
    label: 'text-emerald-700',
  },
  {
    key: 'pink',
    box: 'border-pink-200 bg-pink-50',
    chip: 'border-pink-300 bg-pink-100 text-pink-900 active:bg-pink-200',
    bar: 'border-l-4 border-l-pink-400',
    label: 'text-pink-700',
  },
  {
    key: 'teal',
    box: 'border-teal-200 bg-teal-50',
    chip: 'border-teal-300 bg-teal-100 text-teal-900 active:bg-teal-200',
    bar: 'border-l-4 border-l-teal-400',
    label: 'text-teal-700',
  },
  {
    key: 'indigo',
    box: 'border-indigo-200 bg-indigo-50',
    chip: 'border-indigo-300 bg-indigo-100 text-indigo-900 active:bg-indigo-200',
    bar: 'border-l-4 border-l-indigo-400',
    label: 'text-indigo-700',
  },
]

// Chỉ nhận đúng 4 field cần dùng → OpenTableSession truyền thẳng vào được, mà hàm vẫn
// thuần và test được không cần dựng cả phiên thật.
export type TraySessionLike = {
  session_id: string
  status: string
  opened_at: string
  tables: unknown[]
}

export type TrayAssignment = {
  color: TrayColor
  /** Số hiệu hiển thị: "Mâm 1", "Mâm 2"… đánh theo thứ tự mở */
  index: number
}

// FNV-1a 32-bit. Cần một hàm băm ổn định tuyệt đối giữa các lần render và giữa hai màn.
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Gán màu + số hiệu cho các mâm đang mở.
 *
 * Mâm = phiên `open` chiếm từ 2 bàn trở lên. KHÔNG xét `is_open_ordering`: mâm dựng bằng
 * "Thêm bàn vào mâm" hay "Nhập phiên lẻ vào mâm" cũng phải có màu.
 *
 * Màu lấy từ hash(session_id); màu đó bị chiếm rồi thì dò sang màu kế tiếp còn trống.
 * Duyệt theo `opened_at` tăng dần nên mâm mở trước luôn được ưu tiên giữ màu của mình.
 * Vì sao không đánh màu tuần tự 1,2,3 theo thứ tự mở: mâm đầu chốt bill là toàn bộ mâm
 * còn lại đổi màu giữa ca — đúng lúc nhân viên vừa quen mắt.
 */
export function assignTrayColors(sessions: TraySessionLike[]): Map<string, TrayAssignment> {
  const trays = sessions
    .filter((s) => s.status === 'open' && s.tables.length >= 2)
    .sort(
      (a, b) =>
        a.opened_at.localeCompare(b.opened_at) || a.session_id.localeCompare(b.session_id),
    )

  const used = new Set<number>()
  const out = new Map<string, TrayAssignment>()

  trays.forEach((s, i) => {
    const start = hash(s.session_id) % TRAY_COLORS.length
    // Hết màu trống (mâm nhiều hơn bảng màu) thì đành quay về màu gốc và chấp nhận trùng.
    let slot = start
    for (let k = 0; k < TRAY_COLORS.length; k++) {
      const c = (start + k) % TRAY_COLORS.length
      if (!used.has(c)) {
        slot = c
        break
      }
    }
    used.add(slot)
    out.set(s.session_id, { color: TRAY_COLORS[slot], index: i + 1 })
  })

  return out
}
