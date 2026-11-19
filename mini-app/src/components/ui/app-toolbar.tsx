import { useNavigate } from "react-router-dom";
import { ChevronLeftIcon, HeartIcon, ShoppingCartIcon, UserIcon, UtensilsIcon } from "@/components/common/icons";
import { useAppStore } from "@/stores/app.store";
import { useOaFollow } from "@/hooks/use-oa-follow";
import { useSnackbar } from "zmp-ui";
import { oaFollowMessage } from "@/utils/oa-follow-message";
import type { ToolbarMode } from "@/utils/nav-sets";
import { cn } from "@/utils/cn";
import { formatCurrency } from "@/utils/format";
import CallStaffButton from "./call-staff-button";

const ZALO_CAPSULE_GAP = 96; // px — chỗ Zalo tự vẽ nút "··· ⊗" ở góc phải

// Thanh công cụ m06–m08 cho MỌI màn (spec Q3, cập nhật 2026-10-08). Hàng 1 (nếu có): quay lại + tiêu đề.
// Hàng chính: logo quán → lời chào + tên quán → tim follow OA · giỏ · tài khoản — chừa 96px phải cho capsule Zalo.
// Tại quán: thêm hàng riêng Gọi NV + chip bàn.
// tableTotal / tableOpenedAt: tạm tính + giờ mở phiên bàn do server trả (get_table_session_bill). Chỉ theme
// garden dùng: chip "Bàn · tạm tính" ở thực đơn, dòng "Bàn · vào lúc …" dưới tiêu đề Đơn gọi; classic bỏ qua.
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

export default function AppToolbar({ title, back, mode, cartCount, tableTotal, tableOpenedAt }: { title?: string; back?: boolean; mode: ToolbarMode; cartCount: number; tableTotal?: number; tableOpenedAt?: string }) {
  const navigate = useNavigate();
  const { storeName, storeLogoUrl, tableId, tableNumber, theme } = useAppStore();
  const oa = useOaFollow();
  const { openSnackbar } = useSnackbar();
  const onHeart = async () => {
    const outcome = await oa.follow();
    const text = outcome && oaFollowMessage(outcome, storeName);
    if (text) openSnackbar({ text, type: outcome.kind === "error" ? "error" : "success", duration: 3000 });
  };
  const initials = (storeName || "M").trim().split(/\s+/).filter(Boolean);
  const mark = (initials.length >= 2 ? initials[0][0] + initials[initials.length - 1][0] : initials[0]?.[0] ?? "M").toUpperCase();

  const atTable = mode.callStaff && !!tableId;
  // Tim (quan tâm OA) · giỏ · tài khoản. Vào thường: ở hàng lời chào; quét QR bàn: dời xuống hàng Gọi NV.
  const actionIcons = (
    <>
      {oa.available && (
        <button
          type="button"
          aria-label={oa.connected ? "Đã quan tâm quán" : "Quan tâm quán trên Zalo"}
          // KHÔNG khoá khi đã quan tâm: bấm vẫn phải có phản hồi ("Bạn đã quan tâm…").
          onClick={() => void onHeart()}
          disabled={oa.pending}
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-full",
            oa.connected ? "bg-primary/10 text-primary" : "border border-primary/40 text-primary active:bg-primary/10",
          )}
        >
          <HeartIcon className={cn("size-4", oa.connected && "fill-current")} />
        </button>
      )}
      {mode.cart && (
        <button type="button" aria-label={`Giỏ hàng, ${cartCount} món`} onClick={() => navigate("/checkout")} className="relative grid size-9 place-items-center rounded-full active:bg-neutral100">
          <ShoppingCartIcon className="size-5 text-text-primary" />
          {cartCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-critical px-1 text-xxxsmall font-bold text-white">{cartCount > 9 ? "9+" : cartCount}</span>
          )}
        </button>
      )}
      <button type="button" aria-label="Tài khoản" onClick={() => navigate("/account")} className="grid size-9 place-items-center rounded-full active:bg-neutral100">
        <UserIcon className="size-5 text-text-primary" />
      </button>
    </>
  );

  // Theme garden vẽ riêng theo bản vẽ docs/design/yen-garden/apple-hig (2026-11-18): hàng 1 luôn là
  // logo + tên quán (Fraunces) + icon, cạnh cụm nút Zalo; hàng 2 là tiêu đề trang (Đơn gọi…) kèm nút
  // Gọi nhân viên, hoặc ở thực đơn tại bàn là Gọi nhân viên + chip "Bàn · tạm tính" + tim.
  // Trang con có nút quay lại vẫn dùng hàng back + tiêu đề chung bên dưới.
  if (theme === "garden" && !back) {
    const iconBtn = "relative grid size-10 shrink-0 place-items-center rounded-full active:bg-neutral100";
    const heart = oa.available && (
      <button type="button" aria-label={oa.connected ? "Đã quan tâm quán" : "Quan tâm quán trên Zalo"} onClick={() => void onHeart()} disabled={oa.pending} className={cn(iconBtn, "text-primary")}>
        <HeartIcon className={cn("size-[22px]", oa.connected && "fill-current")} />
      </button>
    );
    const cart = mode.cart && !title && (
      <button type="button" aria-label={`Giỏ hàng, ${cartCount} món`} onClick={() => navigate("/checkout")} className={iconBtn}>
        <ShoppingCartIcon className="size-[22px] text-text-primary" />
        {cartCount > 0 && (
          <span className="absolute right-0 top-0.5 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-[#C8462E] px-1 text-[11px] font-bold leading-none text-white">{cartCount > 9 ? "9+" : cartCount}</span>
        )}
      </button>
    );
    const account = (
      <button type="button" aria-label="Tài khoản" onClick={() => navigate("/account")} className={iconBtn}>
        <UserIcon className="size-[22px] text-text-primary" />
      </button>
    );
    // Dòng phụ dưới tiêu đề: bàn + giờ vào (vd "A2 · vào lúc 12:43").
    const subtitle = atTable && tableNumber ? `${tableNumber}${tableOpenedAt ? ` · vào lúc ${hhmm(tableOpenedAt)}` : ""}` : null;
    return (
      <header className="shrink-0 bg-background px-5" style={{ paddingTop: "var(--zaui-safe-area-inset-top, 0px)" }}>
        {/* Chừa 104px phải = 96 vùng nút Zalo + 8 khe (lề trang 20 đã nằm trong px-5). */}
        <div className="flex h-11 items-center gap-1" style={{ paddingRight: ZALO_CAPSULE_GAP + 8 - 20 }}>
          <button type="button" aria-label="Thông tin nhà hàng" onClick={() => navigate("/store-info")} className="mr-1 shrink-0">
            {storeLogoUrl ? (
              <img src={storeLogoUrl} alt="" className="size-9 rounded-full object-cover" draggable={false} />
            ) : (
              <span className="grid size-9 place-items-center rounded-full bg-primary text-small-m font-bold text-white">{mark}</span>
            )}
          </button>
          <p className="g-display min-w-0 flex-1 truncate text-[21px] leading-[1.15] text-primary">{storeName || "MEVO"}</p>
          {!atTable && !title && heart}
          {cart}
          {account}
        </div>
        {title ? (
          <div className="mt-2 flex items-center gap-2 pb-0.5">
            <div className="min-w-0 flex-1">
              <h1 className="g-display truncate text-[26px] leading-[1.1] text-text-primary">{title}</h1>
              {subtitle && <p className="tabular truncate text-[13px] leading-tight text-text-secondary">{subtitle}</p>}
            </div>
            {atTable && <CallStaffButton tableId={tableId!} />}
          </div>
        ) : atTable ? (
          <div className="mt-2 flex items-center gap-2">
            <CallStaffButton tableId={tableId!} compact />
            {mode.tableChip && tableNumber && (
              <span className="tabular inline-flex h-10 min-w-0 shrink items-center truncate whitespace-nowrap rounded-full bg-primary/15 px-3.5 text-[15px] font-semibold text-primary">
                {tableNumber}{tableTotal ? ` · ${formatCurrency(tableTotal)}đ` : ""}
              </span>
            )}
            <span className="flex-1" />
            {heart && <span className="-mr-1">{heart}</span>}
          </div>
        ) : null}
      </header>
    );
  }

  return (
    <header className="shrink-0 bg-surface shadow-[0_1px_0_rgba(15,23,42,0.06)] garden:bg-background garden:shadow-none" style={{ paddingTop: "var(--zaui-safe-area-inset-top, 0px)" }}>
      {(back || title) && (
        <div className="flex h-11 items-center gap-1 pl-2" style={{ paddingRight: ZALO_CAPSULE_GAP }}>
          {back ? (
            <button type="button" aria-label="Quay lại" onClick={() => navigate(-1)} className="grid size-9 place-items-center rounded-full active:bg-neutral100">
              <ChevronLeftIcon className="size-5 text-text-primary" />
            </button>
          ) : <span className="w-2" />}
          <div className="min-w-0">
            {title && <p className="g-display truncate text-normal-sb font-bold leading-tight text-text-primary garden:text-[26px] garden:leading-[1.1]">{title}</p>}
            {title && storeName && <p className="truncate text-xxxsmall leading-tight text-text-secondary garden:text-xsmall">{storeName}</p>}
          </div>
        </div>
      )}
      {/* Hàng chính (logo + lời chào + tim/giỏ/tài khoản) chỉ hiện ngoài trang chủ —
          các trang con chỉ giữ hàng back + tiêu đề như trước. */}
      {!title && (
      <div className="flex h-14 items-center gap-2 px-3 pb-2" style={{ paddingRight: ZALO_CAPSULE_GAP }}>
        <button type="button" aria-label="Thông tin nhà hàng" onClick={() => navigate("/store-info")} className="relative shrink-0">
          {storeLogoUrl ? (
            <img src={storeLogoUrl} alt="" className="size-9 rounded-full object-cover ring-2 ring-primary/20" draggable={false} />
          ) : (
            <span className="grid size-9 place-items-center rounded-full bg-primary text-small-m font-bold text-white">{mark || <UtensilsIcon className="size-4" />}</span>
          )}
        </button>
        {/* Lời chào 2 dòng (giống mẫu Nhà Hàng Phì Lũ 1): dòng nhỏ + tên quán đậm. (Garden vẽ riêng ở trên.) */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xxxsmall leading-tight text-text-secondary">Chào mừng bạn đến với</p>
          <p className="truncate text-normal-sb font-bold leading-tight text-text-primary">{storeName || "MEVO"}</p>
        </div>
        {!atTable && actionIcons}
      </div>
      )}
      {/* Hàng riêng cho chế độ tại quán: Gọi NV + chip bàn bên trái, tim · giỏ · tài khoản căn PHẢI
          (anh Tú 2026-10-09). Hàng này nằm dưới vùng capsule Zalo nên dùng được hết bề ngang. */}
      {atTable && (
        <div className="flex h-11 items-center gap-2 px-3 pb-2">
          <CallStaffButton tableId={tableId!} />
          {mode.tableChip && tableNumber && (
            <span className="inline-flex h-8 max-w-[96px] shrink-0 items-center truncate whitespace-nowrap rounded-full bg-neutral100 px-3 text-small-m font-semibold text-text-primary garden:h-10 garden:bg-primary/15 garden:px-4 garden:text-normal garden:text-primary">{tableNumber}</span>
          )}
          {!title && (
            <>
              <span className="flex-1" />
              {actionIcons}
            </>
          )}
        </div>
      )}
    </header>
  );
}
