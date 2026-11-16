// Đóng / mở lại bàn (FIX-BAN-CAU-HINH 2026-11-13). Một chỗ giữ nhãn nút cho trang Sơ đồ bàn & QR.
// (Từ 2026-11-16 bàn đã có đơn xoá được — lib/table-delete.ts, mig 142 — nên không còn câu "bấm Đóng bàn thay vì xoá".)
export const CLOSE_TABLE_LABEL = 'Đóng bàn'
export const REOPEN_TABLE_LABEL = 'Mở lại bàn'

export function closeTableConfirmText(tableNumber: string): string {
  return `${CLOSE_TABLE_LABEL} "${tableNumber}"?\n\n` +
    'Bàn sẽ ẩn khỏi sơ đồ POS, màn nhân viên và bản in QR; khách quét QR bàn này không gọi món được. ' +
    `Hoá đơn và báo cáo cũ vẫn giữ tên bàn. Bấm "${REOPEN_TABLE_LABEL}" bất cứ lúc nào để dùng lại.`
}
