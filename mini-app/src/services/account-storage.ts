import { TAKEAWAY_FORM_KEY } from "@/constants/storage-keys";
import { clearBookingDraft, clearReservationProfile } from "@/services/reservation/reservation-storage";

/**
 * Xoá dữ liệu cá nhân trên máy (spec 2026-10-09 §6) — MỘT chỗ duy nhất liệt kê key cá nhân.
 * CỐ Ý KHÔNG xoá:
 *  - mevo_reservation_access* : xoá là khách không xem / huỷ được lịch hẹn của chính mình
 *  - mevo_device_id            : xoá là mất quyền chủ phiên bàn đang ngồi (mig 039)
 *  - mevo_cart                 : không phải dữ liệu cá nhân, tự hết hạn 6h
 */
export function clearPersonalData(storeId: string): void {
  clearReservationProfile(storeId);
  clearBookingDraft(storeId);
  try { localStorage.removeItem(TAKEAWAY_FORM_KEY); } catch { /* storage không khả dụng */ }
}
