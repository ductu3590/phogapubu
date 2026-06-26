import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
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
import { GET_SESSION_ORDERS_KEY } from "@/constants/api";

function isPhoneValid(phone: string): boolean {
  return /^0\d{9}$/.test(phone.replace(/\s/g, ""));
}

function generatePickupSlots(): string[] {
  const slots: string[] = [];
  const now = new Date();
  const start = new Date(now.getTime() + 30 * 60 * 1000);
  start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15, 0, 0);
  const end = new Date();
  end.setHours(22, 0, 0, 0);
  const cur = new Date(start);
  while (cur <= end) {
    const hh = String(cur.getHours()).padStart(2, "0");
    const mm = String(cur.getMinutes()).padStart(2, "0");
    slots.push(`${hh}:${mm}`);
    cur.setMinutes(cur.getMinutes() + 15);
  }
  return slots;
}

function slotToTimestamp(slot: string): string {
  const [hh, mm] = slot.split(":").map(Number);
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { openSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("zalopay");
  const [isProcessing, setIsProcessing] = useState(false);
  // Đơn ZaloPay đang chờ xử lý (kèm capability token để chuyển sang tiền mặt nếu bỏ dở)
  const [pendingZp, setPendingZp] = useState<{ id: string; token: string | null } | null>(null);

  // Takeaway form state
  const [takeawayType, setTakeawayType] = useState<"pickup" | "delivery">("pickup");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [pickupTime, setPickupTime] = useState(() => generatePickupSlots()[0] ?? "");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [nameError, setNameError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [addressError, setAddressError] = useState("");

  const { items: cartItems, updateQuantity, clearCart } = useCartStore();
  const { storeId, tableId, tableNumber, zaloUserId, paymentMethods, orderMode } = useAppStore();
  const isTakeaway = orderMode === "takeaway";
  const singleMethod = paymentMethods.length === 1;
  const pickupSlots = generatePickupSlots();

  // Syncs selected method when store config loads (e.g. nếu zalopay bị tắt)
  useEffect(() => {
    if (paymentMethods.length === 0) return; // store config chưa load xong
    if (!paymentMethods.includes(paymentMethod)) {
      setPaymentMethod(paymentMethods[0]);
    }
  }, [paymentMethods, paymentMethod]);
  const isTakeawayFormValid =
    !isTakeaway ||
    (customerName.trim() !== "" &&
      isPhoneValid(customerPhone) &&
      (takeawayType === "pickup" ? pickupTime !== "" : deliveryAddress.trim() !== ""));

  const { mutate: createOrder, isPending } = useCreateOrder();

  const totalAmount = calculateCartTotal(cartItems);

  const handleOrder = () => {
    if (cartItems.length === 0) {
      openSnackbar({ text: "Giỏ hàng trống", type: "warning" });
      return;
    }
    if (!storeId) {
      openSnackbar({ text: "Thiếu thông tin quán. Vui lòng quét lại QR.", type: "error" });
      return;
    }
    if (isTakeaway && !isTakeawayFormValid) {
      if (!customerName.trim()) setNameError("Vui lòng nhập tên");
      if (!isPhoneValid(customerPhone)) setPhoneError("Số điện thoại không hợp lệ (10 số, bắt đầu 0)");
      if (takeawayType === "delivery" && !deliveryAddress.trim()) setAddressError("Vui lòng nhập địa chỉ");
      return;
    }
    if (!isTakeaway && !tableId) {
      openSnackbar({ text: "Thiếu thông tin bàn. Vui lòng quét lại QR.", type: "error" });
      return;
    }

    setIsProcessing(true);

    createOrder(
      {
        storeId,
        tableId: isTakeaway ? null : tableId,
        items: cartItems.map((item) => ({
          menuItemId: item.productId,
          name: item.productName,
          price: item.basePrice,
          quantity: item.quantity,
          note: item.note,
        })),
        note: note.trim() || undefined,
        paymentMethod: isTakeaway ? "zalopay" : paymentMethod,
        zaloUserId: zaloUserId || undefined,
        ...(isTakeaway && {
          orderType: takeawayType,
          customerName: customerName.trim(),
          customerPhone: customerPhone.replace(/\s/g, ""),
          ...(takeawayType === "pickup" && { pickupTime: slotToTimestamp(pickupTime) }),
          ...(takeawayType === "delivery" && { deliveryAddress: deliveryAddress.trim() }),
        }),
      },
      {
        onSuccess: async (order) => {
          // Invalidate tab "Đã gọi" để hiện đơn mới ngay lập tức
          void queryClient.invalidateQueries({ queryKey: [GET_SESSION_ORDERS_KEY] });
          if (isTakeaway || paymentMethod === "zalopay") {
            if (isTakeaway) {
              localStorage.setItem("mevo_last_takeaway_order", order.id);
            }
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

        {/* Thông tin bàn — chỉ hiện khi ăn tại quán */}
        {!isTakeaway && (
          <div className="mx-3.5 mt-4 flex items-center gap-3 rounded-xl bg-white px-4 py-3">
            <span className="text-2xl">🪑</span>
            <div>
              <p className="text-xxsmall text-text-secondary">Đang ngồi tại</p>
              <p className="text-normal-sb font-semibold text-text-primary">
                {tableNumber || "Bàn không xác định"}
              </p>
            </div>
          </div>
        )}

        {/* Form mang về */}
        {isTakeaway && (
          <div className="mx-3.5 mt-4 rounded-xl bg-white p-4">
            {/* Toggle */}
            <div className="mb-4 flex gap-1 rounded-xl bg-neutral100 p-1">
              <button
                onClick={() => setTakeawayType("pickup")}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
                  takeawayType === "pickup"
                    ? "bg-primary text-white"
                    : "text-text-secondary"
                }`}
              >
                🚶 Tự qua lấy
              </button>
              <button
                onClick={() => setTakeawayType("delivery")}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
                  takeawayType === "delivery"
                    ? "bg-primary text-white"
                    : "text-text-secondary"
                }`}
              >
                🛵 Ship tận nhà
              </button>
            </div>

            {/* Tên */}
            <div className="mb-3">
              <label className="mb-1 block text-xs text-text-secondary">
                Tên {takeawayType === "pickup" ? "người lấy" : "người nhận"} *
              </label>
              <input
                value={customerName}
                onChange={(e) => { setCustomerName(e.target.value); setNameError(""); }}
                onBlur={() => { if (!customerName.trim()) setNameError("Vui lòng nhập tên"); }}
                placeholder="Nhập tên"
                className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${
                  nameError ? "border-red-400" : "border-neutral100 focus:border-primary"
                }`}
              />
              {nameError && <p className="mt-1 text-xs text-red-500">{nameError}</p>}
            </div>

            {/* SĐT */}
            <div className="mb-3">
              <label className="mb-1 block text-xs text-text-secondary">Số điện thoại *</label>
              <input
                value={customerPhone}
                onChange={(e) => { setCustomerPhone(e.target.value); setPhoneError(""); }}
                onBlur={() => { if (!isPhoneValid(customerPhone)) setPhoneError("Số điện thoại không hợp lệ"); }}
                placeholder="0901 234 567"
                inputMode="tel"
                className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${
                  phoneError ? "border-red-400" : "border-neutral100 focus:border-primary"
                }`}
              />
              {phoneError && <p className="mt-1 text-xs text-red-500">{phoneError}</p>}
            </div>

            {/* Giờ lấy */}
            {takeawayType === "pickup" && (
              <div className="mb-3">
                <label className="mb-1 block text-xs text-text-secondary">Giờ qua lấy *</label>
                <select
                  value={pickupTime}
                  onChange={(e) => setPickupTime(e.target.value)}
                  className="w-full rounded-xl border border-neutral100 px-3 py-2.5 text-sm outline-none focus:border-primary"
                >
                  {pickupSlots.length > 0
                    ? pickupSlots.map((slot) => (
                        <option key={slot} value={slot}>{slot}</option>
                      ))
                    : <option value="">Quán đã đóng cửa hôm nay</option>
                  }
                </select>
              </div>
            )}

            {/* Địa chỉ */}
            {takeawayType === "delivery" && (
              <div className="mb-3">
                <label className="mb-1 block text-xs text-text-secondary">Địa chỉ giao hàng *</label>
                <input
                  value={deliveryAddress}
                  onChange={(e) => { setDeliveryAddress(e.target.value); setAddressError(""); }}
                  onBlur={() => { if (!deliveryAddress.trim()) setAddressError("Vui lòng nhập địa chỉ"); }}
                  placeholder="Số nhà, đường, phường/xã, TP"
                  className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${
                    addressError ? "border-red-400" : "border-neutral100 focus:border-primary"
                  }`}
                />
                {addressError && <p className="mt-1 text-xs text-red-500">{addressError}</p>}
                <p className="mt-1.5 rounded-lg bg-[#FBF4EF] px-3 py-2 text-xs text-[#92400E]">
                  ⚠️ Phí ship do đơn vị giao hàng thu trực tiếp khi giao. Không tính trong đơn này.
                </p>
              </div>
            )}
          </div>
        )}

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

        {/* Hình thức thanh toán — ẩn khi chỉ có 1 phương thức hoặc đang mang về */}
        {!singleMethod && !isTakeaway && (
          <div className="mx-3.5 mt-3 rounded-xl bg-white px-4 py-4">
            <p className="mb-3 text-large-m font-semibold">Thanh toán</p>
            <div className="flex flex-col gap-2">
              {paymentMethods.includes("zalopay") && (
                <PaymentOption
                  id="zalopay"
                  label="ZaloPay"
                  sublabel="Thanh toán trong Zalo, nhanh 1 chạm"
                  emoji="💳"
                  selected={paymentMethod === "zalopay"}
                  onSelect={() => setPaymentMethod("zalopay")}
                />
              )}
              {paymentMethods.includes("cash") && (
                <PaymentOption
                  id="cash"
                  label="Tiền mặt"
                  sublabel="Thanh toán với nhân viên khi ra về"
                  emoji="💵"
                  selected={paymentMethod === "cash"}
                  onSelect={() => setPaymentMethod("cash")}
                />
              )}
            </div>
          </div>
        )}

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
          disabled={isLoading || cartItems.length === 0 || !isTakeawayFormValid}
          className="w-full rounded-xl bg-primary py-3 font-semibold text-white active:bg-primary disabled:opacity-50"
          fullWidth
        >
          {isLoading
            ? isPending
              ? "Đang tạo đơn..."
              : "Đang mở ZaloPay..."
            : isTakeaway
              ? "Đặt mang về & Thanh toán ZaloPay"
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
