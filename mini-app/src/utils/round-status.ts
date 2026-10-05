import type { OrderState } from "@/types/order.types";

export type RoundTone = "warning" | "info" | "success" | "critical" | "neutral";
export type RoundContext = { paymentTiming: "prepay" | "postpay"; kitchenPolicy: "automatic" | "pos_confirmation" };
type Label = { label: string; tone: RoundTone };

// Nhãn trạng thái một LƯỢT gọi món theo MÔ HÌNH quán (không theo tên quán).
// Quán "thu ngân duyệt + in phiếu" (Bảo Lương) không có màn bếp: không ai bấm Đang nấu/Xong,
// nên confirmed/cooking/ready đều là "Đã vào bếp" — tuyệt đối không hiện bước bếp giả.
const POS_CONFIRM: Record<OrderState, Label> = {
  pending: { label: "Chờ xác nhận", tone: "warning" },
  confirmed: { label: "Đã vào bếp", tone: "info" },
  cooking: { label: "Đã vào bếp", tone: "info" },
  ready: { label: "Đã vào bếp", tone: "info" },
  paid: { label: "Đã thanh toán", tone: "success" },
  cancelled: { label: "Bị từ chối", tone: "critical" },
};

// Trả sau + bếp tự nhận đơn: đơn tiền mặt vào bếp ngay khi gửi.
const POSTPAY_AUTO: Record<OrderState, Label> = {
  pending: { label: "Đã gửi bếp", tone: "info" },
  confirmed: { label: "Đã vào bếp", tone: "info" },
  cooking: { label: "Đang làm", tone: "info" },
  ready: { label: "Món xong", tone: "success" },
  paid: { label: "Đã thanh toán", tone: "success" },
  cancelled: { label: "Đã huỷ", tone: "critical" },
};

// Trả trước (Pubu): pending = chưa thanh toán xong.
const PREPAY: Record<OrderState, Label> = {
  pending: { label: "Chờ thanh toán", tone: "warning" },
  confirmed: { label: "Đã vào bếp", tone: "info" },
  cooking: { label: "Đang làm", tone: "info" },
  ready: { label: "Món xong", tone: "success" },
  paid: { label: "Hoàn tất", tone: "success" },
  cancelled: { label: "Đã huỷ", tone: "critical" },
};

function tableFor(ctx: RoundContext): Record<OrderState, Label> {
  if (ctx.paymentTiming === "prepay") return PREPAY;
  return ctx.kitchenPolicy === "pos_confirmation" ? POS_CONFIRM : POSTPAY_AUTO;
}

export function roundStatus(status: OrderState, ctx: RoundContext): Label {
  const table = tableFor(ctx);
  return table[status] ?? table.pending;
}

const SOURCE: Record<string, string> = {
  staff: "Nhân viên gọi hộ",
  pos: "Quán thêm",
  reservation_preorder: "Món đặt trước",
};

export function roundSourceLabel(source: string): string | null {
  return SOURCE[source] ?? null;
}

/** Món tặng (void_type = 'gift') hiện "Đã tặng · 0đ" và không cộng vào tổng. */
export function lineLabel(item: { quantity: number; price: number; void_type?: string | null }): { gift: boolean; amount: number } {
  if (item.void_type === "gift") return { gift: true, amount: 0 };
  return { gift: false, amount: item.price * item.quantity };
}

export function hasPendingRound(orders: Array<{ status: OrderState }>, ctx: RoundContext): boolean {
  return orders.some((o) => roundStatus(o.status, ctx).label === "Chờ xác nhận");
}
