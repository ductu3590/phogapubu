import type { ReservationProfile } from "@/types/reservation.types";
import { normalizeVnPhone } from "@/utils/booking-validation";

export type ProfilePatch = { customerName?: string; customerPhone?: string };

const EMPTY: ReservationProfile = { customerName: "", customerPhone: "" };

/**
 * Gộp hồ sơ trên máy (spec 2026-10-09 §5).
 * - Tên: overwriteName=true (khách tự sửa) thì đè, kể cả xoá trống; overwriteName=false (tên Zalo
 *   tự điền) chỉ điền khi hồ sơ CHƯA có tên — không đè tên khách đã tự sửa.
 * - SĐT: chuẩn hoá về 0xxxxxxxxx; số không hợp lệ thì giữ số cũ.
 */
export function mergeProfile(
  current: ReservationProfile | null,
  patch: ProfilePatch,
  opts: { overwriteName: boolean },
): ReservationProfile {
  const base = current ?? EMPTY;
  let customerName = base.customerName;
  if (patch.customerName !== undefined) {
    const name = patch.customerName.trim();
    if (opts.overwriteName) customerName = name;
    else if (!base.customerName.trim() && name) customerName = name;
  }
  let customerPhone = base.customerPhone;
  if (patch.customerPhone !== undefined) {
    const normalized = normalizeVnPhone(patch.customerPhone);
    if (normalized.ok) customerPhone = normalized.value;
  }
  return { customerName, customerPhone };
}

/** Điền ô tên/SĐT còn TRỐNG của một form từ hồ sơ; ô khách đã gõ thì giữ nguyên. */
export function prefillContact<T extends { customerName: string; customerPhone: string }>(
  form: T,
  profile: ReservationProfile | null,
): T {
  if (!profile) return form;
  return {
    ...form,
    customerName: form.customerName || profile.customerName,
    customerPhone: form.customerPhone || profile.customerPhone,
  };
}

/** 0912345678 → "0912 345 678"; chuỗi khác trả nguyên. */
export function formatPhoneDisplay(phone: string): string {
  return /^0\d{9}$/.test(phone) ? `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}` : phone;
}
