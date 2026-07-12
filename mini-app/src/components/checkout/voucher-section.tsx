import { useEffect, useState } from "react";
import {
  voucherService,
  estimateDiscount,
  MyVoucher,
} from "@/services/voucher/voucher.api";

// Section mã giảm giá ở checkout. TỰ BỌC lỗi: voucher chết chỉ ẩn section,
// KHÔNG được chặn luồng đặt món (giống SpinSection).
// - Tự load mã của khách (get_my_vouchers theo Zalo UID), tự chọn mã giảm sâu nhất.
// - Ô nhập mã cho shipper lần đầu (checkout là bước kích hoạt — khoá UID khi tạo đơn).
export default function VoucherSection({
  storeId,
  zaloUserId,
  subtotal,
  selected,
  onSelect,
}: {
  storeId: string;
  zaloUserId: string | null;
  subtotal: number;
  selected: MyVoucher | null;
  onSelect: (v: MyVoucher | null) => void;
}) {
  const [vouchers, setVouchers] = useState<MyVoucher[]>([]);
  const [showInput, setShowInput] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [inputError, setInputError] = useState("");
  const [checking, setChecking] = useState(false);

  // Load mã của khách + tự chọn mã giảm sâu nhất (1 lần khi vào trang)
  useEffect(() => {
    if (!zaloUserId) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await voucherService.getMyVouchers(storeId, zaloUserId);
        if (cancelled || list.length === 0) return;
        setVouchers(list);
        const best = [...list].sort(
          (a, b) => estimateDiscount(b, subtotal) - estimateDiscount(a, subtotal),
        )[0];
        onSelect(best);
      } catch {
        /* voucher lỗi → im lặng, không chặn đặt món */
      }
    })();
    return () => {
      cancelled = true;
    };
    // subtotal cố ý KHÔNG nằm trong deps: chỉ auto-chọn 1 lần lúc vào trang,
    // khách đổi số lượng món không làm nhảy mã đã chọn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, zaloUserId]);

  const applyCode = async () => {
    const code = codeInput.trim();
    if (!code || !zaloUserId) return;
    setChecking(true);
    setInputError("");
    try {
      const res = await voucherService.check(storeId, code, zaloUserId, subtotal);
      if (!res.valid) {
        setInputError(res.reason);
        return;
      }
      const v: MyVoucher = {
        id: `manual-${res.code}`,
        code: res.code,
        label: res.label,
        kind: "shipper",
        discount_type: res.discount_type,
        discount_value: res.discount_value,
        max_discount: res.max_discount,
        expires_at: null,
      };
      onSelect(v);
      setShowInput(false);
      setCodeInput("");
    } catch {
      setInputError("Không kiểm tra được mã, thử lại.");
    } finally {
      setChecking(false);
    }
  };

  // Không có UID → không dùng được mã (server cũng sẽ từ chối) → ẩn hẳn
  if (!zaloUserId) return null;
  if (vouchers.length === 0 && !selected && !showInput) {
    return (
      <div className="mx-3.5 mt-3 rounded-xl bg-white px-4 py-3">
        <button
          onClick={() => setShowInput(true)}
          className="text-small font-medium text-primary"
        >
          🎟️ Nhập mã giảm giá
        </button>
      </div>
    );
  }

  return (
    <div className="mx-3.5 mt-3 rounded-xl bg-white px-4 py-4">
      <p className="mb-3 text-large-m font-semibold">Mã giảm giá</p>

      {selected && (
        <div className="flex items-center gap-3 rounded-xl border-2 border-primary bg-primary/5 p-3">
          <span className="text-2xl">🎟️</span>
          <div className="flex-1">
            <p className="text-small-m font-semibold text-text-primary">{selected.label}</p>
            <p className="text-xxsmall text-text-secondary">
              Giảm {estimateDiscount(selected, subtotal).toLocaleString("vi-VN")}đ
              {selected.expires_at &&
                ` • HSD ${new Date(selected.expires_at).toLocaleDateString("vi-VN")}`}
            </p>
          </div>
          <button
            onClick={() => onSelect(null)}
            className="rounded-lg px-2 py-1 text-small text-text-secondary"
          >
            ✕
          </button>
        </div>
      )}

      {!selected &&
        vouchers.map((v) => (
          <button
            key={v.id}
            onClick={() => onSelect(v)}
            className="mb-2 flex w-full items-center gap-3 rounded-xl border-2 border-neutral100 p-3 text-left"
          >
            <span className="text-2xl">🎟️</span>
            <div className="flex-1">
              <p className="text-small-m font-semibold text-text-primary">{v.label}</p>
              <p className="text-xxsmall text-text-secondary">
                Giảm {estimateDiscount(v, subtotal).toLocaleString("vi-VN")}đ
              </p>
            </div>
          </button>
        ))}

      {showInput ? (
        <div className="mt-2">
          <div className="flex gap-2">
            <input
              value={codeInput}
              onChange={(e) => {
                setCodeInput(e.target.value.toUpperCase());
                setInputError("");
              }}
              placeholder="Nhập mã (VD SHIP-X7K2M9)"
              className="flex-1 rounded-xl border border-neutral100 px-3 py-2.5 text-sm uppercase outline-none focus:border-primary"
            />
            <button
              onClick={() => void applyCode()}
              disabled={checking || !codeInput.trim()}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {checking ? "..." : "Áp dụng"}
            </button>
          </div>
          {inputError && <p className="mt-1 text-xs text-red-500">{inputError}</p>}
        </div>
      ) : (
        <button
          onClick={() => setShowInput(true)}
          className="mt-2 text-xxsmall font-medium text-primary"
        >
          + Nhập mã khác
        </button>
      )}
    </div>
  );
}
