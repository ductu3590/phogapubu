// Sơ đồ bàn của màn POS (/admin/cashier) — logic xếp lưới tách hẳn khỏi React để test được.
//
// Toạ độ là Ô LƯỚI, không phải pixel (spec 2026-09-03 §1.2): snap lưới thì không bao giờ có
// hai bàn chồng nhau, và sơ đồ không vỡ khi cửa sổ đổi cỡ.

export const LAYOUT_COLS = 12

export type LayoutTable = {
  id: string
  table_number: string
  pos_x: number | null
  pos_y: number | null
}

/** Bàn đã có chỗ đứng chắc chắn trên lưới. */
export type PlacedTable = LayoutTable & { x: number; y: number }

export type PositionPatch = { id: string; pos_x: number; pos_y: number }

const key = (x: number, y: number) => `${x},${y}`

function inGrid(x: number | null, y: number | null): boolean {
  return (
    x !== null &&
    y !== null &&
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    x < LAYOUT_COLS &&
    y >= 0
  )
}

// Ô trống đầu tiên tính từ (0,0) sang phải rồi xuống hàng.
function firstFree(taken: Set<string>): { x: number; y: number } {
  for (let y = 0; ; y++) {
    for (let x = 0; x < LAYOUT_COLS; x++) {
      if (!taken.has(key(x, y))) return { x, y }
    }
  }
}

/**
 * Xếp danh sách bàn vào lưới.
 *
 * Bàn đã có toạ độ hợp lệ giữ nguyên chỗ. Bàn chưa sắp (hoặc toạ độ hỏng/ngoài lưới) được
 * nhét vào ô trống đầu tiên, duyệt theo tên bàn kiểu số ("Bàn 2" trước "Bàn 10").
 * Hai bàn tranh nhau một ô (dữ liệu hỏng) thì bàn xét sau bị đẩy sang ô trống kế tiếp —
 * thà lệch một ô còn hơn vẽ đè mất một bàn.
 */
export function layoutTables(tables: LayoutTable[]): PlacedTable[] {
  const theoTen = [...tables].sort((a, b) =>
    a.table_number.localeCompare(b.table_number, 'vi', { numeric: true, sensitivity: 'base' }),
  )

  const taken = new Set<string>()
  const out: PlacedTable[] = []

  // Vòng 1: bàn đã sắp — giữ chỗ trước để bàn chưa sắp không cướp mất.
  for (const t of theoTen) {
    if (!inGrid(t.pos_x, t.pos_y)) continue
    const k = key(t.pos_x!, t.pos_y!)
    if (taken.has(k)) continue // tranh ô — để vòng 2 xử
    taken.add(k)
    out.push({ ...t, x: t.pos_x!, y: t.pos_y! })
  }

  // Vòng 2: mọi bàn còn lại.
  for (const t of theoTen) {
    if (out.some((p) => p.id === t.id)) continue
    const { x, y } = firstFree(taken)
    taken.add(key(x, y))
    out.push({ ...t, x, y })
  }

  return out.sort((a, b) => a.y - b.y || a.x - b.x)
}

/**
 * Kéo một bàn sang ô (x, y). Ô đang có bàn khác thì ĐỔI CHỖ hai bàn — không cho chồng, và
 * cũng không "đẩy dây chuyền" (khó đoán khi kéo nhanh giữa ca).
 * Toạ độ ngoài lưới hoặc id không tồn tại: trả nguyên danh sách, coi như thao tác không xảy ra.
 */
export function moveTable(
  placed: PlacedTable[],
  tableId: string,
  x: number,
  y: number,
): PlacedTable[] {
  if (!inGrid(x, y)) return placed
  const keo = placed.find((t) => t.id === tableId)
  if (!keo) return placed
  if (keo.x === x && keo.y === y) return placed

  const cho = placed.find((t) => t.x === x && t.y === y)
  const next = placed.map((t) => {
    if (t.id === keo.id) return { ...t, x, y }
    if (cho && t.id === cho.id) return { ...t, x: keo.x, y: keo.y }
    return t
  })
  return next.sort((a, b) => a.y - b.y || a.x - b.x)
}

/** Những bàn có toạ độ khác trước → đúng phần cần ghi xuống DB, không ghi thừa. */
export function changedPositions(before: PlacedTable[], after: PlacedTable[]): PositionPatch[] {
  const cu = new Map(before.map((t) => [t.id, t]))
  const out: PositionPatch[] = []
  for (const t of after) {
    const truoc = cu.get(t.id)
    if (!truoc || truoc.x !== t.x || truoc.y !== t.y) {
      out.push({ id: t.id, pos_x: t.x, pos_y: t.y })
    }
  }
  return out
}
