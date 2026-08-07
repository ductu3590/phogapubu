// Nhắc khách khi mở app mà còn đơn chưa thanh toán.
//
// Vì sao cần: banner "Thanh toán chưa thành công" chỉ sống trong trang giỏ hàng, mà giỏ hàng
// KHÔNG được lưu qua lần mở app. Khách thoát hẳn mini-app rồi quét QR lại sẽ rơi vào menu với
// giỏ trống → nút giỏ nổi tự ẩn (cart-float-button: itemCount === 0 thì return null) → không có
// đường nào vào /checkout → banner không bao giờ dựng được. Đơn vẫn sống nhưng không ai thấy.
//
// Hộp thoại này chỉ là ĐƯỜNG DẪN vào màn banner sẵn có, cố ý KHÔNG tự huỷ/tự nạp giỏ:
//   • "Tiếp tục đặt món" → sang /checkout, ở đó effect khôi phục tự đối chiếu DB và dựng banner.
//   • "Huỷ món"          → huỷ đơn cũ ngay tại đây.
// Giữ nguyên nguyên tắc "một chỗ đối chiếu duy nhất" — mọi quyết định về vòng đời đơn vẫn nằm ở
// applyPaymentState trong trang giỏ hàng, trừ đúng một lệnh huỷ tường minh do khách bấm.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSnackbar } from "zmp-ui";
import { orderService } from "@/services/order/order.api";
import { UnpaidOrder, loadUnpaidOrder, saveUnpaidOrder } from "@/services/unpaid-order";
import { formatCurrency } from "@/utils/format";

export default function UnpaidOrderPrompt() {
  const navigate = useNavigate();
  const { openSnackbar } = useSnackbar();
  const [order, setOrder] = useState<UnpaidOrder | null>(null);
  const [amount, setAmount] = useState(0);
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    const saved = loadUnpaidOrder();
    if (!saved) return;
    let aborted = false;
    (async () => {
      const st = await orderService.getPaymentState(saved.id);
      if (aborted) return;
      if (st.kind === "unpaid_pending") {
        setAmount(st.totalAmount);
        setOrder(saved);
        return;
      }
      // Đơn đã trả / đã huỷ / đã vào bếp → dọn key im lặng, không làm phiền khách.
      // query_failed thì KHÔNG đụng gì: giữ key để lần mở app sau thử lại.
      if (st.kind !== "query_failed") saveUnpaidOrder(null);
    })();
    return () => {
      aborted = true;
    };
  }, []);

  if (!order) return null;

  const handleContinue = () => {
    setOrder(null);
    navigate("/checkout");
  };

  const handleCancel = async () => {
    if (isCancelling) return;
    setIsCancelling(true);
    try {
      const res = await orderService.cancelOrder(order.id, order.token);
      if (res.result === "cancelled" || res.result === "already_cancelled") {
        saveUnpaidOrder(null);
        setOrder(null);
        openSnackbar({ text: "Đã huỷ đơn cũ.", type: "success" });
      } else if (res.reason === "already_paid") {
        // Bếp vừa xác nhận tiền — không huỷ được, và cũng không nên bắt khách trả lại
        saveUnpaidOrder(null);
        setOrder(null);
        openSnackbar({ text: "Đơn này đã được thanh toán.", type: "success" });
        navigate(`/order-status/${order.id}`);
      } else {
        openSnackbar({ text: "Chưa huỷ được đơn, vui lòng thử lại.", type: "error" });
      }
    } catch {
      openSnackbar({ text: "Lỗi mạng, chưa huỷ được đơn.", type: "error" });
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    // Cố ý KHÔNG cho bấm nền để đóng: khách phải chọn một trong hai, nếu không đơn cũ sẽ trôi
    // mất khỏi tầm mắt lần nữa. Không có ngõ cụt vì "Tiếp tục đặt món" luôn bấm được, kể cả
    // khi huỷ đang lỗi mạng.
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative rounded-t-2xl bg-white px-4 pt-5"
        style={{ paddingBottom: "calc(var(--zaui-safe-area-inset-bottom, 0px) + 20px)" }}
      >
        <p className="text-medium-m font-bold text-text-primary">
          Bạn còn đơn chưa thanh toán
        </p>
        <p className="mt-1 text-small text-text-secondary">
          Đơn {formatCurrency(amount)}đ đã gửi nhưng chưa trả tiền. Bếp chưa bắt đầu làm.
        </p>

        <button
          onClick={handleContinue}
          disabled={isCancelling}
          className="mt-4 w-full rounded-xl bg-primary py-3 text-small font-semibold text-white active:opacity-90 disabled:opacity-50"
        >
          Tiếp tục đặt món
        </button>
        <button
          onClick={handleCancel}
          disabled={isCancelling}
          className="mt-2 w-full rounded-xl border-2 border-neutral100 bg-white py-3 text-small font-semibold text-text-secondary active:opacity-70 disabled:opacity-50"
        >
          {isCancelling ? "Đang huỷ..." : "Huỷ món"}
        </button>
      </div>
    </div>
  );
}
