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
import SpinSection from "@/components/spin/spin-section";
import SectionCard from "@/components/ui/section-card";
import { orderSteps, stepIndex } from "@/utils/round-status";
import { HourglassIcon, CircleCheckIcon, ChefHatIcon, PartyPopperIcon, CircleXIcon, FootprintsIcon, MapPinIcon, BikeIcon } from "@/components/common/icons";

const STATUS_CONFIG: Record<
  OrderState,
  { label: string; sublabel: string; icon: React.ReactNode; color: string }
> = {
  pending: {
    label: "Đơn đã gửi",
    sublabel: "Đang chờ xác nhận...",
    icon: <HourglassIcon className="size-14" />,
    color: "text-warning",
  },
  confirmed: {
    label: "Đã xác nhận",
    sublabel: "Bếp đã nhận đơn của bạn",
    icon: <CircleCheckIcon className="size-14" />,
    color: "text-success",
  },
  cooking: {
    label: "Đang làm món",
    sublabel: "Bếp đang chuẩn bị cho bạn",
    icon: <ChefHatIcon className="size-14" />,
    color: "text-info",
  },
  ready: {
    label: "Món xong rồi!",
    sublabel: "Nhân viên đang mang ra cho bạn",
    icon: <PartyPopperIcon className="size-14" />,
    color: "text-success",
  },
  paid: {
    label: "Đã thanh toán",
    sublabel: "Cảm ơn bạn đã đến!",
    icon: <CircleCheckIcon className="size-14" />,
    color: "text-success",
  },
  cancelled: {
    label: "Đã huỷ",
    sublabel: "Đơn hàng đã bị huỷ",
    icon: <CircleXIcon className="size-14" />,
    color: "text-critical",
  },
};

// Quán "thu ngân duyệt + in phiếu" (Bảo Lương) không có màn bếp → đổi chữ cho đúng việc thật.
// Bình thường quán này không vào trang này nữa (gọi xong sang thẳng Đơn gọi), chỉ còn link cũ.
const POS_CONFIRM_COPY: Partial<Record<OrderState, { label: string; sublabel: string }>> = {
  pending: { label: "Đã gửi đơn", sublabel: "Đang chờ thu ngân xác nhận…" },
  confirmed: { label: "Đã vào bếp", sublabel: "Quán đã nhận đơn, món sẽ được mang ra bàn" },
  cooking: { label: "Đã vào bếp", sublabel: "Quán đã nhận đơn, món sẽ được mang ra bàn" },
  ready: { label: "Đã vào bếp", sublabel: "Quán đã nhận đơn, món sẽ được mang ra bàn" },
};

function TakeawayInfoCard({ order }: { order: Order }) {
  const { storeName, storeAddress } = useAppStore();
  if (order.orderType === "dine_in") return null;

  if (order.orderType === "pickup") {
    const ready = order.status === "ready";
    return (
      <div className="mx-4 mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
        <p className="mb-1 flex items-center gap-1.5 text-xs text-text-secondary"><FootprintsIcon className="size-4" />Tự qua lấy</p>
        <p className="text-base font-semibold text-primary">{storeName || "Quán"}</p>
        {storeAddress && (
          <p className="mt-0.5 flex items-start gap-1.5 text-xs text-text-secondary"><MapPinIcon className="mt-px size-3.5 shrink-0" />{storeAddress}</p>
        )}
        <p className="mt-2 rounded-lg bg-surface px-3 py-2 text-xs text-text-secondary">
          {ready
            ? "Món xong rồi! Mời bạn qua quán lấy đồ."
            : "Bếp chuẩn bị theo thứ tự — bạn sẽ nhận thông báo Zalo khi món xong."}
        </p>
      </div>
    );
  }

  if (order.orderType === "delivery" && order.deliveryAddress) {
    return (
      <div className="mx-4 mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
        <p className="mb-1 flex items-center gap-1.5 text-xs text-text-secondary"><BikeIcon className="size-4" />Giao đến</p>
        <p className="text-sm font-semibold text-primary">{order.deliveryAddress}</p>
        <p className="mt-2 rounded-lg bg-surface px-3 py-2 text-xs text-warning">
          Phí ship do shipper thu trực tiếp khi giao
        </p>
      </div>
    );
  }

  return null;
}

export default function OrderStatusPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { zaloUserId, workflow } = useAppStore();
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
    icon: <CircleCheckIcon className="size-14" />,
    color: "text-success",
  };
  const kitchenPolicy = workflow?.kitchenReleasePolicy ?? "automatic";
  const steps = orderSteps(kitchenPolicy);
  const baseConfig = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;
  const posCopy = kitchenPolicy === "pos_confirmation" ? POS_CONFIRM_COPY[order.status] : undefined;
  const config = isCompleted ? COMPLETED_CONFIG : posCopy ? { ...baseConfig, ...posCopy } : baseConfig;
  const currentStepIdx = stepIndex(order.status, steps);
  const stepLabel = (step: OrderState) =>
    (kitchenPolicy === "pos_confirmation" ? POS_CONFIRM_COPY[step]?.label : undefined) ?? STATUS_CONFIG[step].label;

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
    <div className="flex h-full flex-col bg-background">
      <div className="no-scrollbar flex-1 overflow-y-auto pb-8">

        {/* Status hero */}
        <div className="mx-3 mt-3 flex flex-col items-center rounded-2xl bg-surface px-6 pb-7 pt-8 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
          <div className={cn("mb-3", config.color)}>{config.icon}</div>
          <h1 className={cn("text-2xl font-bold", config.color)}>
            {config.label}
          </h1>
          <p className="mt-1 text-center text-small text-text-secondary">
            {config.sublabel}
          </p>
        </div>

        {/* Progress steps */}
        {order.status !== "cancelled" && order.status !== "paid" && !isCompleted && (
          <SectionCard title="Tiến trình đơn hàng">
            <div className="flex items-start">
              {steps.map((step, idx) => {
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
                      {idx < steps.length - 1 && (
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
                      {stepLabel(step)}
                    </p>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        )}

        {/* Thông tin giao/lấy đơn mang về */}
        {order.orderType !== "dine_in" && <TakeawayInfoCard order={order} />}

        {/* Vòng quay may mắn — chỉ khi đơn có tiền thật; tự ẩn nếu quán tắt / lỗi */}
        {orderId &&
          ((order.paymentMethod === "zalo_checkout" && !!order.zalopayTransId) ||
            (order.paymentMethod === "cash" && order.status === "paid")) && (
            <SpinSection orderId={orderId} />
          )}

        {/* Chi tiết đơn */}
        <SectionCard
          title="Chi tiết đơn hàng"
          action={<span className="text-xxsmall text-text-secondary">#{orderId?.slice(-6).toUpperCase()}</span>}
        >
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
        </SectionCard>

        {/* Ghi chú */}
        {order.note && (
          <SectionCard title="Ghi chú">
            <p className="text-small text-text-primary">{order.note}</p>
          </SectionCard>
        )}

        {/* Nút gọi thêm — chỉ hiện khi ăn tại quán */}
        {order.orderType === "dine_in" && (
          <div className="mx-4 mt-4">
            <Button
              onClick={() => navigate("/menu")}
              className="w-full rounded-xl border-2 border-primary bg-surface py-3 font-semibold text-primary active:bg-primary/5"
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
              className="w-full rounded-xl bg-success-dot py-3 font-semibold text-white active:opacity-80"
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
