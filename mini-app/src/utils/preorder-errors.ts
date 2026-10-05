// Gửi món đặt trước lỗi thì hiện gì / làm gì. Lỗi "có thể đã gửi" xảy ra khi lần gửi trước TỚI
// server nhưng rớt mạng trước khi app nhận trả lời, rồi khách sửa giỏ và gửi lại cùng mã yêu cầu
// (server: preorder_request_payload_mismatch — mig 071), hoặc 2 lệnh gửi cùng lúc đụng chỉ mục
// orders_one_active_reservation_preorder. Khi đó KHÔNG để khách kẹt: app phải kiểm lại món đã gửi.
const FALLBACK = "Không thể gửi món, vui lòng thử lại.";

export function preorderSubmitError(cause: unknown): { maybeSent: boolean; text: string } {
  const raw = cause && typeof cause === "object" && "message" in cause ? String((cause as { message: unknown }).message ?? "") : "";
  const message = raw.trim();
  if (
    message === "preorder_request_payload_mismatch" ||
    message.includes("orders_one_active_reservation_preorder") ||
    message.startsWith("Món đặt trước đã gửi") ||
    message.startsWith("Món đặt trước đã khóa")
  ) {
    return { maybeSent: true, text: "Món đặt trước có thể đã được gửi ở lần trước. Đang kiểm tra lại…" };
  }
  // Mã kỹ thuật (snake_case / tiếng Anh) hoặc lỗi mạng → câu dự phòng; câu tiếng Việt của server → giữ.
  if (!message || /^[a-z0-9_]+$/.test(message) || /^(Failed to fetch|NetworkError|TypeError)/i.test(message)) {
    return { maybeSent: false, text: FALLBACK };
  }
  return { maybeSent: false, text: message };
}
