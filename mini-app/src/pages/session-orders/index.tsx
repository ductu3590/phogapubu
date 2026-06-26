import { useState, useEffect } from "react";
import { useSnackbar } from "zmp-ui";
import { useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app.store";
import { useSessionOrders } from "@/services/order/order.queries";
import { useCallStaff } from "@/services/order/order.mutations";
import { orderService } from "@/services/order/order.api";
import { supabase } from "@/services/supabase";
import { formatCurrency } from "@/utils/format";
import { GET_SESSION_ORDERS_KEY } from "@/constants/api";
import type { SessionOrder, OrderItem } from "@/types/order.types";

const UNPAID_STATUSES = new Set(["pending", "confirmed", "cooking", "ready"]);

// Hình thức thanh toán + trạng thái thanh toán
function getPaymentInfo(
  paymentMethod: "zalopay" | "cash",
  status: string,
): { icon: string; label: string; paid: boolean } {
  if (paymentMethod === "zalopay") {
    return { icon: "💳", label: "ZaloPay", paid: status !== "pending" };
  }
  return { icon: "💵", label: "Tiền mặt", paid: status === "paid" };
}

export default function SessionOrdersPage() {
  const { zaloUserId, tableId, tableNumber, storeId } = useAppStore();
  const { openSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const [calledAt, setCalledAt] = useState<number | null>(null);

  // Expandable cards state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadingItemsId, setLoadingItemsId] = useState<string | null>(null);
  const [cachedItems, setCachedItems] = useState<Record<string, OrderItem[]>>({});

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

  // Mở/đóng chi tiết đơn, fetch items lần đầu
  const handleToggleExpand = async (orderId: string) => {
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

  // Chưa quét QR
  if (!zaloUserId || !tableId) {
    return (
      <div className="flex h-full flex-col bg-[#F7F8FA]">
        <div
          className="flex-shrink-0 bg-white px-4 pb-3 shadow-sm"
          style={{ paddingTop: "calc(var(--zaui-safe-area-inset-top, 0px) + 16px)" }}
        >
          <p className="text-xlarge-sb font-bold text-text-primary">Đã gọi</p>
        </div>
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
      <div
        className="flex-shrink-0 bg-white px-4 pb-2 shadow-sm"
        style={{ paddingTop: "calc(var(--zaui-safe-area-inset-top, 0px) + 16px)" }}
      >
        <p className="text-xlarge-sb font-bold text-text-primary">Đã gọi</p>
        {tableNumber && <p className="text-small text-text-secondary">{tableNumber}</p>}
      </div>

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
          <div className="mx-3.5 mt-3 space-y-3">
            {[1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-white" />)}
          </div>
        ) : !orders || orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="text-4xl">🍽️</div>
            <p className="font-medium text-text-primary">Chưa gọi món nào</p>
            <p className="text-small text-text-secondary">Vào tab Menu để chọn món nhé!</p>
          </div>
        ) : (
          <>
            <div className="mx-3.5 mt-3 space-y-3">
              {orders.map((order, idx) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  label={`Lần ${orders.length - idx}`}
                  isExpanded={expandedId === order.id}
                  isLoadingItems={loadingItemsId === order.id}
                  items={cachedItems[order.id] ?? null}
                  paymentInfo={getPaymentInfo(order.paymentMethod, order.status)}
                  onToggle={() => void handleToggleExpand(order.id)}
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

// --- Sub-components ---

function OrderCard({
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
        {/* Trái: "Lần 1 · 10:37" + hình thức / trạng thái thanh toán */}
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

        {/* Phải: số tiền + chevron */}
        <div className="flex items-center gap-2">
          <p className="text-small font-semibold text-primary">
            {formatCurrency(order.totalAmount)}đ
          </p>
          <svg
            viewBox="0 0 24 24"
            className={`h-4 w-4 text-neutral300 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Chi tiết món khi expand */}
      {isExpanded && (
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
      )}
    </div>
  );
}
