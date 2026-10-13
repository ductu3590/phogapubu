// Key localStorage dùng ở nhiều nơi. Key nào chứa dữ liệu cá nhân thì PHẢI có mặt trong
// clearPersonalData (services/account-storage.ts).
export const TAKEAWAY_FORM_KEY = "mevo_takeaway_form";
/** Đã bật hộp xin quyền Zalo (tên + SĐT) ở form Đặt bàn cho quán này — services/zalo-contact.ts. */
export const reservationZaloAskedKey = (storeId: string) => `mevo_reservation_zalo_asked:${storeId}`;
