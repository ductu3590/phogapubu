import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useCartStore } from "@/stores/cart.store";
import { useAppStore, PaymentMethod } from "@/stores/app.store";
import { useCreateOrder } from "@/services/order/order.mutations";
import { orderService, OrderPaymentState } from "@/services/order/order.api";
import { UnpaidOrder, loadUnpaidOrder, saveUnpaidOrder } from "@/services/unpaid-order";
import type { CheckoutOutcome } from "@/services/checkout-result";
import { paymentService } from "@/services/payment.service";
import { Button, useSnackbar } from "zmp-ui";
import { formatCurrency } from "@/utils/format";
import { calculateCartTotal, calculateCartItemPrice } from "@/utils/cart";
import QuantityStepper from "@/components/common/quantity-stepper";
import NoteInput from "@/components/common/note-input";
import { GET_SESSION_ORDERS_KEY } from "@/constants/api";
import { isStoreOpen } from "@/utils/store-hours";
import VoucherSection from "@/components/checkout/voucher-section";
import { estimateDiscount, MyVoucher } from "@/services/voucher/voucher.api";

function isPhoneValid(phone: string): boolean {
  return /^0\d{9}$/.test(phone.replace(/\s/g, ""));
}

const TAKEAWAY_FORM_KEY = "mevo_takeaway_form";

interface TakeawayFormData {
  takeawayType: "pickup" | "delivery";
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
}

function loadTakeawayForm(): TakeawayFormData {
  const empty: TakeawayFormData = {
    takeawayType: "pickup",
    customerName: "",
    customerPhone: "",
    deliveryAddress: "",
  };
  try {
    const raw = localStorage.getItem(TAKEAWAY_FORM_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<TakeawayFormData>;
    return {
      takeawayType: parsed.takeawayType === "delivery" ? "delivery" : "pickup",
      customerName: parsed.customerName ?? "",
      customerPhone: parsed.customerPhone ?? "",
      deliveryAddress: parsed.deliveryAddress ?? "",
    };
  } catch {
    return empty;
  }
}

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { openSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [voucher, setVoucher] = useState<MyVoucher | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("zalo_checkout");
  const [isProcessing, setIsProcessing] = useState(false);
  // Đơn ZaloPay đang chờ xử lý (kèm capability token để huỷ đơn nếu khách muốn sửa món).
  // Khởi tạo ĐỒNG BỘ từ localStorage: banner phải có ngay từ khung hình đầu tiên, nếu không
  // sẽ có một khoảnh khắc nút "Đặt món" còn bấm được → tạo đơn thứ hai cho cùng giỏ hàng.
  // Việc hỏi DB sau đó (effect bên dưới) chỉ được phép GỠ banner xuống, không bao giờ dựng lên.
  const [unpaidOrder, setUnpaidOrder] = useState<UnpaidOrder | null>(() => loadUnpaidOrder());
  const [isCancelling, setIsCancelling] = useState(false);
  const isLocked = unpaidOrder !== null;
  // Khoá phần NHÌN THẤY của form khi banner hiện. Tầng store đã chặn mọi mutation giỏ hàng rồi
  // (kể cả từ trang menu); lớp này chỉ để khách hiểu vì sao bấm không ăn, khỏi tưởng app đơ.
  // Dùng pointer-events-none thay vì disabled từng component: cuộn trang vẫn chạy vì chạm rơi
  // xuống phần tử cha, và không phải sửa NoteInput/VoucherSection (chúng không có prop disabled).
  const lockedClass = isLocked ? "pointer-events-none opacity-50" : "";

  // Takeaway form state
  const initialForm = useRef(loadTakeawayForm()).current;
  const [takeawayType, setTakeawayType] = useState<"pickup" | "delivery">(initialForm.takeawayType);
  const [customerName, setCustomerName] = useState(initialForm.customerName);
  const [customerPhone, setCustomerPhone] = useState(initialForm.customerPhone);
  const [deliveryAddress, setDeliveryAddress] = useState(initialForm.deliveryAddress);
  const [nameError, setNameError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [addressError, setAddressError] = useState("");

  const { items: cartItems, updateQuantity, clearCart, setCartLock } = useCartStore();
  const { storeId, tableId, tableNumber, zaloUserId, deviceId, paymentMethods, paymentTiming, orderMode, isAcceptingOrders, servingHours } = useAppStore();
  const isTakeaway = orderMode === "takeaway";
  // Trả sau TẠI BÀN: khách không chọn phương thức, không mở SDK thanh toán — gọi món xong là
  // vào bếp luôn, tiền thu khi ra về. Đơn mang về/ship VẪN trả trước (spec §3, chưa có COD).
  const isPostpayDineIn = paymentTiming === "postpay" && !isTakeaway;
  const storeOpen = isStoreOpen({ isAcceptingOrders, servingHours });
  const singleMethod = paymentMethods.length === 1;

  // Làm nóng edge function ký MAC một lần khi vào trang, nếu đơn này sẽ dùng thanh toán online
  // (takeaway luôn dùng, dine-in dùng khi quán bật zalopay) → bấm thanh toán không phải chờ cold-start.
  const warmedRef = useRef(false);
  useEffect(() => {
    if (warmedRef.current) return;
    // Trả sau tại bàn không bao giờ mở SDK -> đừng làm nóng edge function ký MAC cho phí.
    const willUseOnlinePay =
      isTakeaway || (!isPostpayDineIn && paymentMethods.includes("zalo_checkout"));
    if (!willUseOnlinePay) return;
    warmedRef.current = true;
    void paymentService.warmupCheckout();
  }, [isTakeaway, paymentMethods, isPostpayDineIn]);

  // Đối chiếu đơn cũ với DB khi vào trang. Banner ĐÃ hiện sẵn từ useState khởi tạo đồng bộ;
  // effect này chỉ có quyền gỡ nó xuống. Lỗi mạng thì không gỡ gì cả.
  useEffect(() => {
    const saved = loadUnpaidOrder();
    if (!saved) return;
    setCartLock(saved.id); // khoá ngay, không chờ mạng
    let aborted = false;
    (async () => {
      const st = await orderService.getPaymentState(saved.id);
      if (aborted) return;
      // Trong lúc chờ mạng có thể đã có đơn khác — đừng áp trạng thái của đơn cũ lên đơn mới
      if (loadUnpaidOrder()?.id !== saved.id) return;
      applyPaymentState(st, saved.id);
    })();
    return () => {
      aborted = true;
    };
    // Chỉ chạy một lần khi vào trang
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Syncs selected method when store config loads (e.g. nếu zalopay bị tắt)
  useEffect(() => {
    if (paymentMethods.length === 0) return; // store config chưa load xong
    if (!paymentMethods.includes(paymentMethod)) {
      setPaymentMethod(paymentMethods[0]);
    }
  }, [paymentMethods, paymentMethod]);

  // Lưu form mang về để khách không phải nhập lại khi thanh toán lại
  useEffect(() => {
    if (!isTakeaway) return;
    const data: TakeawayFormData = { takeawayType, customerName, customerPhone, deliveryAddress };
    try {
      localStorage.setItem(TAKEAWAY_FORM_KEY, JSON.stringify(data));
    } catch {
      /* localStorage đầy hoặc bị chặn — bỏ qua */
    }
  }, [isTakeaway, takeawayType, customerName, customerPhone, deliveryAddress]);
  const isTakeawayFormValid =
    !isTakeaway ||
    (takeawayType === "pickup"
      ? customerName.trim() !== ""
      : customerName.trim() !== "" &&
        isPhoneValid(customerPhone) &&
        deliveryAddress.trim() !== "");

  const { mutate: createOrder, isPending } = useCreateOrder();

  const totalAmount = calculateCartTotal(cartItems);
  const discount = voucher ? estimateDiscount(voucher, totalAmount) : 0;
  const payableAmount = totalAmount - discount;

  // Bật/tắt banner ở cả ba nơi cùng lúc: state, localStorage, khoá giỏ hàng.
  const applyUnpaidOrder = (u: UnpaidOrder | null) => {
    setUnpaidOrder(u);
    saveUnpaidOrder(u);
    setCartLock(u ? u.id : null);
    // Đơn đang chờ trả tiền — đừng để app nhớ nó như "đơn mang về gần nhất"
    if (u) {
      try {
        localStorage.removeItem("mevo_last_takeaway_order");
      } catch {
        /* bỏ qua */
      }
    }
  };

  // Hàm đối chiếu DUY NHẤT. Mọi ngã rẽ ra khỏi banner đều đi qua đây.
  // Trả về true nếu đơn còn dùng được để thanh toán lại.
  const applyPaymentState = (st: OrderPaymentState, orderId: string): boolean => {
    if (st.kind === "unpaid_pending") return true;

    if (st.kind === "query_failed") {
      // KHÔNG đụng gì cả — giữ nguyên banner, giữ nguyên giỏ, giữ nguyên khoá.
      openSnackbar({ text: "Không kiểm tra được đơn, vui lòng thử lại.", type: "error" });
      return false;
    }

    if (st.kind === "cancelled") {
      // Đơn đã bị huỷ (sweep / nơi khác). Bỏ banner nhưng GIỮ giỏ để khách đặt lại ngay.
      applyUnpaidOrder(null);
      openSnackbar({ text: "Đơn cũ đã hết hạn. Mời bạn đặt lại.", type: "warning" });
      return false;
    }

    // settled — đơn đã có tiền hoặc đã vào bếp. Giờ mới được xoá giỏ.
    applyUnpaidOrder(null);
    clearCart();
    navigate(`/order-status/${orderId}`);
    return false;
  };

  const handleOrder = () => {
    if (cartItems.length === 0) {
      openSnackbar({ text: "Giỏ hàng trống", type: "warning" });
      return;
    }
    if (!storeOpen) {
      openSnackbar({
        text: isAcceptingOrders
          ? "Quán đang ngoài giờ phục vụ, chưa nhận đơn."
          : "Quán đang tạm nghỉ, chưa nhận đơn.",
        type: "warning",
      });
      return;
    }
    if (!storeId) {
      openSnackbar({ text: "Thiếu thông tin quán. Vui lòng quét lại QR.", type: "error" });
      return;
    }
    if (isTakeaway && !isTakeawayFormValid) {
      if (!customerName.trim()) setNameError("Vui lòng nhập tên");
      if (takeawayType === "delivery") {
        if (!isPhoneValid(customerPhone)) setPhoneError("Số điện thoại không hợp lệ (10 số, bắt đầu 0)");
        if (!deliveryAddress.trim()) setAddressError("Vui lòng nhập địa chỉ");
      }
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
          toppingIds: item.selectedVariants
            .filter((v) => v.groupId === "topping")
            .map((v) => v.optionId),
        })),
        note: note.trim() || undefined,
        // Ở trả sau tại bàn, create_order tự ép 'cash'; gửi gì cũng bị ghi đè — gửi 'cash'
        // cho khớp ý định, khỏi ai đọc code tưởng khách chọn ZaloPay.
        paymentMethod: isTakeaway ? "zalo_checkout" : isPostpayDineIn ? "cash" : paymentMethod,
        zaloUserId: zaloUserId || undefined,
        deviceId: deviceId || undefined,
        voucherCode: voucher?.code,
        ...(isTakeaway && {
          orderType: takeawayType,
          customerName: customerName.trim(),
          ...(takeawayType === "delivery" && {
            customerPhone: customerPhone.replace(/\s/g, ""),
            deliveryAddress: deliveryAddress.trim(),
          }),
        }),
      },
      {
        onSuccess: async (order) => {
          // Đơn mới đã tạo → banner của đơn cũ không còn nghĩa gì
          applyUnpaidOrder(null);
          // Invalidate tab "Đã gọi" để hiện đơn mới ngay lập tức
          void queryClient.invalidateQueries({ queryKey: [GET_SESSION_ORDERS_KEY] });
          if (!isPostpayDineIn && (isTakeaway || paymentMethod === "zalo_checkout")) {
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
          setVoucher(null);
          setIsProcessing(false);
          openSnackbar({ text: `Đặt món thất bại: ${err.message}`, type: "error" });
        },
      },
    );
  };

  const handleZaloPayPayment = async (orderId: string, token: string | null) => {
    let outcome: CheckoutOutcome = "pending_confirm";
    let threw = false;
    try {
      outcome = await paymentService.payWithCheckoutSDK(orderId);
    } catch {
      // Không lấy được MAC: mạng lỗi, hoặc 409 vì đơn không còn 'pending' (đã bị sweep / đã trả).
      // TUYỆT ĐỐI không xoá giỏ ở đây — phải hỏi DB xem thực sự chuyện gì đã xảy ra.
      threw = true;
    }
    setIsProcessing(false);

    if (threw) {
      // Vừa tạo đơn xong mà sheet chưa mở được → dựng banner TRƯỚC, rồi để đối chiếu gỡ xuống
      // nếu DB nói khác. Đối chiếu trước rồi mới dựng thì khi getPaymentState CŨNG lỗi
      // (query_failed) sẽ không dựng được gì: khách còn nguyên giỏ + nút đặt món còn sống
      // → bấm lại là đẻ đơn thứ hai.
      if (token) applyUnpaidOrder({ id: orderId, token });
      const st = await orderService.getPaymentState(orderId);
      if (applyPaymentState(st, orderId)) {
        openSnackbar({ text: "Chưa mở được thanh toán, vui lòng thử lại.", type: "error" });
      }
      return;
    }

    // Chỉ hai trạng thái này đủ chắc chắn để nói với khách "chưa thanh toán".
    if (outcome === "abandoned" || outcome === "failed") {
      if (!token) {
        // Không có capability token thì "Sửa món" không huỷ được đơn → banner thành ngõ cụt.
        // Fail-safe: đi đường cũ, khách vẫn thấy đơn ở trang trạng thái.
        clearCart();
        navigate(`/order-status/${orderId}`);
        return;
      }
      applyUnpaidOrder({ id: orderId, token });
      return; // Ở LẠI trang giỏ hàng, KHÔNG clearCart, KHÔNG navigate
    }

    // 'success' | 'pending_confirm' → giữ nguyên hành vi cũ. SDK báo RẤT thất thường khi khách mở
    // app ngân hàng ngoài rồi quay lại → luôn vào màn trạng thái "Đơn đã gửi / chờ quán xác nhận".
    // Quán xác nhận khi thấy tiền. Đơn không trả sẽ bị sweep_abandoned_orders (mig 031) huỷ —
    // nhưng đó là LAZY sweep, chỉ chạy khi chủ quán mở trang Đơn hàng, KHÔNG tự động sau 30'.
    // KHÔNG hiện dialog "thử lại" (gây hiểu nhầm cho khách đã chuyển khoản).
    applyUnpaidOrder(null);
    clearCart();
    navigate(`/order-status/${orderId}`);
  };

  // "Thanh toán lại" — trả tiền cho ĐÚNG đơn cũ, không tạo đơn mới.
  // Hỏi DB TRƯỚC khi mở SDK: đơn có thể đã bị sweep (mở ra sẽ ăn 409) hoặc đã được trả rồi.
  const handleRetryPayment = async () => {
    if (!unpaidOrder || isProcessing || isCancelling) return;
    setIsProcessing(true);
    const st = await orderService.getPaymentState(unpaidOrder.id);
    if (!applyPaymentState(st, unpaidOrder.id)) {
      setIsProcessing(false);
      return;
    }
    await handleZaloPayPayment(unpaidOrder.id, unpaidOrder.token);
  };

  // "Sửa món" — huỷ đơn cũ rồi mở khoá giỏ. CHỈ tắt banner khi RPC xác nhận đã huỷ thật.
  const handleEditItems = async () => {
    if (!unpaidOrder || isProcessing || isCancelling) return;
    setIsCancelling(true);
    try {
      const res = await orderService.cancelOrder(unpaidOrder.id, unpaidOrder.token);
      if (res.result === "cancelled" || res.result === "already_cancelled") {
        applyUnpaidOrder(null);
      } else if (res.reason === "already_paid") {
        // Đơn đã có tiền thật — không huỷ được, và cũng không nên bắt khách trả lại
        applyUnpaidOrder(null);
        clearCart();
        openSnackbar({ text: "Đơn này đã được thanh toán.", type: "success" });
        navigate(`/order-status/${unpaidOrder.id}`);
      } else {
        openSnackbar({ text: "Chưa huỷ được đơn, vui lòng thử lại.", type: "error" });
      }
    } catch {
      openSnackbar({ text: "Lỗi mạng, chưa huỷ được đơn.", type: "error" });
    } finally {
      setIsCancelling(false);
    }
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
          <div className={`mx-3.5 mt-4 rounded-xl bg-white p-4 ${lockedClass}`}>
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

            {/* SĐT — chỉ ship tận nhà */}
            {takeawayType === "delivery" && (
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
                    {item.selectedVariants.length > 0 && (
                      <p className="text-xxsmall text-text-secondary line-clamp-2">
                        {item.selectedVariants.map((v) => `+ ${v.optionName}`).join(", ")}
                      </p>
                    )}
                    <p className="text-xxsmall text-text-secondary">
                      {formatCurrency(calculateCartItemPrice(item))}đ
                    </p>
                  </div>
                  <QuantityStepper
                    variant="rounded"
                    disabled={isLocked}
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
        <div className={`mx-3.5 mt-3 rounded-xl bg-white px-4 py-3 ${lockedClass}`}>
          <NoteInput
            label="Ghi chú cho bếp"
            placeholder="VD: Ít đường, không hành, ít cay..."
            maxLength={120}
            value={note}
            onChange={(val) => setNote(val)}
          />
        </div>

        {/* Hình thức thanh toán — ẩn khi chỉ có 1 phương thức hoặc đang mang về */}
        {!singleMethod && !isTakeaway && !isPostpayDineIn && (
          <div className={`mx-3.5 mt-3 rounded-xl bg-white px-4 py-4 ${lockedClass}`}>
            <p className="mb-3 text-large-m font-semibold">Thanh toán</p>
            <div className="flex flex-col gap-2">
              {paymentMethods.includes("zalo_checkout") && (
                <PaymentOption
                  id="zalo_checkout"
                  label="ZaloPay"
                  sublabel="Thanh toán trong Zalo, nhanh 1 chạm"
                  emoji="💳"
                  selected={paymentMethod === "zalo_checkout"}
                  onSelect={() => setPaymentMethod("zalo_checkout")}
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

        {/* Mã giảm giá */}
        <div className={lockedClass}>
          <VoucherSection
            storeId={storeId ?? ""}
            zaloUserId={zaloUserId || null}
            subtotal={totalAmount}
            selected={voucher}
            onSelect={setVoucher}
          />
        </div>

        {/* Tóm tắt tiền */}
        <div className="mx-3.5 mt-3 rounded-xl bg-white px-4 py-4">
          <div className="flex justify-between">
            <span className="text-small text-text-secondary">Tổng tiền món</span>
            <span className="text-small font-semibold">{formatCurrency(totalAmount)}đ</span>
          </div>
          {discount > 0 && (
            <div className="mt-1.5 flex justify-between">
              <span className="text-small text-text-secondary">Giảm giá</span>
              <span className="text-small font-semibold text-green-600">
                −{formatCurrency(discount)}đ
              </span>
            </div>
          )}
        </div>
      </div>



      {/* Nút đặt món / banner chưa thanh toán — fixed bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-divider01 bg-white px-4 py-4 pb-5">
        {isLocked ? (
          <>
            <div className="mb-3 rounded-xl bg-[#FCEBEB] px-3 py-2.5">
              <p className="text-small font-semibold text-[#501313]">
                Thanh toán chưa thành công
              </p>
              <p className="mt-0.5 text-xxsmall leading-relaxed text-[#A32D2D]">
                {cartItems.length === 0
                  ? 'Đơn cũ chưa thanh toán xong. Bấm "Thanh toán lại" để trả tiền cho đơn đó, hoặc "Sửa món" để bỏ đơn và chọn lại.'
                  : "Bếp chưa bắt đầu làm đơn này. Bạn có thể thanh toán lại hoặc sửa món."}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleRetryPayment}
                disabled={isProcessing || isCancelling}
                className="flex-1 rounded-xl bg-primary py-3 font-semibold text-white active:bg-primary disabled:opacity-50"
              >
                {isProcessing ? "Đang mở..." : "Thanh toán lại"}
              </Button>
              <Button
                onClick={handleEditItems}
                disabled={isProcessing || isCancelling}
                className="flex-1 rounded-xl border-2 border-primary bg-white py-3 font-semibold text-primary disabled:opacity-50"
              >
                {isCancelling ? "Đang huỷ..." : "Sửa món"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-2 flex justify-between px-1">
              <span className="text-small text-text-secondary">Tổng cộng</span>
              <span className="text-large-m font-bold text-primary">
                {formatCurrency(payableAmount)}đ
              </span>
            </div>
            {!storeOpen && (
              <p className="mb-2 text-center text-xxsmall font-medium text-[#C0341A]">
                {isAcceptingOrders
                  ? "Quán đang ngoài giờ phục vụ, chưa nhận đơn."
                  : "Quán đang tạm nghỉ, chưa nhận đơn."}
              </p>
            )}
            <Button
              onClick={handleOrder}
              disabled={isLoading || cartItems.length === 0 || !isTakeawayFormValid || !storeOpen}
              className="w-full rounded-xl bg-primary py-3 font-semibold text-white active:bg-primary disabled:opacity-50"
              fullWidth
            >
              {isLoading
                ? isPending
                  ? "Đang tạo đơn..."
                  : "Đang mở thanh toán..."
                : isTakeaway
                  ? "Đặt mang về & Thanh toán"
                  : isPostpayDineIn
                    ? "Gọi món"
                    : paymentMethod === "zalo_checkout"
                      ? "Đặt món & Thanh toán"
                      : "Đặt món (Trả tiền mặt)"}
            </Button>
          </>
        )}
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
