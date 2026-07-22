import { useState, useEffect } from "react";
import { useSnackbar } from "zmp-ui";
import { useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app.store";
import { useSessionOrders, useTakeawayOrders } from "@/services/order/order.queries";
import { useCallStaff, useConfirmReceived } from "@/services/order/order.mutations";
import { orderService } from "@/services/order/order.api";
import { supabase } from "@/services/supabase";
import { formatCurrency } from "@/utils/format";
import { GET_SESSION_ORDERS_KEY } from "@/constants/api";
import type { SessionOrder, TakeawayOrder, OrderItem } from "@/types/order.types";

const UNPAID_STATUSES = new Set(["pending", "confirmed", "cooking", "ready"]);

// Hình thức thanh toán + trạng thái thanh toán (dine-in)
function getPaymentInfo(
  paymentMethod: "zalo_checkout" | "cash",
  status: string,
): { icon: string; label: string; paid: boolean } {
  if (paymentMethod === "zalo_checkout") {
    return { icon: "💳", label: "ZaloPay", paid: status !== "pending" };
  }
  return { icon: "💵", label: "Tiền mặt", paid: status === "paid" };
}

// Hook dùng chung: mở/đóng card + fetch món lần đầu
function useExpandableItems() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadingItemsId, setLoadingItemsId] = useState<string | null>(null);
  const [cachedItems, setCachedItems] = useState<Record<string, OrderItem[]>>({});

  const toggle = async (orderId: string) => {
    if (expandedId === orderId) { setExpandedId(null); return; }
    setExpandedId(orderId);
    if (!cachedItems[orderId]) {
      setLoadingItemsId(orderId);
      try {
        const full = await orderService.getOrderWithItems(orderId);
        setCachedItems((prev) => ({ ...prev, [orderId]: full.items ?? [] }));
      } catch {
        // fail silently — items sẽ là rỗng
      } finally {
        setLoadingItemsId(null);
      }
    }
  };

  return { expandedId, loadingItemsId, cachedItems, toggle };
}

export default function SessionOrdersPage() {
  const { orderMode } = useAppStore();
  return orderMode === "takeaway" ? <TakeawayOrdersView /> : <DineInOrdersView />;
}

// ============================================================
// Chế độ tại quán (giữ nguyên hành vi cũ — chỉ đổi tên tab "Đơn hàng")
// ============================================================
function DineInOrdersView() {
  const { zaloUserId, tableId, tableNumber, storeId } = useAppStore();
  const { openSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const [calledAt, setCalledAt] = useState<number | null>(null);

  const { expandedId, loadingItemsId, cachedItems, toggle } = useExpandableItems();
  const { data: orders, isLoading } = useSessionOrders(zaloUserId, tableId);
  const { mutate: callStaff, isPending: isCalling } = useCallStaff();

  // Realtime: tự cập nhật khi admin web thay đổi trạng thái đơn
  useEffect(() => {
    if (!tableId) return;

    const channel = supabase
      .channel(`session-orders-${tableId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `table_id=eq.${tableId}` },
        () => { void queryClient.invalidateQueries({ queryKey: [GET_SESSION_ORDERS_KEY] }); },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [tableId, queryClient]);

  const grandTotal = (orders ?? []).reduce((sum, o) => sum + o.totalAmount, 0);
  const hasUnpaid = (orders ?? []).some((o) => UNPAID_STATUSES.has(o.status));

  // Gọi nhân viên thanh toán — throttle 60 giây
  const handleCallStaff = () => {
    if (calledAt && Date.now() - calledAt < 60_000) {
      openSnackbar({ text: "Đã gọi rồi, nhân viên đang đến!", type: "warning" });
      return;
    }
    callStaff(
      { storeId, tableId, tableNumber, type: "payment" },
      {
        onSuccess: () => {
          setCalledAt(Date.now());
          openSnackbar({ text: "Đã gọi nhân viên! Vui lòng chờ.", type: "success" });
        },
        onError: () => {
          openSnackbar({ text: "Gọi thất bại, thử lại sau.", type: "error" });
        },
      },
    );
  };

  // Chưa quét QR
  if (!zaloUserId || !tableId) {
    return (
      <div className="flex h-full flex-col bg-[#F7F8FA]">
        <Header title="Đơn hàng" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="text-4xl">📋</div>
          <p className="font-medium text-text-primary">Quét QR tại bàn trước</p>
          <p className="text-small text-text-secondary">
            Vui lòng dùng Zalo quét mã QR trên bàn để xem lịch sử gọi món.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#F7F8FA]">
      <Header title="Đơn hàng" subtitle={tableNumber || undefined} />

      <div className="no-scrollbar flex-1 overflow-y-auto pb-6">
        {/* Nút "Gọi thanh toán" — trong content, tránh đè Zalo overlay */}
        {hasUnpaid && (
          <div className="mx-3.5 mt-3">
            <button
              onClick={handleCallStaff}
              disabled={isCalling}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-50 py-3 text-orange-500 active:opacity-70 disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span className="text-small-m font-semibold">Gọi thanh toán</span>
            </button>
          </div>
        )}

        {isLoading ? (
          <ListSkeleton />
        ) : !orders || orders.length === 0 ? (
          <EmptyState
            title="Chưa gọi món nào"
            subtitle="Vào tab Menu để chọn món nhé!"
          />
        ) : (
          <>
            <div className="mx-3.5 mt-3 space-y-3">
              {orders.map((order, idx) => (
                <DineInOrderCard
                  key={order.id}
                  order={order}
                  label={`Lần ${orders.length - idx}`}
                  isExpanded={expandedId === order.id}
                  isLoadingItems={loadingItemsId === order.id}
                  items={cachedItems[order.id] ?? null}
                  paymentInfo={getPaymentInfo(order.paymentMethod, order.status)}
                  onToggle={() => void toggle(order.id)}
                />
              ))}
            </div>

            <div className="mx-3.5 mt-3 rounded-xl bg-white px-4 py-3">
              <div className="flex justify-between">
                <p className="text-small text-text-secondary">
                  Tổng cộng {orders.length} lần gọi
                </p>
                <p className="text-large-m font-bold text-primary">
                  {formatCurrency(grandTotal)}đ
                </p>
              </div>
              {hasUnpaid && (
                <p className="mt-1.5 text-xxsmall text-text-secondary">
                  Nhấn "Gọi thanh toán" bên trên để nhân viên ra thanh toán cho bạn.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Chế độ mang về — lịch sử 30 ngày + nút "Đã nhận"
// ============================================================
function TakeawayOrdersView() {
  const { zaloUserId, storeId } = useAppStore();
  const { openSnackbar } = useSnackbar();
  const { expandedId, loadingItemsId, cachedItems, toggle } = useExpandableItems();
  const { data: orders, isLoading } = useTakeawayOrders(zaloUserId, storeId);
  const { mutate: confirmReceived, isPending: isConfirming } = useConfirmReceived();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const handleReceive = (orderId: string) => {
    setConfirmingId(orderId);
    confirmReceived(
      { orderId, zaloUserId },
      {
        onSuccess: () => {
          openSnackbar({ text: "Đã xác nhận nhận hàng. Cảm ơn bạn!", type: "success" });
        },
        onError: () => {
          openSnackbar({ text: "Không xác nhận được, thử lại sau.", type: "error" });
        },
        onSettled: () => setConfirmingId(null),
      },
    );
  };

  // Chưa lấy được Zalo user id (chưa mở từ Zalo / chưa cấp quyền)
  if (!zaloUserId) {
    return (
      <div className="flex h-full flex-col bg-[#F7F8FA]">
        <Header title="Đơn hàng" subtitle="Mang về / Ship" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="text-4xl">📦</div>
          <p className="font-medium text-text-primary">Chưa có thông tin đơn</p>
          <p className="text-small text-text-secondary">
            Vui lòng mở Mini App trong Zalo để xem đơn mang về của bạn.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#F7F8FA]">
      <Header title="Đơn hàng" subtitle="Mang về / Ship" />

      <div className="no-scrollbar flex-1 overflow-y-auto pb-6">
        {isLoading ? (
          <ListSkeleton />
        ) : !orders || orders.length === 0 ? (
          <EmptyState
            title="Chưa có đơn mang về nào"
            subtitle="Vào tab Menu để đặt món mang về nhé!"
          />
        ) : (
          <>
            <div className="mx-3.5 mt-3 space-y-3">
              {orders.map((order) => (
                <TakeawayOrderCard
                  key={order.id}
                  order={order}
                  isExpanded={expandedId === order.id}
                  isLoadingItems={loadingItemsId === order.id}
                  items={cachedItems[order.id] ?? null}
                  isConfirming={isConfirming && confirmingId === order.id}
                  onToggle={() => void toggle(order.id)}
                  onReceive={() => handleReceive(order.id)}
                />
              ))}
            </div>
            <p className="mt-3 text-center text-xxsmall text-text-secondary">
              Lịch sử 30 ngày gần đây
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Sub-components dùng chung
// ============================================================

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div
      className="flex-shrink-0 bg-white px-4 pb-2 shadow-sm"
      style={{ paddingTop: "calc(var(--zaui-safe-area-inset-top, 0px) + 16px)" }}
    >
      <p className="text-xlarge-sb font-bold text-text-primary">{title}</p>
      {subtitle && <p className="text-small text-text-secondary">{subtitle}</p>}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="mx-3.5 mt-3 space-y-3">
      {[1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-white" />)}
    </div>
  );
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="text-4xl">🍽️</div>
      <p className="font-medium text-text-primary">{title}</p>
      <p className="text-small text-text-secondary">{subtitle}</p>
    </div>
  );
}

function ItemsList({
  isLoadingItems,
  items,
}: {
  isLoadingItems: boolean;
  items: OrderItem[] | null;
}) {
  return (
    <div className="border-t border-neutral100 px-4 pb-3 pt-2">
      {isLoadingItems ? (
        <div className="space-y-2 py-2">
          {[1, 2].map((i) => <div key={i} className="h-5 animate-pulse rounded bg-neutral100" />)}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {(items ?? []).map((item) => (
            <li key={item.id} className="flex items-center justify-between">
              <span className="text-small text-text-primary">
                <span className="font-semibold">×{item.quantity}</span> {item.name}
              </span>
              <span className="text-small text-text-secondary">
                {formatCurrency(item.price * item.quantity)}đ
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Chevron({ isExpanded }: { isExpanded: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-4 w-4 text-neutral300 transition-transform ${isExpanded ? "rotate-180" : ""}`}
      fill="none" stroke="currentColor" strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function DineInOrderCard({
  order,
  label,
  isExpanded,
  isLoadingItems,
  items,
  paymentInfo,
  onToggle,
}: {
  order: SessionOrder;
  label: string;
  isExpanded: boolean;
  isLoadingItems: boolean;
  items: OrderItem[] | null;
  paymentInfo: { icon: string; label: string; paid: boolean };
  onToggle: () => void;
}) {
  const time = new Date(order.createdAt).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="rounded-xl bg-white">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div>
          <p className="text-small-m font-semibold text-text-primary">
            {label} · {time}
          </p>
          <p className="mt-0.5 text-xxsmall text-text-secondary">
            {paymentInfo.icon} {paymentInfo.label}
            {" · "}
            <span className={paymentInfo.paid ? "font-semibold text-green-600" : "text-orange-500"}>
              {paymentInfo.paid ? "Đã thanh toán" : "Chưa thanh toán"}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-small font-semibold text-primary">
            {formatCurrency(order.totalAmount)}đ
          </p>
          <Chevron isExpanded={isExpanded} />
        </div>
      </button>

      {isExpanded && <ItemsList isLoadingItems={isLoadingItems} items={items} />}
    </div>
  );
}

// Suy ra badge trạng thái cho đơn mang về (mục 5.6 spec)
function getTakeawayStatus(order: TakeawayOrder): {
  label: string;
  cls: string;
  showReceive: boolean;
} {
  if (order.completedAt) {
    return { label: "Đã hoàn thành", cls: "bg-[#E1F5EE] text-[#0F6E56]", showReceive: false };
  }
  if (order.status === "ready") {
    return { label: "Món xong — chờ nhận", cls: "bg-[#FAEEDA] text-[#854F0B]", showReceive: true };
  }
  if (order.status === "cooking") {
    return { label: "Đang làm", cls: "bg-[#E6F1FB] text-[#185FA5]", showReceive: false };
  }
  return { label: "Đang xử lý", cls: "bg-neutral100 text-text-secondary", showReceive: false };
}

function TakeawayOrderCard({
  order,
  isExpanded,
  isLoadingItems,
  items,
  isConfirming,
  onToggle,
  onReceive,
}: {
  order: TakeawayOrder;
  isExpanded: boolean;
  isLoadingItems: boolean;
  items: OrderItem[] | null;
  isConfirming: boolean;
  onToggle: () => void;
  onReceive: () => void;
}) {
  const time = new Date(order.createdAt).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
  const typeLabel = order.orderType === "delivery" ? "🛵 Ship" : "🚶 Tự lấy";
  const { label, cls, showReceive } = getTakeawayStatus(order);
  const isDone = !!order.completedAt;

  return (
    <div className="rounded-xl bg-white">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="min-w-0">
          <p className="text-small-m font-semibold text-text-primary">
            {typeLabel} · {time}
          </p>
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xxsmall font-medium ${cls}`}>
            {label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <p className={`text-small font-semibold ${isDone ? "text-text-secondary" : "text-primary"}`}>
            {formatCurrency(order.totalAmount)}đ
          </p>
          <Chevron isExpanded={isExpanded} />
        </div>
      </button>

      {/* Nút "Đã nhận" cho đơn đã xong, chưa hoàn thành */}
      {showReceive && (
        <div className="px-4 pb-3">
          <button
            onClick={onReceive}
            disabled={isConfirming}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#1D9E75] py-2.5 text-small-m font-semibold text-white active:opacity-80 disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {isConfirming ? "Đang xác nhận..." : "Đã nhận"}
          </button>
          <p className="mt-1.5 text-center text-xxxsmall text-text-secondary">
            Tự hoàn thành sau 30 phút nếu không bấm
          </p>
        </div>
      )}

      {isExpanded && <ItemsList isLoadingItems={isLoadingItems} items={items} />}
    </div>
  );
}
