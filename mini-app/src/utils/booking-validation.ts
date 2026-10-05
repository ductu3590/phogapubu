// Kiểm số điện thoại đặt bàn NGAY trên app (trước đây chỉ server kiểm "6–20 ký tự" và câu lỗi bị
// che thành "Không thể gửi…"). Số Việt Nam: 10 chữ số bắt đầu bằng 0; nhận cả +84 / 84 và dấu
// cách, chấm, gạch — lưu về dạng 0xxxxxxxxx.
export function normalizeVnPhone(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const compact = raw.trim().replace(/[\s.\-()]/g, "");
  if (!compact) return { ok: false, error: "Vui lòng nhập số điện thoại để quán liên hệ." };
  const local = compact.startsWith("+84") ? `0${compact.slice(3)}` : /^84\d{9}$/.test(compact) ? `0${compact.slice(2)}` : compact;
  if (!/^0\d{9}$/.test(local)) {
    return { ok: false, error: "Số điện thoại cần đủ 10 số, bắt đầu bằng 0 (ví dụ 0962 345 678)." };
  }
  return { ok: true, value: local };
}

/** Câu lỗi để hiện cho khách. Lỗi Supabase là object thường (không phải Error) nhưng có `message`
 *  tiếng Việt từ server — phải đọc ra, không che bằng câu chung. */
export function errorMessage(cause: unknown, fallback: string): string {
  if (cause && typeof cause === "object" && "message" in cause) {
    const message = (cause as { message: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return fallback;
}
