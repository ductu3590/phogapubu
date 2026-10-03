// Màu nhận diện mâm — dùng CHUNG cho màn "Chọn bàn" (/staff/order) và màn "Bàn"
// (/staff/tables). Hai màn phải import cùng một hàm, nếu mỗi màn tự tính thì cùng một
// mâm sẽ ra hai màu khác nhau và nhân viên hết đường đối chiếu.

// ⚠️ Tailwind v4 quét class thẳng từ source, KHÔNG có file config để safelist.
// Mọi class ở đây phải là chuỗi NGUYÊN VẸN. Ghép động kiểu `bg-${key}-50` là Tailwind
// không nhìn thấy → build production ra màn hình trắng trơn không màu.
export type TrayColor = {
  key: string
  /** Khối bao ngoài của mâm ở màn Chọn bàn (nền trắng + vạch trái màu mâm) */
  box: string
  /** Nút bàn bên trong khối mâm (trung tính — màu đã có ở vạch của khối) */
  chip: string
  /** Dải màu dày bên trái thẻ phiên ở màn Bàn */
  bar: string
  /** Chữ tiêu đề "🍲 Mâm 1 · 3 bàn" */
  label: string
}

// Màu mâm chỉ là NHẬN DIỆN (mâm nào là mâm nào), KHÔNG phải trạng thái. Chốt 2026-10-02:
// - Chỉ còn vạch trái 4px + chữ "Mâm N"; nền ô/khối luôn trắng. Trạng thái bàn nói bằng chấm + chữ.
// - Cố tình KHÔNG có cam (màu nút), xanh lá / xanh dương / vàng / đỏ / xám (năm màu trạng thái,
//   components/ui/status.ts) và các sắc sát chúng (teal, emerald, sky, cyan, lime, rose).
//   Mâm tô xanh lá sẽ bị đọc thành "đang phục vụ".
export const TRAY_COLORS: TrayColor[] = [
  {
    key: 'violet',
    box: 'border-border bg-surface border-l-4 border-l-violet-400',
    chip: 'border-border-strong bg-surface text-foreground active:bg-item-hover',
    bar: 'border-l-4 border-l-violet-400',
    label: 'text-violet-700',
  },
  {
    key: 'pink',
    box: 'border-border bg-surface border-l-4 border-l-pink-400',
    chip: 'border-border-strong bg-surface text-foreground active:bg-item-hover',
    bar: 'border-l-4 border-l-pink-400',
    label: 'text-pink-700',
  },
  {
    key: 'indigo',
    box: 'border-border bg-surface border-l-4 border-l-indigo-400',
    chip: 'border-border-strong bg-surface text-foreground active:bg-item-hover',
    bar: 'border-l-4 border-l-indigo-400',
    label: 'text-indigo-700',
  },
  {
    key: 'fuchsia',
    box: 'border-border bg-surface border-l-4 border-l-fuchsia-400',
    chip: 'border-border-strong bg-surface text-foreground active:bg-item-hover',
    bar: 'border-l-4 border-l-fuchsia-400',
    label: 'text-fuchsia-700',
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
