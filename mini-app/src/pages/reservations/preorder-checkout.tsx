import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSnackbar } from "zmp-ui";
import { getBookingAccess } from "@/services/reservation/reservation-storage";
import { useCustomerReservation } from "@/services/reservation/reservation.queries";
import { submitPreorder } from "@/services/reservation/preorder.api";
import { useAppStore } from "@/stores/app.store";
import { usePreorderCartStore } from "@/stores/preorder-cart.store";
import SectionCard from "@/components/ui/section-card";
import StickyActionBar from "@/components/ui/sticky-action-bar";
import ConfirmSheet from "@/components/ui/confirm-sheet";
import QuantityStepper from "@/components/common/quantity-stepper";
import { CalendarDaysIcon, FileTextIcon, LockIcon, UsersIcon, UtensilsIcon } from "@/components/common/icons";
import { formatCurrency } from "@/utils/format";
import { formatReservationTime } from "@/utils/reservation-display";
import { preorderTotals } from "@/utils/preorder-totals";
import { errorMessage } from "@/utils/booking-validation";

const NOTE_MAX = 1000; // khớp write_preorder_revision (server từ chối > 1000)

// Xác nhận món đặt trước (Stitch m05). Bỏ "Phí phục vụ miễn phí", "Sơ chế sẵn sàng" (không có dữ
// liệu thật). Sửa 2 lỗi cũ: tiền từng dòng bỏ topping (lệch tổng) và câu lỗi server bị che.
export default function ReservationPreorderCheckoutPage() {
  const { reservationId = "" } = useParams();
  const navigate = useNavigate();
  const { openSnackbar } = useSnackbar();
  const { storeId, paymentTiming } = useAppStore();
  const access = getBookingAccess(storeId, reservationId);
  const booking = useCustomerReservation(access, reservationId);
  const drafts = usePreorderCartStore((s) => s.drafts);
  const requestId = usePreorderCartStore((s) => s.requestId);
  const clear = usePreorderCartStore((s) => s.clear);
  const updateQuantity = usePreorderCartStore((s) => s.updateQuantity);
  const items = drafts[`${storeId}:${reservationId}`]?.items ?? [];
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  if (!access) return <p className="p-4 text-small text-text-secondary">Không tìm thấy quyền đặt món trước trên thiết bị này.</p>;
  const totals = preorderTotals(items);
  const backToMenu = () => navigate(`/reservations/${reservationId}/preorder`, { replace: true });

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="grid size-16 place-items-center rounded-full bg-primary/10 text-primary"><UtensilsIcon className="size-8" /></span>
        <p className="text-small text-text-secondary">Chưa chọn món nào để đặt trước.</p>
        <button type="button" onClick={backToMenu} className="rounded-full bg-primary px-5 py-2.5 text-small-m font-bold text-white">Chọn món</button>
      </div>
    );
  }

  const send = async () => {
    if (sending) return;
    setSending(true);
    setError("");
    try {
      // requestId giữ nguyên cho tới khi gửi xong → bấm lại / rớt mạng không tạo 2 lượt (server idempotent).
      const batch = await submitPreorder(
        access,
        requestId(storeId, reservationId),
        items.map((x) => ({ productId: x.productId, quantity: x.quantity, note: x.note ?? null, variantId: x.variant?.id ?? null, toppingIds: x.selectedVariants.map((v) => v.optionId) })),
        note.trim() || null,
      );
      clear(storeId, reservationId);
      setConfirming(false);
      openSnackbar({ text: batch.customerMessage || "Đã gửi món đặt trước. Quán sẽ chuẩn bị theo giờ hẹn.", type: "success" });
      navigate(`/reservations/${reservationId}`, { replace: true });
    } catch (cause) {
      setConfirming(false);
      setError(errorMessage(cause, "Không thể gửi món, vui lòng thử lại."));
    } finally {
      setSending(false);
    }
  };

  const b = booking.data;
  return (
    <div className="flex h-full flex-col bg-background">
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-4">
        {/* Thẻ lịch hẹn */}
        {b && (
          <section className="mx-3 mt-3 rounded-2xl border border-primary/15 bg-primary/5 p-4">
            <span className="rounded-full bg-primary px-2.5 py-0.5 text-xxxsmall font-bold uppercase text-white">Món đặt trước</span>
            <p className="mt-2 text-large-m font-bold text-text-primary">{b.customerName}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-text-secondary">
              <span className="inline-flex items-center gap-1"><CalendarDaysIcon className="size-4" />{formatReservationTime(b.arrivalAt)}</span>
              <span className="inline-flex items-center gap-1"><UsersIcon className="size-4" />{b.partySize} khách</span>
            </div>
          </section>
        )}

        {/* Cảnh báo chỉ gửi một lần — khớp khoá sau khi gửi (mig 071) */}
        <section className="mx-3 mt-3 flex gap-3 rounded-2xl border border-warning-border bg-warning-bg p-4">
          <LockIcon className="mt-0.5 size-5 shrink-0 text-warning" />
          <div>
            <p className="text-small-m font-bold text-warning">Lưu ý quan trọng</p>
            <p className="mt-0.5 text-small text-text-primary">
              Món đặt trước chỉ gửi <b>một lần</b>. Gửi xong món sẽ được <b>khoá</b>, không sửa hoặc huỷ trên ứng dụng. Muốn gọi thêm thì gọi khi đến quán.
            </p>
          </div>
        </section>

        {/* Danh sách món */}
        <SectionCard title={`Danh sách món (${totals.count})`} icon={<UtensilsIcon />} action={<button type="button" onClick={backToMenu} className="text-small font-semibold text-primary">+ Thêm món</button>}>
          <ul className="divide-y divide-neutral100">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                {item.productImage && <img src={item.productImage} alt="" className="size-12 shrink-0 rounded-xl object-cover" draggable={false} />}
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-xsmall font-medium text-text-primary">{item.productName}</p>
                  {(item.variant || item.selectedVariants.length > 0) && (
                    <p className="line-clamp-1 text-xxsmall text-text-secondary">
                      {[item.variant?.name, ...item.selectedVariants.map((v) => `+ ${v.optionName}`)].filter(Boolean).join(", ")}
                    </p>
                  )}
                  <p className="mt-0.5 whitespace-nowrap text-xsmall font-bold text-primary">{formatCurrency(totals.lines[item.id] ?? 0)}đ</p>
                </div>
                <QuantityStepper
                  variant="rounded"
                  value={item.quantity}
                  onDecrease={() => updateQuantity(storeId, reservationId, item.id, item.quantity - 1)}
                  onIncrease={() => updateQuantity(storeId, reservationId, item.id, item.quantity + 1)}
                />
              </li>
            ))}
          </ul>
        </SectionCard>

        {/* Ghi chú cho bếp — server lưu vào đơn, phiếu POS in "Ghi chú đơn" */}
        <SectionCard title="Ghi chú gửi nhà bếp" subtitle={`Không bắt buộc · tối đa ${NOTE_MAX} ký tự`} icon={<FileTextIcon />}>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
            maxLength={NOTE_MAX}
            placeholder="Ví dụ: mang rau ra trước, lẩu ít cay…"
            className="min-h-20 w-full rounded-xl border border-neutral200 bg-neutral50 px-3 py-2.5 text-small outline-none focus:border-primary"
          />
        </SectionCard>

        {/* Tạm tính */}
        <SectionCard>
          <div className="flex items-baseline justify-between">
            <span className="text-normal-sb font-bold text-text-primary">Tổng tạm tính</span>
            <span className="text-large-m font-extrabold text-primary">{formatCurrency(totals.total)}đ</span>
          </div>
          <p className="mt-1 text-xxsmall text-text-secondary">
            {paymentTiming === "postpay" ? "Thanh toán tại quầy thu ngân sau khi dùng bữa." : "Quán sẽ hướng dẫn thanh toán khi bạn đến."}
          </p>
        </SectionCard>

        {error && <p className="mx-3 mt-3 rounded-xl bg-critical-bg p-3 text-small text-critical">{error}</p>}
      </div>

      <StickyActionBar variant="primary" aboveTabBar={false}>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={sending}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-normal-sb font-bold text-white shadow active:opacity-90 disabled:opacity-50"
        >
          <LockIcon className="size-5" />
          Khoá & gửi món đặt trước
        </button>
      </StickyActionBar>

      <ConfirmSheet
        open={confirming}
        title="Gửi món đặt trước?"
        description={`${totals.count} món · ${formatCurrency(totals.total)}đ. Gửi xong món sẽ được khoá, không sửa trên ứng dụng.`}
        confirmLabel="Khoá & gửi"
        cancelLabel="Xem lại"
        busy={sending}
        onConfirm={() => void send()}
        onClose={() => setConfirming(false)}
      />
    </div>
  );
}
