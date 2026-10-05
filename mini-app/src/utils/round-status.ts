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

// Đơn KHÔNG BAO GIỜ được thu ngân xác nhận dù nằm ở 'pending' — khớp admin-web
// isReviewableOrder (lib/pos-work-queue.ts): món thu ngân ghi tay ở POS (đã phục vụ, không vào
// bếp) và món đặt trước chưa phát hành. Hiện "Chờ xác nhận" cho chúng thì nhãn vàng + chấm đỏ
// đứng mãi tới lúc đóng bàn.
const NEVER_REVIEWED: Record<string, Label> = {
  pos: { label: "Đã ghi vào bill", tone: "neutral" },
  reservation_preorder: { label: "Đã đặt trước", tone: "neutral" },
};

export function roundStatus(status: OrderState, ctx: RoundContext, source?: string): Label {
  if (status === "pending" && source && NEVER_REVIEWED[source]) return NEVER_REVIEWED[source];
  const table = tableFor(ctx);
  return table[status] ?? table.pending;
}

const isWaiting = (status: OrderState, ctx: RoundContext, source?: string) =>
  roundStatus(status, ctx, source).tone === "warning";

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

export function hasPendingRound(orders: Array<{ status: OrderState; source?: string }>, ctx: RoundContext): boolean {
  return orders.some((o) => isWaiting(o.status, ctx, o.source));
}

/** Khối "Đối soát tạm tính": lượt còn CHỜ (nhãn vàng) tách khỏi lượt đã vào bếp. */
export function reconcileRounds(
  orders: Array<{ status: OrderState; total_amount: number; source?: string }>,
  ctx: RoundContext,
): { inKitchen: number; pending: number; total: number } {
  let inKitchen = 0;
  let pending = 0;
  for (const o of orders) {
    // Lượt bị thu ngân từ chối chỉ hiện để đối chứng, không có tiền.
    if (o.status === "cancelled") continue;
    if (isWaiting(o.status, ctx, o.source)) pending += o.total_amount;
    else inKitchen += o.total_amount;
  }
  return { inKitchen, pending, total: inKitchen + pending };
}

/** Các bước thanh tiến trình theo mô hình bếp. Quán in phiếu không có bước "đang làm / xong". */
export function orderSteps(kitchenPolicy: RoundContext["kitchenPolicy"]): OrderState[] {
  return kitchenPolicy === "pos_confirmation" ? ["pending", "confirmed", "paid"] : ["pending", "confirmed", "cooking", "ready"];
}

/** Vị trí trạng thái trên thanh; quán không có bước bếp thì cooking/ready đứng ở "Đã vào bếp". */
export function stepIndex(status: OrderState, steps: OrderState[]): number {
  const direct = steps.indexOf(status);
  if (direct !== -1) return direct;
  if ((status === "cooking" || status === "ready") && !steps.includes("cooking")) return steps.indexOf("confirmed");
  return -1;
}

/** Lượt dùng mã giảm giá: create_order trừ thẳng vào total_amount, nên tổng các dòng món lớn
 *  hơn tiểu kế server — phần chênh hiện thành dòng "Giảm giá" cho khỏi lệch số. */
export function roundDiscount(linesSum: number, roundTotal: number): number {
  return linesSum > roundTotal ? linesSum - roundTotal : 0;
}

// Cùng chữ với POS (admin-web reject-order-sheet.tsx) để khách và thu ngân đối chứng một câu.
const REJECT_REASON: Record<string, string> = {
  out_of_stock: "Hết đồ",
  kitchen_overloaded: "Bếp quá tải",
  duplicate: "Đơn trùng",
  customer_requested: "Khách yêu cầu huỷ",
};

export function rejectionReasonLabel(code: string | null | undefined, note: string | null | undefined): string | null {
  if (!code) return null;
  if (code === "other") return note?.trim() || "Lý do khác";
  return REJECT_REASON[code] ?? "Lý do khác";
}
