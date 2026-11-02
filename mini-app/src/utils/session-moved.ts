import type { TableSessionState } from "@/types/order.types";

/**
 * Thu ngân chuyển bàn của khách (mig 105): get_table_session_state trả state 'moved' kèm bàn mới.
 * Trả null nếu không phải 'moved'. App dùng kết quả để đổi tableId trong store + báo khách.
 * prevTableNumber giữ trong chữ ký cho nơi gọi; lời báo chỉ cần tên bàn mới.
 */
export function movedTableNotice(
  _prevTableNumber: string,
  st: TableSessionState,
): { tableId: string; tableNumber: string; message: string } | null {
  if (st.mode !== "postpay" || st.state !== "moved") return null;
  return {
    tableId: st.table_id,
    tableNumber: st.table_number,
    message: `Bàn của bạn đã chuyển sang ${st.table_number}`,
  };
}
