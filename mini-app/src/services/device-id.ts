// Định danh THIẾT BỊ cho phiên bàn (trả sau).
//
// Vì sao cần: chủ phiên đáng lẽ khớp bằng `zalo_user_id`, nhưng `getUserID()` có thể fail
// vĩnh viễn (khách không mở trong Zalo, hoặc lỗi SDK — app.tsx nuốt lỗi im lặng). Nếu chỉ khoá
// theo Zalo UID thì khách không lấy được UID sẽ KHÔNG BAO GIỜ làm chủ phiên được.
// Nên chủ phiên khớp MỘT TRONG HAI chân: Zalo UID hoặc device id (spec 2026-08-20 PB5).
// Mất app = mất device id nhưng còn Zalo UID; không có Zalo UID thì còn device id.
//
// KHÔNG scope theo store_id — nhất quán với `mevo_cart`: mỗi quán là một Zalo Mini App riêng
// nên localStorage đã tách sẵn theo quán.

export const DEVICE_ID_KEY = "mevo_device_id";

// Dự phòng khi localStorage bị chặn (chế độ riêng tư, WebView khoá storage): giữ id trong bộ
// nhớ để phiên hiện tại vẫn dùng được, mất khi đóng app — vẫn hơn là không có gì.
let memoryId: string | null = null;

function randomId(): string {
  // crypto.randomUUID chỉ có từ Safari 15.4 / Chrome 92, mà browserslist của mini-app đỡ tới
  // tận Android 5 / iOS 9.3 → phải có đường lui.
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      const b = new Uint8Array(16);
      crypto.getRandomValues(b);
      return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    }
  } catch {
    /* rơi xuống nhánh dưới */
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

export function getOrCreateDeviceId(): string {
  if (memoryId) return memoryId;
  try {
    const saved = localStorage.getItem(DEVICE_ID_KEY);
    if (saved && saved.length > 0) {
      memoryId = saved;
      return saved;
    }
  } catch {
    /* không đọc được: sinh id tạm bên dưới */
  }
  const fresh = randomId();
  memoryId = fresh;
  try {
    localStorage.setItem(DEVICE_ID_KEY, fresh);
  } catch {
    /* không ghi được: id chỉ sống trong phiên này */
  }
  return fresh;
}
