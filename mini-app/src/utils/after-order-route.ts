// Gọi món xong đi đâu (quyết định 2026-10-05): quán nhậu trả sau gọi nhiều lượt → sang thẳng
// tab Đơn gọi để khách thấy cả bàn + nút Gọi thêm món; replace để Quay lại không về giỏ đã gửi.
// Trả trước / mang về vẫn vào Trạng thái đơn vì khách cần biết đã thanh toán xong chưa.
export function afterOrderRoute(input: {
  isPostpayDineIn: boolean;
  kitchenPolicy: "automatic" | "pos_confirmation";
  orderId: string;
}): { path: string; replace: boolean; toast: string | null } {
  if (input.isPostpayDineIn) {
    return {
      path: "/session-orders",
      replace: true,
      toast: input.kitchenPolicy === "pos_confirmation" ? "Đã gửi món, chờ thu ngân xác nhận" : "Đã gửi món cho bếp",
    };
  }
  return { path: `/order-status/${input.orderId}`, replace: false, toast: null };
}
