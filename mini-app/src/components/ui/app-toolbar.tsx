import { useNavigate } from "react-router-dom";
import { ChevronLeftIcon, HeartIcon, ShoppingCartIcon, UserIcon, UtensilsIcon } from "@/components/common/icons";
import { useAppStore } from "@/stores/app.store";
import { useOaFollow } from "@/hooks/use-oa-follow";
import type { ToolbarMode } from "@/utils/nav-sets";
import { cn } from "@/utils/cn";
import CallStaffButton from "./call-staff-button";

const ZALO_CAPSULE_GAP = 96; // px — chỗ Zalo tự vẽ nút "··· ⊗" ở góc phải

// Thanh công cụ m06–m08 cho MỌI màn (spec Q3). Hàng 1: quay lại + tiêu đề. Hàng 2: logo quán
// (→ Thông tin nhà hàng) · Gọi NV · chip bàn · Quan tâm OA · giỏ · tài khoản.
export default function AppToolbar({ title, back, mode, cartCount }: { title?: string; back?: boolean; mode: ToolbarMode; cartCount: number }) {
  const navigate = useNavigate();
  const { storeName, storeLogoUrl, tableId, tableNumber } = useAppStore();
  const oa = useOaFollow();
  const initials = (storeName || "M").trim().split(/\s+/).filter(Boolean);
  const mark = (initials.length >= 2 ? initials[0][0] + initials[initials.length - 1][0] : initials[0]?.[0] ?? "M").toUpperCase();

  return (
    <header className="shrink-0 bg-surface shadow-[0_1px_0_rgba(15,23,42,0.06)]" style={{ paddingTop: "var(--zaui-safe-area-inset-top, 0px)" }}>
      <div className="flex h-11 items-center gap-1 pl-2" style={{ paddingRight: ZALO_CAPSULE_GAP }}>
        {back ? (
          <button type="button" aria-label="Quay lại" onClick={() => navigate(-1)} className="grid size-9 place-items-center rounded-full active:bg-neutral100">
            <ChevronLeftIcon className="size-5 text-text-primary" />
          </button>
        ) : <span className="w-2" />}
        <div className="min-w-0">
          <p className="truncate text-normal-sb font-bold leading-tight text-text-primary">{title || storeName || "MEVO"}</p>
          {title && storeName && <p className="truncate text-xxxsmall leading-tight text-text-secondary">{storeName}</p>}
        </div>
      </div>
      <div className="flex h-12 items-center gap-2 px-3 pb-2">
        <button type="button" aria-label="Thông tin nhà hàng" onClick={() => navigate("/store-info")} className="relative shrink-0">
          {storeLogoUrl ? (
            <img src={storeLogoUrl} alt="" className="size-9 rounded-full object-cover ring-2 ring-primary/20" draggable={false} />
          ) : (
            <span className="grid size-9 place-items-center rounded-full bg-primary text-small-m font-bold text-white">{mark || <UtensilsIcon className="size-4" />}</span>
          )}
        </button>
        {mode.callStaff && tableId && <CallStaffButton tableId={tableId} />}
        {mode.tableChip && tableNumber && (
          <span className="inline-flex h-8 min-w-0 items-center truncate rounded-full bg-neutral100 px-3 text-small-m font-semibold text-text-primary">{tableNumber}</span>
        )}
        <span className="flex-1" />
        {oa.available && (
          <button
            type="button"
            aria-label={oa.connected ? "Đã quan tâm quán" : "Quan tâm quán trên Zalo"}
            onClick={() => void oa.follow()}
            disabled={oa.connected || oa.pending}
            className={cn("inline-flex h-9 items-center gap-1 rounded-full px-2.5 text-xxsmall font-semibold", oa.connected ? "bg-primary/10 text-primary" : "border border-primary/40 text-primary active:bg-primary/10")}
          >
            <HeartIcon className={cn("size-4", oa.connected && "fill-current")} />
            {oa.connected ? "Đã quan tâm" : "Quan tâm"}
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
      </div>
    </header>
  );
}
