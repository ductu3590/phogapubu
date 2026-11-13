// Đóng / mở lại bàn (FIX-BAN-CAU-HINH 2026-11-13). Một chỗ giữ nhãn nút để câu báo lỗi xoá bàn
// (lib/actions/tables.ts deleteTable) luôn nhắc ĐÚNG chữ trên nút ở trang Bàn & QR.
export const CLOSE_TABLE_LABEL = 'Đóng bàn'
export const REOPEN_TABLE_LABEL = 'Mở lại bàn'

export const DELETE_TABLE_HAS_ORDERS_ERROR =
  `Bàn này đã có đơn hàng nên không thể xoá. Bấm "${CLOSE_TABLE_LABEL}" để ẩn bàn thay vì xoá.`

export function closeTableConfirmText(tableNumber: string): string {
  return `${CLOSE_TABLE_LABEL} "${tableNumber}"?\n\n` +
    'Bàn sẽ ẩn khỏi sơ đồ POS, màn nhân viên và bản in QR; khách quét QR bàn này không gọi món được. ' +
    `Hoá đơn và báo cáo cũ vẫn giữ tên bàn. Bấm "${REOPEN_TABLE_LABEL}" bất cứ lúc nào để dùng lại.`
}
