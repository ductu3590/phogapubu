import { useState } from "react";
import { useSnackbar } from "zmp-ui";
import { useAppStore } from "@/stores/app.store";
import { useSessionOrders } from "@/services/order/order.queries";
import { useCallStaff } from "@/services/order/order.mutations";
import { formatCurrency } from "@/utils/format";
import type { SessionOrder } from "@/types/order.types";

// Nhãn trạng thái đơn
const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending:   { label: "Chờ xác nhận", color: "bg-yellow-100 text-yellow-700" },
  confirmed: { label: "Đã xác nhận",  color: "bg-blue-100 text-blue-700" },
  cooking:   { label: "Đang làm",     color: "bg-orange-100 text-orange-700" },
  ready:     { label: "Sẵn sàng",     color: "bg-green-100 text-green-700" },
  paid:      { label: "Đã thanh toán",color: "bg-gray-100 text-gray-600" },
};

const UNPAID_STATUSES = new Set(["pending", "confirmed", "cooking", "ready"]);

export default function SessionOrdersPage() {
  const { zaloUserId, tableId, tableNumber, storeId } = useAppStore();
  const { openSnackbar } = useSnackbar();
  const [calledAt, setCalledAt] = useState<number | null>(null);

  const { data: orders, isLoading } = useSessionOrders(zaloUserId, tableId);
  const { mutate: callStaff } = useCallStaff();

  // Tính tổng tiền và kiểm tra có đơn chưa thanh toán không
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

  // Chưa quét QR — không có zaloUserId hoặc tableId
  if (!zaloUserId || !tableId) {
    return (
      <div className="flex h-full flex-col bg-[#F7F8FA]">
        <PageHeader tableNumber={tableNumber} hasUnpaid={false} onCallStaff={handleCallStaff} />
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
      <PageHeader
        tableNumber={tableNumber}
        hasUnpaid={hasUnpaid}
        onCallStaff={handleCallStaff}
      />

      {/* Danh sách đơn */}
      <div className="no-scrollbar flex-1 overflow-y-auto pb-6">
        {isLoading ? (
          // Skeleton loading
          <div className="mx-3.5 mt-3 space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-white" />
            ))}
          </div>
        ) : !orders || orders.length === 0 ? (
          // Chưa gọi món nào
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="text-4xl">🍽️</div>
            <p className="font-medium text-text-primary">Chưa gọi món nào</p>
            <p className="text-small text-text-secondary">
              Vào tab Menu để chọn món nhé!
            </p>
          </div>
        ) : (
          <>
            {/* Danh sách từng đơn */}
            <div className="mx-3.5 mt-3 space-y-3">
              {orders.map((order, idx) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  label={`Lần ${orders.length - idx}`}
                />
              ))}
            </div>

            {/* Tổng cộng */}
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

function PageHeader({
  tableNumber,
  hasUnpaid,
  onCallStaff,
}: {
  tableNumber: string;
  hasUnpaid: boolean;
  onCallStaff: () => void;
}) {
  return (
    <div
      className="flex-shrink-0 bg-white px-4 pb-3 shadow-sm"
      style={{ paddingTop: "calc(var(--zaui-safe-area-inset-top, 0px) + 16px)" }}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xlarge-sb font-bold text-text-primary">Đã gọi</p>
          {tableNumber && (
            <p className="text-small text-text-secondary">{tableNumber}</p>
          )}
        </div>

        {/* Nút chuông — chỉ hiển thị khi có đơn chưa thanh toán */}
        {hasUnpaid && (
          <button
            onClick={onCallStaff}
            className="flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-small font-semibold text-white active:opacity-80"
          >
            <span>🔔</span>
            <span>Gọi thanh toán</span>
          </button>
        )}
      </div>
    </div>
  );
}

function OrderCard({
  order,
  label,
}: {
  order: SessionOrder;
  label: string;
}) {
  const statusInfo = STATUS_LABEL[order.status] ?? STATUS_LABEL.pending;

  return (
    <div className="rounded-xl bg-white px-4 py-3">
      <div className="flex items-center justify-between">
        <p className="text-small-m font-semibold text-text-primary">{label}</p>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xxsmall font-semibold ${statusInfo.color}`}
        >
          {statusInfo.label}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-small text-text-secondary">
          {new Date(order.createdAt).toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
        <p className="text-small font-semibold text-primary">
          {formatCurrency(order.totalAmount)}đ
        </p>
      </div>
    </div>
  );
}
