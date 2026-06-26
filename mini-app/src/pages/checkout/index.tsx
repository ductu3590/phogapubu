import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCartStore } from "@/stores/cart.store";
import { useAppStore, PaymentMethod } from "@/stores/app.store";
import { useCreateOrder } from "@/services/order/order.mutations";
import { paymentService } from "@/services/payment.service";
import { Button, Modal, useSnackbar } from "zmp-ui";
import { orderService } from "@/services/order/order.api";
import { formatCurrency } from "@/utils/format";
import { calculateCartTotal } from "@/utils/cart";
import QuantityStepper from "@/components/common/quantity-stepper";
import NoteInput from "@/components/common/note-input";

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { openSnackbar } = useSnackbar();
  const [note, setNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("zalopay");
  const [isProcessing, setIsProcessing] = useState(false);
  // Đơn ZaloPay đang chờ xử lý (kèm capability token để chuyển sang tiền mặt nếu bỏ dở)
  const [pendingZp, setPendingZp] = useState<{ id: string; token: string | null } | null>(null);

  const { items: cartItems, updateQuantity, clearCart } = useCartStore();
  const { storeId, tableId, tableNumber, zaloUserId } = useAppStore();
  const { mutate: createOrder, isPending } = useCreateOrder();

  const totalAmount = calculateCartTotal(cartItems);

  const handleOrder = () => {
    if (cartItems.length === 0) {
      openSnackbar({ text: "Giỏ hàng trống", type: "warning" });
      return;
    }
    if (!storeId || !tableId) {
      openSnackbar({
        text: "Thiếu thông tin quán/bàn. Vui lòng quét lại QR.",
        type: "error",
      });
      return;
    }

    setIsProcessing(true);

    createOrder(
      {
        storeId,
        tableId,
        items: cartItems.map((item) => ({
          menuItemId: item.productId,
          name: item.productName,
          price: item.basePrice,
          quantity: item.quantity,
          note: item.note,
        })),
        note: note.trim() || undefined,
        paymentMethod,
        zaloUserId: zaloUserId || undefined,
      },
      {
        onSuccess: async (order) => {
          if (paymentMethod === "zalopay") {
            await handleZaloPayPayment(order.id, order.capabilityToken);
          } else {
            // Tiền mặt: navigate thẳng đến trang trạng thái
            clearCart();
            setIsProcessing(false);
            navigate(`/order-status/${order.id}`);
          }
        },
        onError: (err) => {
          setIsProcessing(false);
          openSnackbar({ text: `Đặt món thất bại: ${err.message}`, type: "error" });
        },
      },
    );
  };

  const handleZaloPayPayment = async (orderId: string, token: string | null) => {
    try {
      const outcome = await paymentService.payWithCheckoutSDK(orderId);
      if (outcome === "success") {
        clearCart();
        navigate(`/order-status/${orderId}`);
      } else {
        // Huỷ/thất bại ZaloPay (bắt qua PaymentDone + checkTransaction) →
        // KHÔNG huỷ đơn ở client — để server (checkout-notify) quyết định.
        // Đơn zalopay pending không vào bếp (kitchen filter), nên để pending là an toàn.
        // Hỏi khách có chuyển sang tiền mặt không.
        setPendingZp({ id: orderId, token });
      }
    } catch (_err) {
      // Lỗi tạo yêu cầu thanh toán (create-mac) → cũng mở dialog để khách chọn
      setPendingZp({ id: orderId, token });
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmCashFallback = async () => {
    if (!pendingZp) return;
    const { id, token } = pendingZp;
    try {
      // Cần capability token để đổi sang tiền mặt; nếu thiếu vẫn điều hướng (đơn giữ pending)
      if (token) await orderService.abandonToCash(id, token);
    } catch {
      // lỗi đổi sang cash vẫn điều hướng — đơn giữ pending, không chặn khách
    }
    setPendingZp(null);
    clearCart();
    navigate(`/order-status/${id}`);
  };

  const retryZaloPay = () => {
    const pending = pendingZp;
    setPendingZp(null);
    if (pending) handleZaloPayPayment(pending.id, pending.token);
  };

  const isLoading = isPending || isProcessing;

  return (
    <div className="flex h-full flex-col bg-[#F7F8FA]">
      <div className="no-scrollbar flex-1 overflow-y-auto pb-32">

        {/* Thông tin bàn */}
        <div className="mx-3.5 mt-4 flex items-center gap-3 rounded-xl bg-white px-4 py-3">
          <span className="text-2xl">🪑</span>
          <div>
            <p className="text-xxsmall text-text-secondary">Đang ngồi tại</p>
            <p className="text-normal-sb font-semibold text-text-primary">
              {tableNumber || "Bàn không xác định"}
            </p>
          </div>
        </div>

        {/* Danh sách món */}
        <div className="mx-3.5 mt-3 rounded-xl bg-white p-4">
          <p className="mb-3 text-large-m font-semibold">Món đã chọn</p>
          <div className="flex flex-col gap-4">
            {cartItems.map((item) => (
              <div key={item.id} className="flex items-center gap-3">
                {item.productImage ? (
                  <img
                    src={item.productImage}
                    alt={item.productName}
                    className="h-14 w-14 rounded-lg object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-neutral100 text-2xl">
                    🍽️
                  </div>
                )}
                <div className="flex flex-1 items-center justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-small-m font-medium text-text-primary line-clamp-2">
                      {item.productName}
                    </p>
                    <p className="text-xxsmall text-text-secondary">
                      {formatCurrency(item.basePrice)}đ
                    </p>
                  </div>
                  <QuantityStepper
                    variant="rounded"
                    value={item.quantity}
                    onDecrease={() =>
                      updateQuantity(item.id, Math.max(0, item.quantity - 1))
                    }
                    onIncrease={() => updateQuantity(item.id, item.quantity + 1)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Ghi chú */}
        <div className="mx-3.5 mt-3 rounded-xl bg-white px-4 py-3">
          <NoteInput
            label="Ghi chú cho bếp"
            placeholder="VD: Ít đường, không hành, ít cay..."
            maxLength={120}
            value={note}
            onChange={(val) => setNote(val)}
          />
        </div>

        {/* Hình thức thanh toán */}
        <div className="mx-3.5 mt-3 rounded-xl bg-white px-4 py-4">
          <p className="mb-3 text-large-m font-semibold">Thanh toán</p>
          <div className="flex flex-col gap-2">
            <PaymentOption
              id="zalopay"
              label="ZaloPay"
              sublabel="Thanh toán trong Zalo, nhanh 1 chạm"
              emoji="💳"
              selected={paymentMethod === "zalopay"}
              onSelect={() => setPaymentMethod("zalopay")}
            />
            <PaymentOption
              id="cash"
              label="Tiền mặt"
              sublabel="Thanh toán với nhân viên khi ra về"
              emoji="💵"
              selected={paymentMethod === "cash"}
              onSelect={() => setPaymentMethod("cash")}
            />
          </div>
        </div>

        {/* Tóm tắt tiền */}
        <div className="mx-3.5 mt-3 rounded-xl bg-white px-4 py-4">
          <div className="flex justify-between">
            <span className="text-small text-text-secondary">Tổng tiền món</span>
            <span className="text-small font-semibold">{formatCurrency(totalAmount)}đ</span>
          </div>
        </div>
      </div>

      {/* Dialog xác nhận chuyển sang tiền mặt khi ZaloPay bỏ dở/thất bại */}
      <Modal
        visible={pendingZp !== null}
        title="Thanh toán chưa hoàn tất"
        description="Bạn muốn chuyển sang trả tiền mặt (thu khi ra về) hay thử lại ZaloPay?"
        onClose={() => setPendingZp(null)}
        actions={[
          {
            text: "Trả tiền mặt",
            highLight: true,
            onClick: () => { void confirmCashFallback(); },
          },
          {
            text: "Thử lại ZaloPay",
            onClick: retryZaloPay,
          },
        ]}
      />

      {/* Nút đặt món — fixed bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-divider01 bg-white px-4 py-4 pb-5">
        <div className="mb-2 flex justify-between px-1">
          <span className="text-small text-text-secondary">Tổng cộng</span>
          <span className="text-large-m font-bold text-primary">
            {formatCurrency(totalAmount)}đ
          </span>
        </div>
        <Button
          onClick={handleOrder}
          disabled={isLoading || cartItems.length === 0}
          className="w-full rounded-xl bg-primary py-3 font-semibold text-white active:bg-primary disabled:opacity-50"
          fullWidth
        >
          {isLoading
            ? paymentMethod === "zalopay" && isPending
              ? "Đang tạo đơn..."
              : "Đang mở ZaloPay..."
            : paymentMethod === "zalopay"
              ? "Đặt món & Thanh toán ZaloPay"
              : "Đặt món (Trả tiền mặt)"}
        </Button>
      </div>
    </div>
  );
}

function PaymentOption({
  id,
  label,
  sublabel,
  emoji,
  selected,
  onSelect,
}: {
  id: string;
  label: string;
  sublabel: string;
  emoji: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition-colors ${
        selected
          ? "border-primary bg-primary/5"
          : "border-neutral100 bg-white"
      }`}
    >
      <span className="text-2xl">{emoji}</span>
      <div className="flex-1">
        <p className="text-small-m font-semibold text-text-primary">{label}</p>
        <p className="text-xxsmall text-text-secondary">{sublabel}</p>
      </div>
      <div
        className={`h-5 w-5 rounded-full border-2 transition-colors ${
          selected ? "border-primary bg-primary" : "border-neutral100"
        }`}
      >
        {selected && (
          <div className="flex h-full w-full items-center justify-center">
            <div className="h-2 w-2 rounded-full bg-white" />
          </div>
        )}
      </div>
    </button>
  );
}
