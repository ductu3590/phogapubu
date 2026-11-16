// Xoá bàn (kể cả bàn đã có đơn, mig 142): đơn + doanh thu cũ của bàn bị xoá dồn sang MỘT "bàn nhận".
// Anh Tú 2026-11-16: "doanh thu cũ chuyển sang bàn số 1" → bàn nhận = bàn ĐẦU TIÊN theo thứ tự tên tự nhiên
// ("Bàn 2" trước "Bàn 10") trong số bàn CÒN LẠI; ưu tiên bàn đang dùng, chỉ còn bàn đã Đóng thì lấy bàn đã Đóng.
// Dùng chung cho câu xác nhận ở giao diện và server action — hai bên chọn cùng một bàn.

export type DeletableTable = { id: string; table_number: string; is_active: boolean }

const byName = (a: DeletableTable, b: DeletableTable) =>
  a.table_number.localeCompare(b.table_number, 'vi', { numeric: true, sensitivity: 'base' })

/** Bàn nhận lịch sử khi xoá `deleteIds`; null = không còn bàn nào (xoá hết bàn). */
export function pickHistoryTarget(tables: DeletableTable[], deleteIds: Iterable<string>): DeletableTable | null {
  const gone = new Set(deleteIds)
  const rest = tables.filter((t) => !gone.has(t.id))
  const pool = rest.some((t) => t.is_active) ? rest.filter((t) => t.is_active) : rest
  return [...pool].sort(byName)[0] ?? null
}

/** Câu hỏi lại trước khi xoá — nói rõ đơn cũ chuyển sang bàn nào. */
export function deleteTablesConfirmText(tables: DeletableTable[], deleteIds: string[]): string {
  const picked = tables.filter((t) => deleteIds.includes(t.id)).sort(byName)
  const names = picked.length <= 6
    ? picked.map((t) => `"${t.table_number}"`).join(', ')
    : `${picked.slice(0, 5).map((t) => `"${t.table_number}"`).join(', ')} và ${picked.length - 5} bàn khác`
  const target = pickHistoryTarget(tables, deleteIds)
  const history = target
    ? `Bàn nào đã từng có đơn: đơn cũ và doanh thu chuyển sang "${target.table_number}", báo cáo không mất tiền.`
    : 'Đây là toàn bộ bàn của quán: bàn đã từng có đơn sẽ KHÔNG xoá được (không còn bàn nào nhận doanh thu cũ).'
  return `Xoá ${picked.length === 1 ? 'bàn' : `${picked.length} bàn`} ${names}?\n\n${history}\n` +
    'Mã QR in cho bàn bị xoá sẽ không gọi món được nữa. Thao tác không hoàn tác được.'
}
