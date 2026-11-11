import type { StorePaymentTiming } from "./store-model";

// Lời mời quan tâm OA + cấp quyền tên/SĐT (PermissionSheet và thẻ CTA ở trang Thông tin nhà hàng).
// Quán trả trước: bếp báo món xong qua ZNS, có form mang về → giữ nguyên lời cũ.
// Quán trả sau (quán nhậu gọi món tại bàn): KHÔNG có màn bếp nên không ai gửi ZNS "món xong",
// cũng không có mang về → chỉ hứa đúng những gì có thật: tin/ưu đãi của quán, nhắn tin cho quán,
// và điền sẵn tên + SĐT ở form Đặt bàn (services/zalo-contact.ts đọc quyền đã cấp).
export type OaFollowCopy = {
  followTitle: string;
  followDesc: string;
  contactTitle: string;
  contactDesc: string;
  ctaDesc: string;
};

const PREPAY: OaFollowCopy = {
  followTitle: "Nhận thông báo Zalo (ZNS)",
  followDesc: "Biết ngay khi món xong. Hoàn toàn miễn phí.",
  contactTitle: "Tên & Số điện thoại",
  contactDesc: "Điền form mang về nhanh hơn. Không spam.",
  ctaDesc: "Thông báo khi món xong + điền form nhanh hơn.",
};

const POSTPAY: OaFollowCopy = {
  followTitle: "Quan tâm trang Zalo của quán",
  followDesc: "Nhận tin tức, ưu đãi của quán và nhắn tin cho quán qua Zalo. Hoàn toàn miễn phí.",
  contactTitle: "Tên & Số điện thoại",
  contactDesc: "Điền sẵn khi bạn đặt bàn. Không spam.",
  ctaDesc: "Nhận tin tức, ưu đãi của quán và nhắn tin cho quán qua Zalo.",
};

export function oaFollowCopy(paymentTiming: StorePaymentTiming): OaFollowCopy {
  return paymentTiming === "postpay" ? POSTPAY : PREPAY;
}
