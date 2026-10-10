// Quyền Zalo trang Tài khoản xin ngay khi khách mở trang: tên/ảnh/ID + số điện thoại.
export const ACCOUNT_SCOPES = ["scope.userInfo", "scope.userPhonenumber"] as const;
export type AccountScope = (typeof ACCOUNT_SCOPES)[number];

/** Quyền còn thiếu theo `getSetting().authSetting` (false = khách đã từ chối cũng tính là thiếu). */
export function missingScopes(authSetting: Partial<Record<string, boolean>> | undefined): AccountScope[] {
  return ACCOUNT_SCOPES.filter((scope) => !authSetting?.[scope]);
}
