import { authorize, getSetting, getUserInfo } from "zmp-sdk";
import { fetchZaloPhone } from "./zalo-phone";
import { missingScopes } from "@/utils/account-permissions";
import { reservationZaloAskedKey } from "@/constants/storage-keys";

// Tự điền Tên + SĐT form Đặt bàn từ Zalo. Hộp xin quyền của Zalo chỉ bật MỘT lần mỗi máy, mỗi quán:
// khách đã trả lời (đồng ý hay từ chối) thì lần sau mở form không hỏi lại — từ chối thì nhập tay.
// Đã cấp quyền từ trước (vd ở trang Tài khoản) thì không bật hộp, chỉ âm thầm đọc.
// "Xoá thông tin cá nhân" (account-storage.ts) xoá cờ đã hỏi → lần sau hỏi lại.
export type ZaloContact = { name?: string; phone?: string };

function hasAsked(storeId: string): boolean {
  try { return localStorage.getItem(reservationZaloAskedKey(storeId)) === "1"; } catch { return false; }
}

function markAsked(storeId: string): void {
  try { localStorage.setItem(reservationZaloAskedKey(storeId), "1"); } catch { /* máy chặn storage — chấp nhận hỏi lại */ }
}

export async function requestZaloContact(storeId: string): Promise<ZaloContact> {
  try {
    let { authSetting } = await getSetting();
    const missing = missingScopes(authSetting);
    if (missing.length > 0 && !hasAsked(storeId)) {
      markAsked(storeId);
      try { await authorize({ scopes: missing }); } catch { /* khách từ chối — nhập tay */ }
      ({ authSetting } = await getSetting());
    }

    const contact: ZaloContact = {};
    if (authSetting?.["scope.userInfo"]) {
      const { userInfo } = await getUserInfo({ avatarType: "normal" });
      const name = userInfo?.name?.trim();
      if (name) contact.name = name;
    }
    if (authSetting?.["scope.userPhonenumber"]) {
      const result = await fetchZaloPhone(storeId);
      if (result.ok) contact.phone = result.phone;
    }
    return contact;
  } catch {
    return {};
  }
}
