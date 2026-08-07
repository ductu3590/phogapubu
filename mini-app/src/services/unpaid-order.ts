// Đơn đã tạo nhưng khách chưa trả tiền — lưu qua localStorage để sống sót khi khách rời trang
// hoặc thoát hẳn mini-app.
//
// Hai nơi cùng đọc key này: trang giỏ hàng (dựng banner "Thanh toán chưa thành công") và hộp
// thoại nhắc lúc mở app (unpaid-order-prompt). Để mỗi nơi một bản copy là sớm muộn lệch key.

export const UNPAID_ORDER_KEY = "mevo_unpaid_order";

export type UnpaidOrder = { id: string; token: string };

export function loadUnpaidOrder(): UnpaidOrder | null {
  try {
    const raw = localStorage.getItem(UNPAID_ORDER_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<UnpaidOrder>;
    // Thiếu token thì banner vô dụng: "Sửa món" không huỷ được đơn → coi như không có.
    if (typeof p.id !== "string" || !p.id) return null;
    if (typeof p.token !== "string" || !p.token) return null;
    return { id: p.id, token: p.token };
  } catch {
    return null;
  }
}

export function saveUnpaidOrder(o: UnpaidOrder | null) {
  try {
    if (o) localStorage.setItem(UNPAID_ORDER_KEY, JSON.stringify(o));
    else localStorage.removeItem(UNPAID_ORDER_KEY);
  } catch {
    /* localStorage đầy hoặc bị chặn — chỉ mất khả năng dựng lại banner */
  }
}
