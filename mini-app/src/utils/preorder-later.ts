// Khách bấm "Để sau" ở thẻ lịch hẹn → ẩn hàng nút "Chọn món đặt trước / Để sau" của RIÊNG lượt đó,
// nhớ trên máy (mở lại app vẫn ẩn). Vẫn chọn món được trong Chi tiết đặt bàn nếu đổi ý.
type KV = { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void };

const key = (storeId: string, reservationId: string) => `mevo_preorder_later:${storeId}:${reservationId}`;

export function postponePreorder(storeId: string, reservationId: string, storage: KV = localStorage): void {
  try {
    storage.setItem(key(storeId, reservationId), "1");
  } catch {
    /* bộ nhớ bị chặn — chỉ ẩn trong phiên hiện tại (state của trang) */
  }
}

export function isPreorderPostponed(storeId: string, reservationId: string, storage: KV = localStorage): boolean {
  try {
    return storage.getItem(key(storeId, reservationId)) === "1";
  } catch {
    return false;
  }
}
