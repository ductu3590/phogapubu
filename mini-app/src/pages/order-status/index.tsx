import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSnackbar } from "zmp-ui";
import { useOrderWithItems } from "@/services/order/order.queries";
import { useConfirmReceived } from "@/services/order/order.mutations";
import { supabase } from "@/services/supabase";
import { Order, OrderState } from "@/types/order.types";
import { formatCurrency } from "@/utils/format";
import { getItemLineTotal } from "@/utils/order-pricing";
import { Button } from "zmp-ui";
import { cn } from "@/utils/cn";
import { useAppStore } from "@/stores/app.store";

const STATUS_CONFIG: Record<
  OrderState,
  { label: string; sublabel: string; emoji: string; color: string }
> = {
  pending: {
    label: "Đơn đã gửi",
    sublabel: "Đang chờ xác nhận...",
    emoji: "⏳",
    color: "text-orange500",
  },
  confirmed: {
    label: "Đã xác nhận",
    sublabel: "Bếp đã nhận đơn của bạn",
    emoji: "✅",
    color: "text-green-600",
  },
  cooking: {
    label: "Đang làm món",
    sublabel: "Bếp đang chuẩn bị cho bạn",
    emoji: "🍳",
    color: "text-blue-500",
  },
  ready: {
    label: "Món xong rồi!",
    sublabel: "Nhân viên đang mang ra cho bạn",
    emoji: "🎉",
    color: "text-green-600",
  },
  paid: {
    label: "Đã thanh toán",
    sublabel: "Cảm ơn bạn đã đến!",
    emoji: "💚",
    color: "text-green-600",
  },
  cancelled: {
    label: "Đã huỷ",
    sublabel: "Đơn hàng đã bị huỷ",
    emoji: "❌",
    color: "text-red-500",
  },
};

const STATUS_STEPS: OrderState[] = ["pending", "confirmed", "cooking", "ready"];

function TakeawayInfoCard({ order }: { order: Order }) {
  const { storeName, storeAddress } = useAppStore();
  if (order.orderType === "dine_in") return null;

  if (order.orderType === "pickup") {
    const ready = order.status === "ready";
    return (
      <div className="mx-4 mt-4 rounded-xl border border-[#E8C9B3] bg-[#FBF4EF] p-4">
        <p className="mb-1 text-xs text-text-secondary">🚶 Tự qua lấy</p>
        <p className="text-base font-semibold text-primary">{storeName || "Quán"}</p>
        {storeAddress && (
          <p className="mt-0.5 text-xs text-text-secondary">📍 {storeAddress}</p>
        )}
        <p className="mt-2 rounded-lg bg-white px-3 py-2 text-xs text-text-secondary">
          {ready
            ? "🎉 Món xong rồi! Mời bạn qua quán lấy đồ."
            : "Bếp chuẩn bị theo thứ tự — bạn sẽ nhận thông báo Zalo khi món xong."}
        </p>
      </div>
    );
  }

  if (order.orderType === "delivery" && order.deliveryAddress) {
    return (
      <div className="mx-4 mt-4 rounded-xl border border-[#E8C9B3] bg-[#FBF4EF] p-4">
        <p className="mb-1 text-xs text-text-secondary">🛵 Giao đến</p>
        <p className="text-sm font-semibold text-primary">{order.deliveryAddress}</p>
        <p className="mt-2 rounded-lg bg-white px-3 py-2 text-xs text-[#92400E]">
          ⚠️ Phí ship do shipper thu trực tiếp khi giao
        </p>
      </div>
    );
  }

  return null;
}

export default function OrderStatusPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { zaloUserId } = useAppStore();
  const { openSnackbar } = useSnackbar();
  const { data: initialOrder, isLoading } = useOrderWithItems(orderId ?? "");
  const { mutate: confirmReceived, isPending: isConfirming } = useConfirmReceived();
  const [order, setOrder] = useState<Order | null>(null);

  // Sync initial data
  useEffect(() => {
    if (initialOrder) setOrder(initialOrder);
  }, [initialOrder]);

  // Subscribe Supabase Realtime cho đơn hàng này
  useEffect(() => {
    if (!orderId) return;

    const channel = supabase
      .channel(`order-status-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          const updated = payload.new as Record<string, unknown>;
          setOrder((prev) =>
            prev
              ? {
                  ...prev,
                  status: updated.status as OrderState,
                  updatedAt: updated.updated_at as string,
                  zalopayTransId:
                    (updated.zalopay_trans_id as string | null) ?? null,
                  readyAt: (updated.ready_at as string | null) ?? null,
                  completedAt: (updated.completed_at as string | null) ?? null,
                }
              : prev,
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId]);

  // Xoá localStorage khi đơn takeaway hoàn tất (đã thanh toán / huỷ / đã nhận)
  useEffect(() => {
    if (!orderId) return;
    if (order?.status === "paid" || order?.status === "cancelled" || order?.completedAt) {
      const stored = localStorage.getItem("mevo_last_takeaway_order");
      if (stored === orderId) {
        localStorage.removeItem("mevo_last_takeaway_order");
      }
    }
  }, [orderId, order?.status, order?.completedAt]);

  if (isLoading || !order) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="h-16 w-16 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-small text-text-secondary">Đang tải thông tin đơn...</p>
      </div>
    );
  }

  const isCompleted = !!order.completedAt;
  const isTakeaway = order.orderType !== "dine_in";
  // Đơn mang về đã xong nhưng khách chưa xác nhận nhận hàng
  const canConfirmReceive = isTakeaway && order.status === "ready" && !isCompleted;

  const COMPLETED_CONFIG = {
    label: "Đã hoàn thành",
    sublabel: "Cảm ơn bạn! Hẹn gặp lại.",
    emoji: "💚",
    color: "text-green-600",
  };
  const config = isCompleted
    ? COMPLETED_CONFIG
    : STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;
  const currentStepIdx = STATUS_STEPS.indexOf(order.status);

  const handleReceive = () => {
    if (!orderId) return;
    confirmReceived(
      { orderId, zaloUserId },
      {
        onSuccess: () =>
          openSnackbar({ text: "Đã xác nhận nhận hàng. Cảm ơn bạn!", type: "success" }),
        onError: () =>
          openSnackbar({ text: "Không xác nhận được, thử lại sau.", type: "error" }),
      },
    );
  };

  return (
    <div className="flex h-full flex-col bg-[#F7F8FA]">
      <div className="no-scrollbar flex-1 overflow-y-auto pb-8">

        {/* Status hero */}
        <div className="flex flex-col items-center bg-white px-6 pb-8 pt-10 shadow-sm">
          <div className="mb-3 text-6xl">{config.emoji}</div>
          <h1 className={cn("text-2xl font-bold", config.color)}>
            {config.label}
          </h1>
          <p className="mt-1 text-center text-small text-text-secondary">
            {config.sublabel}
          </p>
        </div>

        {/* Progress steps */}
        {order.status !== "cancelled" && order.status !== "paid" && !isCompleted && (
          <div className="mx-4 mt-4 rounded-xl bg-white p-4">
            <p className="mb-4 text-small-m font-semibold text-text-secondary">
              Tiến trình đơn hàng
            </p>
            <div className="flex items-start">
              {STATUS_STEPS.map((step, idx) => {
                const stepConfig = STATUS_CONFIG[step];
                const isDone = idx <= currentStepIdx;
                const isActive = idx === currentStepIdx;
                return (
                  <div key={step} className="flex flex-1 flex-col items-center">
                    <div className="flex w-full items-center">
                      {idx > 0 && (
                        <div
                          className={cn(
                            "h-0.5 flex-1 transition-colors",
                            idx <= currentStepIdx ? "bg-primary" : "bg-neutral100",
                          )}
                        />
                      )}
                      <div
                        className={cn(
                          "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm transition-colors",
                          isDone
                            ? "bg-primary text-white"
                            : "bg-neutral100 text-text-disabled",
                          isActive && "ring-4 ring-primary/20",
                        )}
                      >
                        {isDone ? "✓" : idx + 1}
                      </div>
                      {idx < STATUS_STEPS.length - 1 && (
                        <div
                          className={cn(
                            "h-0.5 flex-1 transition-colors",
                            idx < currentStepIdx ? "bg-primary" : "bg-neutral100",
                          )}
                        />
                      )}
                    </div>
                    <p
                      className={cn(
                        "mt-1 text-center text-xxxsmall",
                        isDone ? "font-medium text-primary" : "text-text-disabled",
                      )}
                    >
                      {stepConfig.label}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Thông tin giao/lấy đơn mang về */}
        {order.orderType !== "dine_in" && <TakeawayInfoCard order={order} />}

        {/* Chi tiết đơn */}
        <div className="mx-4 mt-4 rounded-xl bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-small-m font-semibold">Chi tiết đơn hàng</p>
            <p className="text-xxsmall text-text-secondary">
              #{orderId?.slice(-6).toUpperCase()}
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {(order.items ?? []).map((item) => (
              <div key={item.id} className="flex justify-between gap-2">
                <div className="flex-1">
                  <span className="text-small text-text-primary">
                    {item.name}
                    <span className="ml-1 text-text-secondary">×{item.quantity}</span>
                  </span>
                  {item.selectedToppings.length > 0 && (
                    <p className="text-xxsmall text-text-secondary">
                      {item.selectedToppings.map((t) => `+ ${t.name}`).join(", ")}
                    </p>
                  )}
                </div>
                <span className="text-small font-medium">
                  {formatCurrency(getItemLineTotal(item))}đ
                </span>
              </div>
            ))}
            <div className="border-t border-neutral100 pt-2">
              <div className="flex justify-between font-semibold">
                <span className="text-small">Tổng cộng</span>
                <span className="text-primary">
                  {formatCurrency(order.totalAmount)}đ
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Ghi chú */}
        {order.note && (
          <div className="mx-4 mt-3 rounded-xl bg-white p-4">
            <p className="mb-1 text-xxsmall text-text-secondary">Ghi chú</p>
            <p className="text-small text-text-primary">{order.note}</p>
          </div>
        )}

        {/* Nút gọi thêm — chỉ hiện khi ăn tại quán */}
        {order.orderType === "dine_in" && (
          <div className="mx-4 mt-4">
            <Button
              onClick={() => navigate("/menu")}
              className="w-full rounded-xl border-2 border-primary bg-white py-3 font-semibold text-primary active:bg-primary/5"
              fullWidth
            >
              Gọi thêm món
            </Button>
          </div>
        )}

        {/* Nút "Đã nhận" — đơn mang về đã xong, chưa xác nhận */}
        {canConfirmReceive && (
          <div className="mx-4 mt-4">
            <Button
              onClick={handleReceive}
              loading={isConfirming}
              className="w-full rounded-xl bg-[#1D9E75] py-3 font-semibold text-white active:opacity-80"
              fullWidth
            >
              Đã nhận
            </Button>
            <p className="mt-2 text-center text-xxsmall text-text-secondary">
              Tự hoàn thành sau 30 phút nếu không bấm
            </p>
          </div>
        )}

        {/* Nút về trang chủ — chỉ hiện khi đặt mang về / ship */}
        {order.orderType !== "dine_in" && (
          <div className="mx-4 mt-4 mb-6">
            <button
              onClick={() => navigate("/")}
              className="w-full rounded-xl border border-neutral100 py-3 text-small font-medium text-text-secondary active:bg-neutral50"
            >
              ← Về trang chủ
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
